# -*- coding: utf-8 -*-
"""Mede o custo real de ler stats de tópicos do Telegram em vários níveis de paralelismo.

SOMENTE LEITURA: pega uma amostra de links do banco (SELECT) e lê os tópicos no
Telegram. Não escreve nada — nem no banco, nem no Telegram. Serve para escolher o
`REVIEW_PARALLELISM` do /api/manhwas/review-all com número, não com chute.

Uso:  python bench_review_parallelism.py [amostra] [niveis...]
Ex.:  python bench_review_parallelism.py 30 1 2 4 8
"""
import asyncio
import sys
import time

from sqlalchemy import select

from database import async_session_maker, engine
from models import Manhwa as ManhwaModel
from telegram_scraper import ERROR_FLOOD_WAIT, TelegramManhwaScraper


class LegacyScraper(TelegramManhwaScraper):
    """Reproduz o comportamento ANTIGO: get_dialogs() + get_entity() a cada tópico.

    Existe só para o baseline do benchmark — mostra quanto custava resolver a mesma
    entidade repetidamente.
    """

    async def _resolve_entity(self, chat_id_or_username):
        if isinstance(chat_id_or_username, int):
            await self.client.get_dialogs()
        return await self.client.get_entity(chat_id_or_username)


async def carregar_amostra(quantidade):
    """SELECT read-only: pega os primeiros N manhwas com link do Telegram."""
    async with async_session_maker() as session:
        result = await session.execute(select(ManhwaModel).order_by(ManhwaModel.id))
        todos = result.scalars().all()
    com_link = [m for m in todos if m.notes and "t.me" in m.notes]
    print(f"Banco: {len(todos)} manhwas, {len(com_link)} com link do Telegram.")
    return [(m.title, m.notes) for m in com_link[:quantidade]]


async def medir(scraper, amostra, paralelismo, rotulo):
    sem = asyncio.Semaphore(paralelismo)
    floods = 0
    erros = {}

    async def ler(link):
        nonlocal floods
        async with sem:
            inicio = time.time()
            stats = await scraper._get_topic_stats(link)
            tipo = stats.get("error_type")
            if tipo == ERROR_FLOOD_WAIT:
                floods += 1
            if tipo:
                erros[tipo] = erros.get(tipo, 0) + 1
            return time.time() - inicio

    inicio = time.time()
    tempos = await asyncio.gather(*[ler(link) for _, link in amostra])
    total = time.time() - inicio

    serial = sum(tempos)
    print(
        f"\n  {rotulo:<28} {total:7.1f}s parede | {serial:7.1f}s somado | "
        f"{len(amostra) / total:5.2f} tópicos/s | speedup {serial / total:4.2f}x"
    )
    print(f"  {'':<28} flood waits: {floods} | erros: {erros or 'nenhum'}")
    return total, floods


async def main():
    quantidade = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    niveis = [int(n) for n in sys.argv[2:]] or [1, 2, 4, 8]

    amostra = await carregar_amostra(quantidade)
    if not amostra:
        print("Nenhum manhwa com link — nada a medir.")
        return
    print(f"Amostra: {len(amostra)} tópicos.\n" + "=" * 70)

    resultados = {}

    # Baseline: comportamento antigo (get_dialogs por tópico), sequencial.
    legacy = LegacyScraper()
    await legacy.connect()
    try:
        resultados["legacy_seq"] = await medir(
            legacy, amostra, 1, "ANTES (seq + get_dialogs/tópico)"
        )
    finally:
        await legacy.disconnect()

    # Depois: cache de entidade, em cada nível de paralelismo.
    for n in niveis:
        scraper = TelegramManhwaScraper()
        await scraper.connect()
        try:
            resultados[f"novo_{n}"] = await medir(
                scraper, amostra, n, f"DEPOIS (cache, paralelismo={n})"
            )
        finally:
            await scraper.disconnect()

    print("\n" + "=" * 70)
    base = resultados["legacy_seq"][0]
    print(f"Baseline (antes): {base:.1f}s para {len(amostra)} tópicos")
    for n in niveis:
        total, floods = resultados[f"novo_{n}"]
        aviso = f"  ⚠️  {floods} flood wait(s)" if floods else ""
        print(
            f"  paralelismo={n}: {total:6.1f}s  → {base / total:4.2f}x mais rápido "
            f"({(1 - total / base) * 100:.0f}% de redução){aviso}"
        )
        extrapolado = total / len(amostra) * 1395
        print(f"                 extrapolando p/ 1395 manhwas: ~{extrapolado / 60:.1f} min")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
