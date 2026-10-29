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
import re
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path

AUTOMATION_DIR = Path(__file__).resolve().parent
LOGS_DIR = AUTOMATION_DIR / "logs"

_LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

_configured = False

# Credenciais que o requests/urllib3 embutem nas mensagens de exceção (a URL completa,
# com a query string): `key=`/`token=` do Trello e o `/bot<token>/` da API do Telegram.
_SECRET_QUERY_RE = re.compile(r"(?i)\b(key|token|api_key|access_token)=[^&\s'\"<>)]+")
_TELEGRAM_BOT_RE = re.compile(r"/bot[^/\s'\"]+/")


def redact(text: str) -> str:
    """Troca valores de key=/token= (e o token do bot na URL do Telegram) por `***`."""
    text = _SECRET_QUERY_RE.sub(r"\1=***", text)
    return _TELEGRAM_BOT_RE.sub("/bot***/", text)


def network_reason(exc: BaseException) -> str:
    """Resumo curto (sem URL nem credenciais) do motivo de uma falha de rede."""
    text = str(exc)
    if "getaddrinfo" in text or "NameResolutionError" in text or "Name or service not known" in text:
        return "falha de resolução DNS (sem internet?)"
    if any(cls.__name__.endswith("Timeout") for cls in type(exc).__mro__):
        return "timeout"
    return f"erro de conexão ({type(exc).__name__})"


class RedactingFormatter(logging.Formatter):
    """Redige credenciais na linha final já formatada - cobre a mensagem, os args e o
    traceback (exc_info) de uma vez, então nenhum log vaza token nem em exceção."""

    def format(self, record: logging.LogRecord) -> str:
        return redact(super().format(record))


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

    formatter = RedactingFormatter(_LOG_FORMAT, datefmt=_DATE_FORMAT)

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
