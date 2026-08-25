# -*- coding: utf-8 -*-
"""Roda o /api/manhwas/review-all de verdade (Telegram + banco Neon) num subconjunto.

Serve para o teste manual do card: confirma que as alterações são REALMENTE
persistidas e mede o tempo com o paralelismo configurado.

Uso: python e2e_review_real.py [quantidade]

Escreve no banco real — é exatamente o que o endpoint faz em produção.
"""
import asyncio
import sys

from sqlalchemy import select

import main
from database import async_session_maker, engine
from models import Manhwa as ManhwaModel


async def snapshot(ids):
    async with async_session_maker() as session:
        result = await session.execute(select(ManhwaModel).where(ManhwaModel.id.in_(ids)))
        return {m.id: (m.title, m.total_chapters, m.medium_reaction) for m in result.scalars().all()}


async def run():
    quantidade = int(sys.argv[1]) if len(sys.argv) > 1 else 12

    async with async_session_maker() as session:
        result = await session.execute(select(ManhwaModel).order_by(ManhwaModel.id))
        todos = result.scalars().all()
    alvos = [m.id for m in todos if m.notes and "t.me" in m.notes][:quantidade]

    antes = await snapshot(alvos)
    print(f"\nANTES ({len(antes)} manhwas):")
    for mid, (titulo, cap, reacao) in antes.items():
        print(f"   [{mid}] {titulo[:34]:36} total={cap} reacao={reacao}")

    async with async_session_maker() as db:
        resposta = await main.review_all_manhwas(limit=quantidade, db=db)

    print("\nRESPOSTA:")
    print(f"   success={resposta['success']} persisted={resposta['persisted']}")
    print(f"   processados={resposta['total_processed']} atualizados={resposta['total_updated']}")
    print(f"   erros={resposta['total_errors']} vazios={resposta['total_empty']}")
    print(f"   errors_by_type={resposta['errors_by_type']}")
    print(f"   performance={resposta['performance']}")

    depois = await snapshot(alvos)
    print("\nDEPOIS (SELECT direto no banco):")
    mudou = 0
    for mid in alvos:
        titulo, cap_a, re_a = antes[mid]
        _, cap_d, re_d = depois[mid]
        marca = ""
        if (cap_a, re_a) != (cap_d, re_d):
            mudou += 1
            marca = f"   ⬅️  MUDOU (era total={cap_a} reacao={re_a})"
        print(f"   [{mid}] {titulo[:34]:36} total={cap_d} reacao={re_d}{marca}")

    esperado = resposta["total_updated"]
    print(f"\nManhwas com valor alterado no banco: {mudou} | endpoint disse updated={esperado}")
    if mudou == esperado:
        print("✅ Persistência confere com o que o endpoint reportou.")
    else:
        print("❌ Divergência entre o reportado e o que está no banco!")

    await engine.dispose()
    return 0 if mudou == esperado else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
