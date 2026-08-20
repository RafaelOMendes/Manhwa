"""
Persistência local do estado da automação Trello -> Gemini -> Claude Code -> Telegram.

Guarda, por card do Trello, em que lista ele foi visto da última vez que processamos
e alguns metadados (branch git criada, session_id do Claude Code, prompt gerado etc).
Isso é o que permite ao watcher.py saber "esse card já virou branch, não crio de novo"
mesmo se o script for reiniciado.

O arquivo fica em automation/state.json (ignorado pelo git, ver .gitignore).
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

STATE_PATH = Path(__file__).parent / "state.json"

_lock = threading.Lock()


def _default_state() -> dict[str, Any]:
    return {
        # cards: { <trello_card_id>: { "last_list_id": str, "branch": str|None,
        #                              "session_id": str|None, "stage": str } }
        "cards": {},
        # último idList de cada lista "ativa", usado só para checar se ficaram vazias
        "last_build_signature": None,
    }


def load() -> dict[str, Any]:
    with _lock:
        if not STATE_PATH.exists():
            return _default_state()
        try:
            with open(STATE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            return _default_state()
        data.setdefault("cards", {})
        data.setdefault("last_build_signature", None)
        return data


def save(data: dict[str, Any]) -> None:
    with _lock:
        tmp_path = STATE_PATH.with_suffix(".json.tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, STATE_PATH)


def get_card(state: dict[str, Any], card_id: str) -> dict[str, Any]:
    return state["cards"].setdefault(
        card_id,
        {
            "last_list_id": None,
            "branch": None,
            "session_id": None,
            "stage": None,  # None | "prompting" | "dev" | "test" | "done" | "blocked"
            "prompt": None,
        },
    )


def set_card(state: dict[str, Any], card_id: str, **fields: Any) -> None:
    card = get_card(state, card_id)
    card.update(fields)
    save(state)
