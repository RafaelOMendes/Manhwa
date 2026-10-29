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
import zipfile

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import main
from database import Base
from models import ChapterProgress, Manhwa as ManhwaModel

CAPITULOS = [f"Cap {n:02d}.cbz" for n in range(1, 9)]
# Abaixo de MIN_CBZ_SIZE_BYTES o .cbz é tratado como quebrado e some da listagem.
CONTEUDO_CBZ = b"x" * (main.MIN_CBZ_SIZE_BYTES + 1)

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


def criar_cbz(caminho: str, paginas: int = 2):
    """CBZ de verdade (zip com imagens), acima de MIN_CBZ_SIZE_BYTES."""
    tamanho_pagina = main.MIN_CBZ_SIZE_BYTES // paginas + 1
    with zipfile.ZipFile(caminho, "w", zipfile.ZIP_STORED) as zf:
        for i in range(paginas):
            zf.writestr(f"page_{i:03d}.jpg", b"\xff" * tamanho_pagina)


async def lidos(session_maker, manhwa_id: int) -> dict:
    """filename → flag `read` devolvida pela GET /files."""
    async with session_maker() as s:
        body = await main.list_manhwa_files(manhwa_id, s)
    return {f["name"]: f["read"] for f in body["files"]}


async def rodar():
    tmp = tempfile.mkdtemp(prefix="manhwas_test_")
    manhwa_dir = os.path.join(tmp, "Teste Manhwa")
    os.makedirs(manhwa_dir)
    for nome in CAPITULOS:
        with open(os.path.join(manhwa_dir, nome), "wb") as f:
            f.write(CONTEUDO_CBZ)
    # Arquivo sem número no nome: não deve ser marcado como lido por chute.
    with open(os.path.join(manhwa_dir, "Extra.cbz"), "wb") as f:
        f.write(CONTEUDO_CBZ)

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
        f.write(CONTEUDO_CBZ)
    await patch_chapter(session_maker, mid, 9)
    atuais = set(await registros(session_maker, mid))
    check("Cap 08.5.cbz" in atuais, "Cap 08.5 marcado como lido ao avançar pro 9")
    check("Extra.cbz" not in atuais, "Extra.cbz continua fora mesmo após vários avanços")

    # --- 8: flag `read` da GET /files (o que web e mobile mostram) ---------
    print("\n8) Flag `read` na GET /files")
    caps_ui = [f"Cap {n:02d}.cbz" for n in range(1, 7)]
    ui_dir = os.path.join(tmp, "Leitura UI")
    os.makedirs(ui_dir)
    for nome in caps_ui:
        criar_cbz(os.path.join(ui_dir, nome))
    async with session_maker() as s:
        ui = ManhwaModel(title="Leitura UI", status="reading", current_chapter=0)
        s.add(ui)
        await s.commit()
        await s.refresh(ui)
        ui_id = ui.id

    flags = await lidos(session_maker, ui_id)
    check(not any(flags.values()), "nada lido antes de qualquer leitura")

    # Leitura real do 5 (o leitor salva scroll antes de chegar ao fim e mandar o PATCH).
    async with session_maker() as s:
        await main.update_scroll(ui_id, "Cap 05.cbz", main.ScrollUpdate(scroll_position=900), s)
    body = await patch_chapter(session_maker, ui_id, 5)
    check(body["chapters_marked_read"] == 4, "PATCH 5 marca 4 anteriores")
    flags = await lidos(session_maker, ui_id)
    check(all(flags[n] for n in caps_ui[:5]), "capítulos 1-5 aparecem lidos depois do PATCH 5")
    check(not flags["Cap 06.cbz"], "capítulo 6 continua não lido")

    print("   capítulo 6 em andamento (scroll salvo, sem PATCH)")
    async with session_maker() as s:
        await main.update_scroll(ui_id, "Cap 06.cbz", main.ScrollUpdate(scroll_position=300), s)
    flags = await lidos(session_maker, ui_id)
    check(not flags["Cap 06.cbz"], "capítulo em andamento NÃO aparece como lido")
    check(all(flags[n] for n in caps_ui[:5]), "1-5 continuam lidos")

    print("   regressão de 5 para 3")
    antes = sorted(await registros(session_maker, ui_id))
    body = await patch_chapter(session_maker, ui_id, 3)
    depois = sorted(await registros(session_maker, ui_id))
    check(body["current_chapter"] == 3, "current_chapter = 3")
    check(depois == antes, f"nenhum ChapterProgress removido (obtido: {depois})")
    flags = await lidos(session_maker, ui_id)
    check(flags["Cap 04.cbz"] and flags["Cap 05.cbz"], "4 e 5 continuam lidos após a regressão")
    check(not flags["Cap 06.cbz"], "6 continua em andamento")

    print("   GET .../read/{filename} e GET .../scroll")
    async with session_maker() as s:
        info = await main.get_cbz_info(ui_id, "Cap 03.cbz", s)
        scroll_auto = await main.get_scroll(ui_id, "Cap 03.cbz", s)
        scroll_real = await main.get_scroll(ui_id, "Cap 05.cbz", s)
        scroll_andamento = await main.get_scroll(ui_id, "Cap 06.cbz", s)
    check(info["total_pages"] == 2, f"GET /read/Cap 03 devolve as páginas (obtido: {info})")
    check(scroll_auto["scroll_position"] == 0 and scroll_auto["updated_at"], "scroll do marcado automático = 0, com updated_at")
    check(scroll_real["scroll_position"] == 900, "scroll real do 5 (900) intacto depois de avanço + regressão")
    check(scroll_andamento["scroll_position"] == 300, "scroll do capítulo em andamento intacto")

    # --- 9: regra pura, sem banco ------------------------------------------
    print("\n9) _preencher_lidos (bordas da regra)")
    arqs = [{"name": f"c{n}"} for n in range(1, 6)]
    main._preencher_lidos(arqs, {"c1", "c2", "c3", "c4", "c5"}, 3)
    check(
        [f["read"] for f in arqs] == [True, True, True, True, False],
        "regressão sem capítulo em andamento: o mais adiantado (5) volta a contar como em andamento",
    )
    arqs = [{"name": f"c{n}"} for n in range(1, 4)]
    main._preencher_lidos(arqs, set(), 0)
    check(not any(f["read"] for f in arqs), "sem progresso e current_chapter 0: nada lido")
    arqs = [{"name": f"c{n}"} for n in range(1, 4)]
    main._preencher_lidos(arqs, {"c3"}, 2)
    check([f["read"] for f in arqs] == [True, True, False], "linha só no capítulo seguinte = em andamento")

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
