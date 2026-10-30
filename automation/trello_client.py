"""
Cliente fino para a API REST do Trello (https://developer.atlassian.com/cloud/trello/rest/).

Usa apenas TRELLO_KEY + TRELLO_TOKEN (auth simples via query string), sem SDK extra.
Em POST/PUT os demais parâmetros vão no corpo JSON (ver _request()).
"""

from __future__ import annotations

import os
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from logging_setup import get_logger, network_reason

API_BASE = "https://api.trello.com/1"
REQUEST_TIMEOUT_SECONDS = 20
# Limite de tamanho de um comentário no Trello - acima disso a API devolve 400.
COMMENT_MAX_CHARS = 16384

logger = get_logger(__name__)

# Erros de rede tratados como transitórios (o watcher faz backoff em vez de alarmar).
NETWORK_ERRORS = (requests.exceptions.ConnectionError, requests.exceptions.Timeout)


class TrelloNetworkError(Exception):
    """Trello inalcançável (DNS, conexão ou timeout, depois dos retries do adapter)."""


def _build_session() -> requests.Session:
    """O watcher.py fica horas fazendo polling - uma lentidão passageira da API do
    Trello (timeout de leitura, erro de conexão, 5xx) é normal nesse tempo todo, mas
    sem retry ela derrubava o tick() inteiro (nenhum card processado naquele ciclo) e
    disparava um alerta assustador no Telegram por causa de um blip que teria passado
    sozinho. Retry automático com backoff exponencial (1s, 2s, 4s) resolve isso na
    maioria dos casos sem que você nem perceba."""
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=frozenset(["GET", "POST", "PUT"]),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


class TrelloClient:
    def __init__(self) -> None:
        self.key = os.environ["TRELLO_KEY"]
        self.token = os.environ["TRELLO_TOKEN"]
        self.board_id = os.environ["TRELLO_BOARD_ID"]
        self._session = _build_session()

    def _auth(self) -> dict[str, str]:
        return {"key": self.key, "token": self.token}

    def _request(self, method: str, path: str, **params: Any) -> Any:
        logger.debug(f"{method} {path} params={ {k: v for k, v in params.items()} }")
        try:
            send = getattr(self._session, method.lower())
            if method == "GET":
                resp = send(f"{API_BASE}{path}", params={**self._auth(), **params}, timeout=REQUEST_TIMEOUT_SECONDS)
            else:
                # Corpo JSON, não query string: um comentário com o prompt inteiro
                # estourava o limite de URL do Trello (414 Request-URI Too Large).
                resp = send(f"{API_BASE}{path}", params=self._auth(), json=params, timeout=REQUEST_TIMEOUT_SECONDS)
            resp.raise_for_status()
        except NETWORK_ERRORS as exc:
            # Falha transitória de rede (DNS, conexão recusada, timeout): não é bug nem
            # erro da API, então uma linha curta de WARNING, sem traceback. A mensagem
            # original do requests carrega a URL com key/token, por isso não é repassada.
            reason = network_reason(exc)
            logger.warning(f"Trello {method} {path} indisponível: {reason}")
            raise TrelloNetworkError(reason) from None
        except requests.RequestException:
            logger.error(f"Falha na chamada Trello {method} {path}", exc_info=True)
            raise
        return resp.json()

    def _get(self, path: str, **params: Any) -> Any:
        return self._request("GET", path, **params)

    def _post(self, path: str, **params: Any) -> Any:
        return self._request("POST", path, **params)

    def _put(self, path: str, **params: Any) -> Any:
        return self._request("PUT", path, **params)

    # -- board / lists -----------------------------------------------------

    def get_lists(self) -> list[dict[str, Any]]:
        """Todas as listas (colunas) do board, na ordem em que aparecem."""
        return self._get(f"/boards/{self.board_id}/lists", fields="name,id")

    def get_cards(self) -> list[dict[str, Any]]:
        """Todos os cards abertos do board, com o idList (coluna atual) de cada um."""
        return self._get(
            f"/boards/{self.board_id}/cards",
            fields="name,desc,idList,shortUrl,dateLastActivity",
        )

    # -- card actions --------------------------------------------------------

    def move_card(self, card_id: str, list_id: str) -> None:
        self._put(f"/cards/{card_id}", idList=list_id)

    def comment_card(self, card_id: str, text: str) -> None:
        if len(text) > COMMENT_MAX_CHARS:
            suffix = f"\n\n… (cortado: limite de {COMMENT_MAX_CHARS} caracteres do Trello)"
            text = text[: COMMENT_MAX_CHARS - len(suffix)] + suffix
        self._post(f"/cards/{card_id}/actions/comments", text=text)

    def get_comments(self, card_id: str) -> list[dict[str, Any]]:
        actions = self._get(
            f"/cards/{card_id}/actions",
            filter="commentCard",
            fields="data,date",
            memberCreator_fields="fullName",
        )
        # Trello devolve do mais novo pro mais antigo -> inverte pra ordem cronológica.
        return list(reversed(actions))

    def add_label_name(self, card_id: str, color: str, name: str) -> None:
        """Ajuda a sinalizar erro/bloqueio visualmente no card (label vermelha 'bloqueado' etc)."""
        self._post(f"/cards/{card_id}/labels", color=color, name=name)


def resolve_list_ids(client: TrelloClient, name_by_env: dict[str, str]) -> dict[str, str]:
    """
    Recebe algo como {"TODO": "A Fazer", "DOING": "Em Andamento", ...} (valores vindos do .env)
    e devolve {"TODO": "<id da lista no Trello>", ...}, casando por nome (case-insensitive).
    Lança ValueError com uma mensagem clara se algum nome não bater com nenhuma lista do board.
    """
    lists = client.get_lists()
    by_name = {l["name"].strip().lower(): l["id"] for l in lists}
    resolved: dict[str, str] = {}
    missing: list[str] = []
    for key, wanted_name in name_by_env.items():
        found = by_name.get(wanted_name.strip().lower())
        if found is None:
            missing.append(wanted_name)
        else:
            resolved[key] = found
    if missing:
        available = ", ".join(l["name"] for l in lists)
        raise ValueError(
            "Essas listas não foram encontradas no board do Trello: "
            f"{missing}. Listas disponíveis no board: {available}. "
            "Confira os nomes em automation/.env (TRELLO_LIST_*)."
        )
    return resolved
