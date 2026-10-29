"""
Envia mensagens de aviso pro seu Telegram via um bot (API HTTP simples do Telegram,
sem lib extra). Isso é separado da integração Telethon que o backend já usa pra
scraping - aqui é só um bot comum, criado no @BotFather (ver automation/SETUP.md).
"""

from __future__ import annotations

import os

import requests

from logging_setup import get_logger, network_reason

API_BASE = "https://api.telegram.org"

logger = get_logger(__name__)


def send_telegram_message(text: str) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        logger.debug(f"[telegram desativado - sem TELEGRAM_BOT_TOKEN/CHAT_ID] {text}")
        return

    try:
        resp = requests.post(
            f"{API_BASE}/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "disable_web_page_preview": False},
            timeout=15,
        )
    except requests.RequestException as exc:
        # Sem rede o Telegram também cai: aviso curto, sem traceback (a exceção do
        # requests carregaria a URL com o token do bot) e sem tentar de novo.
        logger.warning(f"[telegram] mensagem não enviada: {network_reason(exc)}")
        return
    if not resp.ok:
        logger.warning(f"[telegram] falha ao enviar mensagem ({resp.status_code}): {resp.text}")
