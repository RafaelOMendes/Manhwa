# -*- coding: utf-8 -*-
"""Testes do partial success de /api/manhwas/review-all e da classificação de erros.

Roda sem pytest e sem Telegram: `python test_review_all_partial.py`.

Usa um SQLite temporário (NUNCA o banco real — a `DATABASE_URL` é sobrescrita antes
de importar `database`) e um scraper falso, então pode rodar à vontade.

Cobre:
  1. `_get_topic_stats()` real, com um client falso, para cada tipo de erro.
  2. O endpoint com 5 manhwas (1 erro definitivo intencional): os outros 4 têm que
     ser persistidos no banco — nada de rollback cego.
  3. Falha de PERSISTÊNCIA: aí sim nada entra no banco (atomicidade da escrita).
"""
import asyncio
import os
import sys

# Precisa vir ANTES de importar `database` (load_dotenv não sobrescreve env já setada).
TEST_DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_test_review.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB_FILE.replace(os.sep, '/')}"

from sqlalchemy import select  # noqa: E402

import database  # noqa: E402
import main  # noqa: E402
from models import Manhwa as ManhwaModel  # noqa: E402
from telegram_scraper import (  # noqa: E402
    EMPTY_TOPIC,
    ERROR_ENTITY_NOT_FOUND,
    ERROR_INVALID_LINK,
    ERROR_PRIVATE_TOPIC,
    ERROR_TIMEOUT,
    TelegramManhwaScraper,
)

falhas = []


def check(condicao, descricao):
    if condicao:
        print(f"   ✅ {descricao}")
    else:
        print(f"   ❌ {descricao}")
        falhas.append(descricao)


# ---------------------------------------------------------------------------
# Parte 1 — _get_topic_stats() real, com client falso
# ---------------------------------------------------------------------------
class FakeFilenameAttr:
    """Imita DocumentAttributeFilename (o isinstance real é checado no scraper)."""

    def __init__(self, file_name):
        self.file_name = file_name


class FakeMessage:
    def __init__(self, file_name=None, reactions=0):
        if file_name is None:
            self.document = None
        else:
            from telethon.tl.types import DocumentAttributeFilename

            attr = DocumentAttributeFilename(file_name=file_name)
            self.document = type("Doc", (), {"attributes": [attr]})()
        if reactions:
            result = type("R", (), {"count": reactions})()
            self.reactions = type("Reactions", (), {"results": [result]})()
        else:
            self.reactions = None


class FakeClient:
    """Client mínimo: devolve `messages` ou levanta `raise_on_entity`."""

    def __init__(self, messages=None, raise_on_entity=None):
        self.messages = messages or []
        self.raise_on_entity = raise_on_entity

    async def get_dialogs(self):
        return []

    async def get_entity(self, _target):
        if self.raise_on_entity:
            raise self.raise_on_entity
        return object()

    def iter_messages(self, _chat, reply_to=None):
        mensagens = self.messages

        async def gerador():
            for m in mensagens:
                yield m

        return gerador()


class BareScraper:
    """Instância sem TelegramClient real — só o que `_get_topic_stats` usa."""

    _parse_telegram_link = TelegramManhwaScraper._parse_telegram_link
    _get_topic_stats = TelegramManhwaScraper._get_topic_stats

    def __init__(self, client):
        self.client = client


LINK_OK = "https://t.me/c/2296450302/9"


async def testar_get_topic_stats():
    print("\n" + "=" * 60)
    print("PARTE 1 — _get_topic_stats(): classificação de erros")
    print("=" * 60)

    print("\n[1.1] Link malformado")
    s = BareScraper(FakeClient())
    stats = await s._get_topic_stats("https://exemplo.com/nao-e-telegram")
    check(stats["error_type"] == ERROR_INVALID_LINK, f"error_type == invalid_link (veio {stats['error_type']})")
    check(bool(stats["error_message"]), "error_message preenchido")

    print("\n[1.2] Tópico válido com 3 CBZs")
    msgs = [
        FakeMessage("cap01.cbz", reactions=10),
        FakeMessage("cap02.cbz", reactions=20),
        FakeMessage("cap03.cbz", reactions=0),
        FakeMessage("capa.jpg", reactions=5),  # não é cbz, deve ser ignorado
        FakeMessage(None),                      # sem documento
    ]
    stats = await BareScraper(FakeClient(msgs))._get_topic_stats(LINK_OK)
    check(stats["error_type"] is None, "error_type is None em leitura bem-sucedida")
    check(stats["cbz_count"] == 3, f"cbz_count == 3 (veio {stats['cbz_count']})")
    check(stats["avg_reactions"] == 10, f"avg_reactions == 10 (veio {stats['avg_reactions']})")

    print("\n[1.3] Tópico legitimamente vazio (0 CBZs, sem erro)")
    stats = await BareScraper(FakeClient([FakeMessage("capa.jpg")]))._get_topic_stats(LINK_OK)
    check(stats["error_type"] == EMPTY_TOPIC, f"error_type == empty (veio {stats['error_type']})")
    check(stats["cbz_count"] == 0, "cbz_count == 0")

    print("\n[1.4] Entidade inexistente (tópico/canal apagado)")
    erro = ValueError("Cannot find any entity corresponding to '-1002296450302'")
    stats = await BareScraper(FakeClient(raise_on_entity=erro))._get_topic_stats(LINK_OK)
    check(
        stats["error_type"] == ERROR_ENTITY_NOT_FOUND,
        f"error_type == entity_not_found (veio {stats['error_type']})",
    )

    print("\n[1.5] Tópico privado / sem permissão")
    from telethon.errors import ChannelPrivateError

    erro = ChannelPrivateError(request=None)
    stats = await BareScraper(FakeClient(raise_on_entity=erro))._get_topic_stats(LINK_OK)
    check(
        stats["error_type"] == ERROR_PRIVATE_TOPIC,
        f"error_type == private_topic (veio {stats['error_type']})",
    )

    print("\n[1.6] Timeout de rede")
    stats = await BareScraper(FakeClient(raise_on_entity=asyncio.TimeoutError()))._get_topic_stats(LINK_OK)
    check(stats["error_type"] == ERROR_TIMEOUT, f"error_type == timeout (veio {stats['error_type']})")


# ---------------------------------------------------------------------------
# Parte 2 — endpoint review-all
# ---------------------------------------------------------------------------
class FakeScraper:
    """Devolve stats canned por link, no mesmo formato do `_get_topic_stats` real."""

    def __init__(self, por_link):
        self.por_link = por_link
        self.chamadas = []

    async def _get_topic_stats(self, link):
        self.chamadas.append(link)
        return dict(self.por_link[link])


def stats_ok(cbz, avg):
    return {"cbz_count": cbz, "avg_reactions": avg, "error_type": None, "error_message": None}


def stats_erro(tipo, msg):
    return {"cbz_count": 0, "avg_reactions": 0, "error_type": tipo, "error_message": msg}


# 5 manhwas: 3 leituras boas, 1 tópico vazio, 1 link morto (erro definitivo intencional).
CENARIO = [
    # (titulo, link, total_chapters_no_banco, medium_reaction_no_banco, stats_retornadas)
    ("Alpha (vai atualizar)", "https://t.me/c/111/1", 100, 40, stats_ok(120, 55)),
    ("Beta (ja atualizado)", "https://t.me/c/111/2", 80, 30, stats_ok(80, 30)),
    ("Gama (vai atualizar)", "https://t.me/c/111/3", 10, 5, stats_ok(11, 7)),
    ("Delta (topico vazio)", "https://t.me/c/111/4", 55, 22, stats_erro(EMPTY_TOPIC, "Tópico sem .cbz")),
    (
        "Epsilon (link morto)",
        "https://t.me/c/111/5",
        70, 33,
        stats_erro(ERROR_ENTITY_NOT_FOUND, "Entidade não encontrada: topico apagado"),
    ),
]


async def preparar_banco():
    """Recria o SQLite de teste com o cenário acima."""
    async with database.engine.begin() as conn:
        await conn.run_sync(database.Base.metadata.drop_all)
        await conn.run_sync(database.Base.metadata.create_all)

    async with database.async_session_maker() as session:
        for titulo, link, total, reacao, _ in CENARIO:
            session.add(ManhwaModel(
                title=titulo,
                notes=link,
                total_chapters=total,
                medium_reaction=reacao,
                status="reading",
                andamento="andamento",
                current_chapter=0,
                download=False,
            ))
        await session.commit()


async def ler_banco():
    async with database.async_session_maker() as session:
        result = await session.execute(select(ManhwaModel).order_by(ManhwaModel.id))
        return {m.title: (m.total_chapters, m.medium_reaction) for m in result.scalars().all()}


def instalar_scraper_falso():
    fake = FakeScraper({link: stats for _, link, _, _, stats in CENARIO})

    async def _get_fake_scraper():
        return fake

    main.get_telegram_scraper = _get_fake_scraper
    return fake


async def testar_partial_success():
    print("\n" + "=" * 60)
    print("PARTE 2 — endpoint review-all: partial success")
    print("=" * 60)

    await preparar_banco()
    instalar_scraper_falso()

    async with database.async_session_maker() as db:
        resposta = await main.review_all_manhwas(db=db)

    print("\n--- Verificações da resposta ---")
    check(resposta["success"] is True, "success == True mesmo com 1 manhwa falhando (partial success)")
    check(resposta["total_processed"] == 5, f"total_processed == 5 (veio {resposta['total_processed']})")
    check(resposta["total_updated"] == 2, f"total_updated == 2 (veio {resposta['total_updated']})")
    check(resposta["total_errors"] == 1, f"total_errors == 1 (veio {resposta['total_errors']})")
    check(resposta["total_empty"] == 1, f"total_empty == 1 (veio {resposta['total_empty']})")
    check(resposta["persisted"] is True, "persisted == True")
    check(
        resposta["errors_by_type"] == {ERROR_ENTITY_NOT_FOUND: 1},
        f"errors_by_type == {{entity_not_found: 1}} (veio {resposta['errors_by_type']})",
    )

    por_titulo = {r["manhwa_title"]: r for r in resposta["results"]}
    check(
        all("error_type" in r and "error_message" in r for r in resposta["results"]),
        "todo resultado traz error_type e error_message",
    )
    check(
        por_titulo["Delta (topico vazio)"]["success"] is True
        and por_titulo["Delta (topico vazio)"]["error_type"] == EMPTY_TOPIC
        and por_titulo["Delta (topico vazio)"]["updated"] is False,
        "tópico vazio = sucesso, sem update",
    )
    check(
        por_titulo["Epsilon (link morto)"]["success"] is False
        and por_titulo["Epsilon (link morto)"]["error_type"] == ERROR_ENTITY_NOT_FOUND
        and por_titulo["Epsilon (link morto)"]["definitive"] is True,
        "link morto = falha definitiva registrada",
    )

    print("\n--- Verificações no banco (SELECT) ---")
    banco = await ler_banco()
    for titulo, valores in banco.items():
        print(f"   {titulo}: total_chapters={valores[0]}, medium_reaction={valores[1]}")

    check(banco["Alpha (vai atualizar)"] == (120, 55), "Alpha persistido como (120, 55)")
    check(banco["Gama (vai atualizar)"] == (11, 7), "Gama persistido como (11, 7)")
    check(banco["Beta (ja atualizado)"] == (80, 30), "Beta inalterado (já estava correto)")
    check(banco["Delta (topico vazio)"] == (55, 22), "Delta NÃO foi zerado pelo tópico vazio")
    check(banco["Epsilon (link morto)"] == (70, 33), "Epsilon inalterado (falhou, mas não zerou)")


async def testar_falha_de_persistencia():
    print("\n" + "=" * 60)
    print("PARTE 3 — falha na ESCRITA: aí sim nada entra (atomicidade da persistência)")
    print("=" * 60)

    await preparar_banco()
    instalar_scraper_falso()
    antes = await ler_banco()

    original = main._persist_sync_updates

    async def _explode(_pending):
        raise RuntimeError("constraint violation simulada")

    main._persist_sync_updates = _explode
    try:
        async with database.async_session_maker() as db:
            resposta = await main.review_all_manhwas(db=db)
    finally:
        main._persist_sync_updates = original

    import json

    corpo = json.loads(bytes(resposta.body).decode("utf-8"))
    check(resposta.status_code == 500, f"status 500 na falha de escrita (veio {resposta.status_code})")
    check(corpo["success"] is False, "success == False")
    check(corpo["persisted"] is False, "persisted == False")
    check(corpo["total_updated"] == 0, "total_updated == 0")
    check(len(corpo["results"]) == 5, "results ainda detalha os 5 manhwas")

    depois = await ler_banco()
    check(antes == depois, "banco intacto — nenhuma alteração foi salva")


async def main_async():
    try:
        await testar_get_topic_stats()
        await testar_partial_success()
        await testar_falha_de_persistencia()
    finally:
        await database.engine.dispose()

    print("\n" + "=" * 60)
    if falhas:
        print(f"❌ {len(falhas)} verificação(ões) falharam:")
        for f in falhas:
            print(f"   • {f}")
        print("=" * 60)
        return 1
    print("✅ TODAS AS VERIFICAÇÕES PASSARAM")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    codigo = asyncio.run(main_async())
    try:
        if os.path.exists(TEST_DB_FILE):
            os.remove(TEST_DB_FILE)
    except OSError:
        pass
    sys.exit(codigo)
