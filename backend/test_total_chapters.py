# -*- coding: utf-8 -*-
"""Teste do `total_chapters` (o "/ 55" do card "Cap: 39 / 55").

Sintoma (card do Trello "manhwas sem capítulos lidos"): o card mostrava o
capítulo atual sem o total, mas a lista de capítulos estava normal. No banco real,
"Reencarnei no Corpo de Um Príncipe Canalha" tinha `total_chapters = 0` com 55
.cbz na pasta. Regras cobertas aqui:

1. `GET /files` corrige o banco quando o total está null/0 e há capítulos em disco.
2. `PUT /manhwas/{id}` sem total (ou com 0) não apaga um total que já existe.
3. Um total novo e positivo no PUT continua valendo.

A terceira causa — o "Sincronizar" (`/download-all`) gravando 0 quando o tópico
do Telegram vem sem .cbz — fica dentro do loop do scraper e não é exercitada
aqui (precisaria do Telegram); a guarda está em `download_all_manhwas`.

Roda em SQLite em memória, sem Postgres e sem servidor:

    cd backend && venv/Scripts/python.exe test_total_chapters.py
"""
import asyncio
import os
import sys
import tempfile

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import main
from database import Base
from models import Manhwa as ManhwaModel

falhas = []


def check(condicao: bool, descricao: str):
    print(f"  [{'OK  ' if condicao else 'FALHA'}] {descricao}")
    if not condicao:
        falhas.append(descricao)


async def total_no_banco(session_maker, mid: int):
    async with session_maker() as s:
        return (await s.get(ManhwaModel, mid)).total_chapters


async def rodar():
    tmp = tempfile.mkdtemp(prefix="manhwas_total_")
    main.DOWNLOAD_DIR = tmp
    pasta = os.path.join(tmp, "Principe Canalha")
    os.makedirs(pasta)
    for i in range(1, 6):
        with open(os.path.join(pasta, f"Capítulo {i:02d}.cbz"), "wb") as f:
            f.write(b"x" * (main.MIN_CBZ_SIZE_BYTES + 1))

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_maker() as s:
        zerado = ManhwaModel(title="Principe Canalha", status="reading", current_chapter=3, total_chapters=0, download=True)
        vazio = ManhwaModel(title="Sem Pasta", status="plan_to_read", current_chapter=0, total_chapters=None)
        s.add_all([zerado, vazio])
        await s.commit()
        mid, mid_vazio = zerado.id, vazio.id

    print("1) GET /files corrige total 0 com capítulos em disco")
    async with session_maker() as s:
        body = await main.list_manhwa_files(mid, s)
        await s.commit()  # o get_db() faz isso no servidor
    check(body["total_chapters"] == 5, "resposta traz total_chapters = 5")
    check(await total_no_banco(session_maker, mid) == 5, "banco passou de 0 para 5")

    print("2) Sem capítulos em disco, nada é inventado")
    async with session_maker() as s:
        await main.list_manhwa_files(mid_vazio, s)
        await s.commit()
    check(await total_no_banco(session_maker, mid_vazio) is None, "continua None sem pasta")

    print("3) PUT sem total não apaga o total existente")
    async with session_maker() as s:
        await main.update_manhwa(mid, main.ManhwaUpdate(title="Principe Canalha", status="reading", current_chapter=4), s)
    check(await total_no_banco(session_maker, mid) == 5, "PUT sem total_chapters manteve 5")
    async with session_maker() as s:
        await main.update_manhwa(mid, main.ManhwaUpdate(title="Principe Canalha", current_chapter=4, total_chapters=0), s)
    check(await total_no_banco(session_maker, mid) == 5, "PUT com total_chapters=0 manteve 5")

    print("4) PUT com total novo e positivo atualiza")
    async with session_maker() as s:
        r = await main.update_manhwa(mid, main.ManhwaUpdate(title="Principe Canalha", current_chapter=4, total_chapters=7), s)
    check(await total_no_banco(session_maker, mid) == 7, "total passou para 7")
    check(r["current_chapter"] == 4, "demais campos do PUT continuam valendo")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(rodar())
    print()
    if falhas:
        print(f"{len(falhas)} FALHA(S):")
        for f in falhas:
            print("  -", f)
        sys.exit(1)
    print("Tudo OK")
