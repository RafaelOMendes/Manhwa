# -*- coding: utf-8 -*-
"""Logs de erro centralizados, organizados por data em `backend/logs/YYYY-MM-DD/`.

Cada chamada a `log_error()` grava um arquivo `.log` próprio (timestamp completo no
nome) dentro da pasta do dia, criando-a automaticamente se não existir. Desligável
via `ERROR_LOGGING_ENABLED=0` no ambiente. Nunca propaga falha de I/O — logging de
erro não pode derrubar o request que está tentando registrar.
"""
import os
import traceback
from datetime import datetime

LOGS_DIR = os.path.join(os.path.dirname(__file__), "logs")
ERROR_LOGGING_ENABLED = os.environ.get("ERROR_LOGGING_ENABLED", "1").strip() != "0"


def log_error(exc: BaseException, context: str = "") -> None:
    """Grava `exc` (com traceback) em `logs/<YYYY-MM-DD>/<YYYY-MM-DD_HH-MM-SS-ffffff>_error.log`."""
    if not ERROR_LOGGING_ENABLED:
        return
    try:
        now = datetime.now()
        day_dir = os.path.join(LOGS_DIR, now.strftime("%Y-%m-%d"))
        os.makedirs(day_dir, exist_ok=True)
        filename = f"{now.strftime('%Y-%m-%d_%H-%M-%S-%f')}_error.log"
        with open(os.path.join(day_dir, filename), "w", encoding="utf-8") as f:
            if context:
                f.write(f"Contexto: {context}\n")
            f.write(f"Timestamp: {now.isoformat()}\n")
            f.write(f"Erro: {exc}\n\n")
            f.write("".join(traceback.format_exception(type(exc), exc, exc.__traceback__)))
    except OSError:
        pass
