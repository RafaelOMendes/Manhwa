"""
Configuração centralizada de logging para a automação Trello -> Claude Code.

Cria um logger raiz "automation" que grava em DOIS lugares ao mesmo tempo: console
(stdout, nível INFO) e um arquivo com timestamp em automation/logs/ (nível DEBUG,
com rotação: 10MB por arquivo, máximo 5 arquivos). Os outros módulos (claude_runner,
git_ops, telegram_notify, trello_client, claude_prompt, proc_utils) pegam um logger
filho com `get_logger(__name__)` - como filho, propaga pro logger "automation" e
herda os mesmos handlers, sem precisar reconfigurar nada.

Importado por watcher.py ANTES de qualquer outro módulo do projeto, pra garantir que o
arquivo de log já exista e capture tudo desde a primeira linha (inclusive imports que
disparem logging no nível do módulo).
"""

from __future__ import annotations

import logging
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path

AUTOMATION_DIR = Path(__file__).resolve().parent
LOGS_DIR = AUTOMATION_DIR / "logs"

_LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

_configured = False


def setup_logging(level: int = logging.DEBUG) -> logging.Logger:
    """Configura o logger "automation" (arquivo + console) na primeira chamada; chamadas
    seguintes só devolvem o logger já configurado (idempotente - segurança caso algum
    módulo importe logging_setup mais de uma vez ou fora de ordem)."""
    global _configured
    logger = logging.getLogger("automation")
    if _configured:
        return logger

    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_file = LOGS_DIR / f"{time.strftime('%Y-%m-%d_%H-%M-%S')}.log"

    formatter = logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT)

    file_handler = RotatingFileHandler(
        log_file, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.DEBUG)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.INFO)

    logger.setLevel(level)
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    logger.propagate = False

    _configured = True
    logger.debug(f"Logging inicializado - arquivo: {log_file}")
    return logger


def get_logger(name: str | None = None) -> logging.Logger:
    """Devolve o logger "automation" (sem nome) ou um filho "automation.<name>" (passe
    __name__ do módulo chamador). Garante que setup_logging() já rodou, mesmo se algum
    módulo for importado antes de watcher.py chamar setup_logging() explicitamente."""
    if not _configured:
        setup_logging()
    return logging.getLogger(f"automation.{name}") if name else logging.getLogger("automation")
