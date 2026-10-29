"""
Persistência local do estado da automação Trello -> Claude Code -> Telegram.

Guarda, por card do Trello, em que lista ele foi visto da última vez que processamos
e alguns metadados (branch git criada, session_id do Claude Code, prompt gerado etc).
Isso é o que permite ao watcher.py saber "esse card já virou branch, não crio de novo"
mesmo se o script for reiniciado.

O arquivo fica em automation/state.json (ignorado pelo git, ver .gitignore).

Também guarda, num arquivo SEPARADO (automation/usage_state.json, também ignorado
pelo git), o estado da janela de 5h de uso do Claude Code usado pela pausa
preventiva (ver usage_guard.py). Mesmo mecanismo (JSON com escrita atômica, mesmo
lock), mas arquivo próprio de propósito: o watcher carrega o state.json no começo
de cada tick e regrava o dict inteiro a cada set_card() - se o uso morasse ali, uma
atualização feita no meio de uma chamada ao Claude Code (dentro do tick) seria
sobrescrita pela cópia antiga que o watcher ainda tem em memória.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from logging_setup import get_logger

logger = get_logger(__name__)

STATE_PATH = Path(__file__).parent / "state.json"
USAGE_STATE_PATH = Path(__file__).parent / "usage_state.json"

_lock = threading.Lock()


def _default_state() -> dict[str, Any]:
    return {
        # cards: { <trello_card_id>: { "last_list_id": str, "branch": str|None,
        #                              "session_id": str|None, "stage": str } }
        "cards": {},
        # último idList de cada lista "ativa", usado só para checar se ficaram vazias
        "last_build_signature": None,
    }


def _read_json(path: Path) -> dict[str, Any] | None:
    """None se o arquivo não existe ou não deu pra ler (quem chama usa o padrão)."""
    with _lock:
        if not path.exists():
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            logger.error(f"Falha ao ler {path}, usando estado padrão", exc_info=True)
            return None


def _write_json(path: Path, data: dict[str, Any]) -> None:
    with _lock:
        tmp_path = path.with_suffix(".json.tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, path)


def load() -> dict[str, Any]:
    data = _read_json(STATE_PATH)
    if data is None:
        return _default_state()
    data.setdefault("cards", {})
    data.setdefault("last_build_signature", None)
    return data


def save(data: dict[str, Any]) -> None:
    _write_json(STATE_PATH, data)


def load_usage() -> dict[str, Any]:
    """Estado da janela de 5h de uso do Claude Code (formato definido em
    usage_guard.py). Dict vazio se ainda não existe."""
    data = _read_json(USAGE_STATE_PATH)
    return data if isinstance(data, dict) else {}


def save_usage(data: dict[str, Any]) -> None:
    _write_json(USAGE_STATE_PATH, data)


def get_card(state: dict[str, Any], card_id: str) -> dict[str, Any]:
    return state["cards"].setdefault(
        card_id,
        {
            "last_list_id": None,
            "branch": None,
            "session_id": None,
            "stage": None,  # None | "prompting" | "dev" | "test" | "done" | "blocked"
            "prompt": None,
            "model": None,  # "sonnet" | "opus" | None - escolhido pela etapa de rascunho do prompt
            "effort": None,  # "low" | "medium" | "high" | "xhigh" | "max" | None
            "areas": None,  # list["Back"|"Front"|"Mobile"] | None - None = desconhecido (builda por segurança)
        },
    )


def set_card(state: dict[str, Any], card_id: str, **fields: Any) -> None:
    card = get_card(state, card_id)
    card.update(fields)
    save(state)
