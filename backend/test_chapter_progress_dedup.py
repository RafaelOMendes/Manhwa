# -*- coding: utf-8 -*-
"""Teste da regra "no máximo um ChapterProgress por (manhwa_id, filename)".

Roda contra SQLite (em memória e num arquivo temporário), sem Postgres nem
servidor no ar: chama as funções de rota direto e o script de limpeza como
subprocesso, com DATABASE_URL apontando pro SQLite temporário.

    cd backend && venv/Scripts/python.exe test_chapter_progress_dedup.py
"""
import asyncio
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import main
from chapter_progress_dedup import remover_duplicatas_progress
from database import Base
from models import ChapterProgress, Manhwa as ManhwaModel

CAPITULOS = [f"Cap {n:02d}.cbz" for n in range(1, 6)]
BASE = datetime(2026, 1, 1, 12, 0, 0)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

falhas = []


def check(condicao: bool, descricao: str):
    print(f"  [{'OK  ' if condicao else 'FALHA'}] {descricao}")
    if not condicao:
        falhas.append(descricao)


def linha(mid, filename, scroll, minutos):
    return ChapterProgress(
        manhwa_id=mid, filename=filename, scroll_position=scroll,
        updated_at=BASE + timedelta(minutes=minutos),
    )


async def seed_duplicatas(session_maker):
    """Duplicatas de vários tipos; devolve o que deve sobrar por par."""
    async with session_maker() as s:
        s.add_all([
            # manhwa 1 / Cap 01: três linhas, a do meio é a mais recente
            linha(1, "Cap 01.cbz", 100, 0),
            linha(1, "Cap 01.cbz", 300, 30),
            linha(1, "Cap 01.cbz", 200, 10),
            # manhwa 1 / Cap 02: sem duplicata
            linha(1, "Cap 02.cbz", 50, 0),
            # manhwa 1 / Cap 03: empate de updated_at, vence o maior id (inserido por último)
            linha(1, "Cap 03.cbz", 1, 5),
            linha(1, "Cap 03.cbz", 2, 5),
            # manhwa 2 / Cap 01: mesmo filename de outro manhwa, par diferente
            linha(2, "Cap 01.cbz", 7, 0),
            linha(2, "Cap 01.cbz", 8, 1),
        ])
        await s.commit()
    return {
        (1, "Cap 01.cbz"): 300,
        (1, "Cap 02.cbz"): 50,
        (1, "Cap 03.cbz"): 2,
        (2, "Cap 01.cbz"): 8,
    }


async def estado(session_maker):
    """Lista de (manhwa_id, filename, scroll_position) ordenada."""
    async with session_maker() as s:
        r = await s.execute(select(
            ChapterProgress.manhwa_id, ChapterProgress.filename, ChapterProgress.scroll_position
        ))
        return sorted(tuple(x) for x in r.all())


async def novo_banco():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine, session_maker


async def rodar():
    # --- 1: limpeza global, idempotente --------------------------------
    print("\n1) Limpeza global mantém a mais recente de cada par e é idempotente")
    engine, sm = await novo_banco()
    esperado = await seed_duplicatas(sm)
    async with sm() as s:
        removidas = await remover_duplicatas_progress(s)
        await s.commit()
    check(removidas == 4, f"4 duplicatas removidas (obtido: {removidas})")
    depois = await estado(sm)
    check(
        depois == sorted((m, f, v) for (m, f), v in esperado.items()),
        f"sobrou exatamente a mais recente de cada par (obtido: {depois})",
    )
    async with sm() as s:
        removidas2 = await remover_duplicatas_progress(s)
        await s.commit()
    check(removidas2 == 0, "segunda rodada não remove nada")
    check(await estado(sm) == depois, "segunda rodada não altera a tabela")
    await engine.dispose()

    # --- 2: helper só toca o par informado -----------------------------
    print("\n2) _remover_duplicatas_progress só mexe no (manhwa_id, filename) pedido")
    engine, sm = await novo_banco()
    await seed_duplicatas(sm)
    async with sm() as s:
        removidas = await main._remover_duplicatas_progress(s, 1, "Cap 01.cbz")
        await s.commit()
    check(removidas == 2, f"2 linhas removidas do par (1, Cap 01) (obtido: {removidas})")
    depois = await estado(sm)
    check([x for x in depois if x[:2] == (1, "Cap 01.cbz")] == [(1, "Cap 01.cbz", 300)],
          "par (1, Cap 01) ficou só com a mais recente (300)")
    check(sum(1 for x in depois if x[:2] == (1, "Cap 03.cbz")) == 2,
          "duplicatas de outro capítulo do mesmo manhwa não foram tocadas")
    check(sum(1 for x in depois if x[:2] == (2, "Cap 01.cbz")) == 2,
          "mesmo filename em outro manhwa não foi tocado")
    check((1, "Cap 02.cbz", 50) in depois, "capítulo sem duplicata intacto")
    await engine.dispose()

    # --- 3: corrida no update_scroll -----------------------------------
    print("\n3) update_scroll inserindo um par que já existe (corrida)")
    engine, sm = await novo_banco()
    async with sm() as s:
        s.add_all([linha(1, "Cap 01.cbz", 111, 0), linha(1, "Cap 02.cbz", 222, 0)])
        await s.commit()

    # Simula a outra requisição: o select do update_scroll não vê a linha que
    # já existe, então ele cai no ramo de inserção.
    original = main._buscar_progress
    chamadas = {"n": 0}

    async def buscar_cego_na_primeira(db, mid, filename):
        chamadas["n"] += 1
        if chamadas["n"] == 1:
            return []
        return await original(db, mid, filename)

    main._buscar_progress = buscar_cego_na_primeira
    try:
        async with sm() as s:
            body = await main.update_scroll(1, "Cap 01.cbz", main.ScrollUpdate(scroll_position=999), s)
    finally:
        main._buscar_progress = original
    check(body["success"] is True, "resposta de sucesso")
    check(body["scroll_position"] == 999, f"resposta traz o valor novo (obtido: {body['scroll_position']})")
    depois = await estado(sm)
    check([x for x in depois if x[:2] == (1, "Cap 01.cbz")] == [(1, "Cap 01.cbz", 999)],
          f"exatamente uma linha pro par, com o valor mais recente (obtido: {depois})")
    check((1, "Cap 02.cbz", 222) in depois, "outro capítulo do mesmo manhwa intacto")

    # --- 4: duplicata pré-existente não quebra mais o GET/PUT ------------
    print("\n4) Duplicata antiga: GET devolve a mais recente e PUT limpa o par")
    async with sm() as s:
        s.add_all([linha(1, "Cap 03.cbz", 10, 0), linha(1, "Cap 03.cbz", 20, 5)])
        await s.commit()
    async with sm() as s:
        scroll = await main.get_scroll(1, "Cap 03.cbz", s)
    check(scroll["scroll_position"] == 20, f"GET devolve a mais recente (obtido: {scroll['scroll_position']})")
    async with sm() as s:
        body = await main.update_scroll(1, "Cap 03.cbz", main.ScrollUpdate(scroll_position=30), s)
        await s.commit()  # o get_db faria esse commit no fim do request
    check(body["success"] is True and body["scroll_position"] == 30, "PUT atualiza normalmente")
    depois = await estado(sm)
    check([x for x in depois if x[:2] == (1, "Cap 03.cbz")] == [(1, "Cap 03.cbz", 30)],
          f"par (1, Cap 03) ficou com uma linha só (obtido: {depois})")
    await engine.dispose()

    # --- 5: _mark_previous_chapters_read não apaga histórico -----------
    print("\n5) _mark_previous_chapters_read preserva os outros capítulos")
    tmp = tempfile.mkdtemp(prefix="manhwas_test_")
    os.makedirs(os.path.join(tmp, "Teste Manhwa"))
    for nome in CAPITULOS:
        with open(os.path.join(tmp, "Teste Manhwa", nome), "wb") as f:
            f.write(b"x" * (main.MIN_CBZ_SIZE_BYTES + 1))
    main.DOWNLOAD_DIR = tmp
    engine, sm = await novo_banco()
    async with sm() as s:
        m = ManhwaModel(title="Teste Manhwa", status="plan_to_read", current_chapter=0)
        s.add(m)
        await s.commit()
        await s.refresh(m)
        mid = m.id
        s.add(linha(mid, "Cap 02.cbz", 4321, 0))
        await s.commit()
    async with sm() as s:
        body = await main.update_current_chapter(mid, main.UpdateCurrentChapter(current_chapter=5), s)
    check(body["chapters_marked_read"] == 3, f"3 capítulos novos marcados (obtido: {body['chapters_marked_read']})")
    depois = await estado(sm)
    check(
        depois == sorted([(mid, "Cap 01.cbz", 0), (mid, "Cap 02.cbz", 4321), (mid, "Cap 03.cbz", 0), (mid, "Cap 04.cbz", 0)]),
        f"um registro por capítulo, scroll real do Cap 02 preservado (obtido: {depois})",
    )
    await engine.dispose()

    # --- 6: script de limpeza contra SQLite temporário -----------------
    print("\n6) Script chapter_progress_dedup.py contra um SQLite temporário")
    db_path = os.path.join(tempfile.mkdtemp(prefix="dedup_db_"), "teste.db")
    url = f"sqlite+aiosqlite:///{db_path}"
    engine = create_async_engine(url)
    sm = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    esperado = await seed_duplicatas(sm)
    await engine.dispose()

    env = dict(os.environ, DATABASE_URL=url, PYTHONIOENCODING="utf-8")
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chapter_progress_dedup.py")
    saidas = []
    for _ in range(2):
        proc = subprocess.run([sys.executable, script], env=env, capture_output=True, text=True, encoding="utf-8")
        ultima = proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else proc.stderr
        saidas.append((proc.returncode, ultima))
    check(saidas[0][0] == 0 and "4 linha(s)" in saidas[0][1], f"1ª execução remove 4 (saída: {saidas[0][1]!r})")
    check(saidas[1][0] == 0 and "0 linha(s)" in saidas[1][1], f"2ª execução remove 0 (saída: {saidas[1][1]!r})")

    engine = create_async_engine(url)
    sm = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    check(
        await estado(sm) == sorted((m, f, v) for (m, f), v in esperado.items()),
        "banco do script ficou com a mais recente de cada par",
    )
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
