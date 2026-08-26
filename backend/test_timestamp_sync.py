# -*- coding: utf-8 -*-
"""Teste da comparação de timestamps na sincronização (app offline ↔ banco).

Cobre os dois endpoints de escrita que o mobile drena da fila offline
(`PATCH /current-chapter` e `PUT /scroll`): quem gerou o dado por último ganha,
e sem `updated_at` no corpo tudo funciona como antes (retrocompatibilidade com
a web e com builds antigas do app).

Roda contra SQLite em memória (não precisa do Postgres nem do servidor no ar):
chama as funções de rota direto, com um diretório temporário fazendo as vezes
de D:\\Manhwas.

    cd backend && venv/Scripts/python.exe test_timestamp_sync.py
"""
import asyncio
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import main
from database import Base
from models import ChapterProgress, Manhwa as ManhwaModel

CAPITULOS = [f"Cap {n:02d}.cbz" for n in range(1, 9)]

# O console do Windows abre em cp1252 e engasga com as setas dos textos abaixo.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

falhas = []


def check(condicao: bool, descricao: str):
    print(f"  [{'OK  ' if condicao else 'FALHA'}] {descricao}")
    if not condicao:
        falhas.append(descricao)


# ---------------------------------------------------------------- utilidades

async def forcar_updated_at(session_maker, mid: int, dt: datetime):
    """Grava um `updated_at` específico no manhwa.

    Valor explícito vence o `onupdate=func.now()` do modelo, que só entra quando
    a coluna não é setada na UPDATE — é o que deixa o teste controlar o "quando".
    O SQLite guarda datetime naive, então gravamos naive-UTC (é o que o
    CURRENT_TIMESTAMP dele produziria).
    """
    async with session_maker() as s:
        await s.execute(
            update(ManhwaModel).where(ManhwaModel.id == mid).values(updated_at=dt.replace(tzinfo=None))
        )
        await s.commit()


async def forcar_updated_at_scroll(session_maker, mid: int, filename: str, dt: datetime):
    async with session_maker() as s:
        await s.execute(
            update(ChapterProgress)
            .where((ChapterProgress.manhwa_id == mid) & (ChapterProgress.filename == filename))
            .values(updated_at=dt.replace(tzinfo=None))
        )
        await s.commit()


async def ler_manhwa(session_maker, mid: int):
    async with session_maker() as s:
        r = await s.execute(select(ManhwaModel).where(ManhwaModel.id == mid))
        return r.scalar_one()


async def patch_chapter(session_maker, mid: int, chapter: int, updated_at=None):
    async with session_maker() as s:
        return await main.update_current_chapter(
            mid, main.UpdateCurrentChapter(current_chapter=chapter, updated_at=updated_at), s
        )


async def put_scroll(session_maker, mid: int, filename: str, position: int, updated_at=None):
    async with session_maker() as s:
        return await main.update_scroll(
            mid, filename, main.ScrollUpdate(scroll_position=position, updated_at=updated_at), s
        )


async def get_scroll(session_maker, mid: int, filename: str):
    async with session_maker() as s:
        return await main.get_scroll(mid, filename, s)


# ------------------------------------------------------------------- cenários

async def rodar():
    tmp = tempfile.mkdtemp(prefix="manhwas_ts_test_")
    manhwa_dir = os.path.join(tmp, "Teste Manhwa")
    os.makedirs(manhwa_dir)
    for nome in CAPITULOS:
        with open(os.path.join(manhwa_dir, nome), "wb") as f:
            f.write(b"x" * 1024)

    main.DOWNLOAD_DIR = tmp

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    try:
        await cenarios(engine)
    finally:
        # Sem dispose a thread do aiosqlite segura o loop e o processo não sai.
        await engine.dispose()


async def cenarios(engine):
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_maker() as s:
        manhwa = ManhwaModel(title="Teste Manhwa", status="plan_to_read", current_chapter=0)
        s.add(manhwa)
        await s.commit()
        await s.refresh(manhwa)
        mid = manhwa.id

    agora = datetime.now(timezone.utc)
    uma_hora_atras = agora - timedelta(hours=1)
    duas_horas_atras = agora - timedelta(hours=2)

    # --- 0: helpers de parsing -------------------------------------------
    print("\n0) Parsing de timestamp do cliente")
    check(
        main._parse_client_ts("2026-08-25T12:00:00.000Z")
        == datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc),
        'aceita o "Z" que o new Date().toISOString() do JS produz',
    )
    check(
        main._parse_client_ts("2026-08-25T09:00:00-03:00")
        == datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc),
        "converte offset -03:00 pra UTC",
    )
    check(main._parse_client_ts("nao-e-data") is None, "string inválida → None (aplica sem comparar)")
    check(main._parse_client_ts(None) is None, "None → None")
    check(main._parse_client_ts("") is None, "string vazia → None")
    check(
        main._cliente_esta_velho(agora.replace(tzinfo=None), None) is False,
        "sem timestamp do cliente não há comparação (aplica)",
    )
    check(
        main._cliente_esta_velho(agora.replace(tzinfo=None), agora) is True,
        "empate conta como banco mais recente",
    )

    # --- 1: retrocompatibilidade (web manda sem updated_at) --------------
    print("\n1) PATCH sem updated_at aplica sempre (web / build antiga)")
    body = await patch_chapter(session_maker, mid, 5)
    check(body["success"] is True, "success = True")
    check(body["current_chapter"] == 5, "current_chapter = 5")
    check(body.get("updated_at") is not None, "resposta traz o updated_at do servidor")

    # --- 2: cliente MAIS NOVO que o banco → aceita -----------------------
    print("\n2) Dado offline mais NOVO que o banco entra")
    await forcar_updated_at(session_maker, mid, duas_horas_atras)
    body = await patch_chapter(session_maker, mid, 6, updated_at=uma_hora_atras.isoformat())
    check(body["success"] is True, "success = True")
    check(body["current_chapter"] == 6, "current_chapter = 6")
    m = await ler_manhwa(session_maker, mid)
    check(m.current_chapter == 6, "banco gravou 6")

    # --- 3: cliente MAIS VELHO que o banco → rejeita ---------------------
    print("\n3) Dado offline mais VELHO que o banco é rejeitado")
    await forcar_updated_at(session_maker, mid, agora)
    body = await patch_chapter(session_maker, mid, 3, updated_at=duas_horas_atras.isoformat())
    check(body["success"] is False, "success = False")
    check(body["reason"] == "stale", 'reason = "stale"')
    check(body["current_chapter"] == 6, "devolve o current_chapter do BANCO (6), não o do cliente (3)")
    check(body["chapters_marked_read"] == 0, "não marca capítulos na rejeição")
    check(body.get("updated_at") is not None, "devolve o updated_at do servidor")
    m = await ler_manhwa(session_maker, mid)
    check(m.current_chapter == 6, "banco continua 6 — sem regressão")

    # --- 4: empate → banco vence -----------------------------------------
    print("\n4) Empate de timestamp: o banco vence")
    await forcar_updated_at(session_maker, mid, uma_hora_atras)
    body = await patch_chapter(session_maker, mid, 2, updated_at=uma_hora_atras.isoformat())
    check(body["success"] is False, "success = False no empate")
    m = await ler_manhwa(session_maker, mid)
    check(m.current_chapter == 6, "banco continua 6")

    # --- 5: cliente velho com o MESMO valor não é disputa ----------------
    print("\n5) Cliente velho mandando o valor que já está no banco → sem disputa")
    await forcar_updated_at(session_maker, mid, agora)
    body = await patch_chapter(session_maker, mid, 6, updated_at=duas_horas_atras.isoformat())
    check(body["success"] is True, "success = True (nada a rejeitar, o valor é o mesmo)")

    # --- 6: timestamp malformado não custa o dado ------------------------
    print("\n6) updated_at malformado cai no comportamento antigo (aplica)")
    await forcar_updated_at(session_maker, mid, agora)
    body = await patch_chapter(session_maker, mid, 4, updated_at="isso-nao-e-uma-data")
    check(body["success"] is True, "success = True")
    m = await ler_manhwa(session_maker, mid)
    check(m.current_chapter == 4, "banco gravou 4")

    # --- 7: scroll, linha nova -------------------------------------------
    # Cap 07 é o único capítulo ainda sem ChapterProgress: os PATCHes acima já
    # criaram linhas (com scroll 0) pros capítulos 1..5, via
    # _mark_previous_chapters_read.
    print("\n7) PUT scroll em capítulo sem progresso: não há o que comparar")
    body = await put_scroll(session_maker, mid, "Cap 07.cbz", 500, updated_at=duas_horas_atras.isoformat())
    check(body["success"] is True, "success = True mesmo com timestamp velho (linha nova)")
    check(body["scroll_position"] == 500, "scroll_position = 500")
    check(body.get("updated_at") is not None, "resposta traz o updated_at do servidor")

    # --- 8: scroll, cliente mais novo → aceita ---------------------------
    print("\n8) Scroll offline mais NOVO que o banco entra")
    await forcar_updated_at_scroll(session_maker, mid, "Cap 07.cbz", duas_horas_atras)
    body = await put_scroll(session_maker, mid, "Cap 07.cbz", 900, updated_at=uma_hora_atras.isoformat())
    check(body["success"] is True, "success = True")
    check(body["scroll_position"] == 900, "scroll_position = 900")

    # --- 9: scroll, cliente mais velho → rejeita e devolve o do banco ----
    print("\n9) Scroll offline mais VELHO é rejeitado e devolve a posição do banco")
    await forcar_updated_at_scroll(session_maker, mid, "Cap 07.cbz", agora)
    body = await put_scroll(session_maker, mid, "Cap 07.cbz", 100, updated_at=duas_horas_atras.isoformat())
    check(body["success"] is False, "success = False")
    check(body["scroll_position"] == 900, "devolve a posição do BANCO (900), não a do cliente (100)")
    check(body.get("updated_at") is not None, "devolve o updated_at do servidor (pra carimbar o local)")
    atual = await get_scroll(session_maker, mid, "Cap 07.cbz")
    check(atual["scroll_position"] == 900, "banco continua 900 — sem regressão")

    # --- 10: scroll sem updated_at continua incondicional ----------------
    print("\n10) PUT scroll sem updated_at aplica sempre (web / leitura ao vivo)")
    await forcar_updated_at_scroll(session_maker, mid, "Cap 07.cbz", agora)
    body = await put_scroll(session_maker, mid, "Cap 07.cbz", 42)
    check(body["success"] is True, "success = True")
    atual = await get_scroll(session_maker, mid, "Cap 07.cbz")
    check(atual["scroll_position"] == 42, "banco gravou 42")
    check(atual.get("updated_at") is not None, "GET /scroll também devolve updated_at")

    # --- 11: GET scroll de capítulo sem progresso ------------------------
    print("\n11) Linha com scroll_position=0 (auto-marcada) não vence dado real velho")
    # REGRESSÃO: o _mark_previous_chapters_read cria ChapterProgress com
    # scroll_position=0 e data de AGORA. Sem tratamento, um scroll lido offline
    # (data mais velha) chegando depois perderia a comparação pro 0 — o app
    # adotaria 0 e jogaria fora a posição real. Uma linha em 0 é indistinguível
    # de "sem progresso" e nunca deve ganhar.
    atual = await get_scroll(session_maker, mid, "Cap 02.cbz")
    check(atual["scroll_position"] == 0, "Cap 02 foi auto-marcado com scroll 0")
    body = await put_scroll(session_maker, mid, "Cap 02.cbz", 777, updated_at=duas_horas_atras.isoformat())
    check(body["success"] is True, "success = True — linha zerada não disputa")
    atual = await get_scroll(session_maker, mid, "Cap 02.cbz")
    check(atual["scroll_position"] == 777, "banco gravou 777: a leitura offline não se perdeu")

    # --- 12: GET scroll de capítulo nunca lido ---------------------------
    print("\n12) GET scroll de capítulo nunca lido")
    vazio = await get_scroll(session_maker, mid, "Cap 08.cbz")
    check(vazio["scroll_position"] == 0, "scroll_position = 0")
    check(vazio["updated_at"] is None, "updated_at = None (nunca houve progresso)")


if __name__ == "__main__":
    asyncio.run(rodar())
    print("\n" + "=" * 60)
    if falhas:
        print(f"{len(falhas)} FALHA(S):")
        for f in falhas:
            print(f"  - {f}")
        sys.exit(1)
    print("Todos os checks passaram.")
