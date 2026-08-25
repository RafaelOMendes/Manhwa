# -*- coding: utf-8 -*-
"""Teste da marcação automática de capítulos anteriores como lidos.

Roda contra SQLite em memória (não precisa do Postgres nem do servidor no ar):
chama as funções de rota direto, com um diretório temporário fazendo as vezes
de D:\\Manhwas.

    cd backend && venv/Scripts/python.exe test_auto_mark_read.py
"""
import asyncio
import os
import sys
import tempfile

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import main
from database import Base
from models import ChapterProgress, Manhwa as ManhwaModel

CAPITULOS = [f"Cap {n:02d}.cbz" for n in range(1, 9)]

falhas = []


def check(condicao: bool, descricao: str):
    print(f"  [{'OK  ' if condicao else 'FALHA'}] {descricao}")
    if not condicao:
        falhas.append(descricao)


async def registros(session_maker, manhwa_id: int):
    """Filenames com ChapterProgress gravado (lista, pra detectar duplicata)."""
    async with session_maker() as s:
        r = await s.execute(
            select(ChapterProgress.filename).where(ChapterProgress.manhwa_id == manhwa_id)
        )
        return list(r.scalars().all())


async def patch_chapter(session_maker, manhwa_id: int, chapter: int):
    async with session_maker() as s:
        return await main.update_current_chapter(
            manhwa_id, main.UpdateCurrentChapter(current_chapter=chapter), s
        )


async def rodar():
    tmp = tempfile.mkdtemp(prefix="manhwas_test_")
    manhwa_dir = os.path.join(tmp, "Teste Manhwa")
    os.makedirs(manhwa_dir)
    for nome in CAPITULOS:
        with open(os.path.join(manhwa_dir, nome), "wb") as f:
            f.write(b"x" * 1024)
    # Arquivo sem número no nome: não deve ser marcado como lido por chute.
    with open(os.path.join(manhwa_dir, "Extra.cbz"), "wb") as f:
        f.write(b"x" * 1024)

    main.DOWNLOAD_DIR = tmp

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_maker() as s:
        manhwa = ManhwaModel(title="Teste Manhwa", status="plan_to_read", current_chapter=0)
        s.add(manhwa)
        await s.commit()
        await s.refresh(manhwa)
        mid = manhwa.id

    # --- 1: avanço para o capítulo 5 ------------------------------------
    print("\n1) PATCH current-chapter = 5")
    body = await patch_chapter(session_maker, mid, 5)
    print(f"   resposta: {body}")
    check(body["current_chapter"] == 5, "current_chapter = 5")
    check(body["status"] == "reading", 'status virou "reading"')
    check(body["chapters_marked_read"] == 4, "chapters_marked_read = 4")

    atuais = set(await registros(session_maker, mid))
    esperados = {"Cap 01.cbz", "Cap 02.cbz", "Cap 03.cbz", "Cap 04.cbz"}
    check(atuais == esperados, f"ChapterProgress = capítulos 1-4 (obtido: {sorted(atuais)})")
    check("Cap 05.cbz" not in atuais, "capítulo 5 (o atual) não é pré-marcado")
    check("Extra.cbz" not in atuais, "arquivo sem número no nome não é marcado")

    # --- 2: scroll real não pode ser sobrescrito ------------------------
    print("\n2) Scroll real do capítulo 2 é preservado ao avançar")
    async with session_maker() as s:
        await main.update_scroll(mid, "Cap 02.cbz", main.ScrollUpdate(scroll_position=1234), s)
    await patch_chapter(session_maker, mid, 7)
    async with session_maker() as s:
        scroll = await main.get_scroll(mid, "Cap 02.cbz", s)
    check(scroll["scroll_position"] == 1234, "scroll_position do Cap 02 continua 1234")

    atuais = set(await registros(session_maker, mid))
    check(
        atuais == esperados | {"Cap 05.cbz", "Cap 06.cbz"},
        f"capítulos 5 e 6 marcados ao avançar pro 7 (obtido: {sorted(atuais)})",
    )

    # --- 3: regressão não apaga nada ------------------------------------
    print("\n3) Regressão de 7 para 3")
    antes = set(await registros(session_maker, mid))
    body = await patch_chapter(session_maker, mid, 3)
    depois = set(await registros(session_maker, mid))
    check(body["current_chapter"] == 3, "current_chapter = 3")
    check(depois == antes, "nenhum registro dos capítulos 4-6 foi deletado")
    check(body["chapters_marked_read"] == 0, "nada novo marcado na regressão")

    # --- 4: idempotência -------------------------------------------------
    print("\n4) Chamada repetida não duplica registros")
    await patch_chapter(session_maker, mid, 7)
    await patch_chapter(session_maker, mid, 7)
    todos = await registros(session_maker, mid)
    check(len(todos) == len(set(todos)), f"sem filenames duplicados ({len(todos)} registros)")

    # --- 5: rota /files continua íntegra ---------------------------------
    print("\n5) GET /files continua íntegra")
    async with session_maker() as s:
        body = await main.list_manhwa_files(mid, s)
    nomes = [f["name"] for f in body["files"]]
    check(len(body["files"]) == 9, f"9 arquivos listados (obtido: {len(body['files'])})")
    check(nomes[0] == "Extra.cbz", "ordenação por chapter_number preservada (Extra=0 primeiro)")
    check(nomes[1:] == CAPITULOS, "capítulos 1-8 em ordem")
    check(body["current_chapter"] == 7, "current_chapter devolvido pela /files")
    check(
        all(k in body["files"][0] for k in ("name", "size_mb", "chapter_number")),
        "formato de cada arquivo inalterado (name/size_mb/chapter_number)",
    )
    check("path" in body, "campo path preservado")

    # --- 6: bordas -------------------------------------------------------
    print("\n6) Bordas")
    async with session_maker() as s:
        outro = ManhwaModel(title="Sem Arquivos", status="plan_to_read", current_chapter=0)
        s.add(outro)
        await s.commit()
        await s.refresh(outro)
        outro_id = outro.id

    body = await patch_chapter(session_maker, outro_id, 4)
    check(body["chapters_marked_read"] == 0, "manhwa sem diretório em disco não quebra")
    check(body["current_chapter"] == 4, "current_chapter atualizado mesmo sem arquivos")

    async with session_maker() as s:
        vazio = await main.list_manhwa_files(outro_id, s)
    check(vazio["files"] == [], "/files devolve lista vazia pra manhwa sem diretório")

    body = await patch_chapter(session_maker, mid, 1)
    check(body["chapters_marked_read"] == 0, "capítulo 1 não marca nada antes dele")

    try:
        await patch_chapter(session_maker, 999999, 2)
        check(False, "manhwa inexistente devolve 404")
    except HTTPException as exc:
        check(exc.status_code == 404, "manhwa inexistente ainda devolve 404")

    # --- 7: capítulos fracionários ---------------------------------------
    print("\n7) Capítulo fracionário (Cap 08.5)")
    with open(os.path.join(manhwa_dir, "Cap 08.5.cbz"), "wb") as f:
        f.write(b"x" * 1024)
    await patch_chapter(session_maker, mid, 9)
    atuais = set(await registros(session_maker, mid))
    check("Cap 08.5.cbz" in atuais, "Cap 08.5 marcado como lido ao avançar pro 9")
    check("Extra.cbz" not in atuais, "Extra.cbz continua fora mesmo após vários avanços")

    await engine.dispose()

    print("\n" + "=" * 60)
    if falhas:
        print(f"{len(falhas)} FALHA(S):")
        for f in falhas:
            print(f"  - {f}")
        return 1
    print("Todos os testes passaram.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(rodar()))
