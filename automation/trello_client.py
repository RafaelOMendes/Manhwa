"""
Cliente fino para a API REST do Trello (https://developer.atlassian.com/cloud/trello/rest/).

Usa apenas TRELLO_KEY + TRELLO_TOKEN (auth simples via query string), sem SDK extra.
"""

from __future__ import annotations

import os
from typing import Any

import requests

API_BASE = "https://api.trello.com/1"


class TrelloClient:
    def __init__(self) -> None:
        self.key = os.environ["TRELLO_KEY"]
        self.token = os.environ["TRELLO_TOKEN"]
        self.board_id = os.environ["TRELLO_BOARD_ID"]

    def _auth(self) -> dict[str, str]:
        return {"key": self.key, "token": self.token}

    def _get(self, path: str, **params: Any) -> Any:
        resp = requests.get(f"{API_BASE}{path}", params={**self._auth(), **params}, timeout=20)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, **params: Any) -> Any:
        resp = requests.post(f"{API_BASE}{path}", params={**self._auth(), **params}, timeout=20)
        resp.raise_for_status()
        return resp.json()

    def _put(self, path: str, **params: Any) -> Any:
        resp = requests.put(f"{API_BASE}{path}", params={**self._auth(), **params}, timeout=20)
        resp.raise_for_status()
        return resp.json()

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
