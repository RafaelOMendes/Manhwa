# -*- coding: utf-8 -*-
"""Remoção de duplicatas em `chapter_progress`.

Cada linha da tabela representa UM capítulo (par `manhwa_id` + `filename`), então
"duplicata" é mais de uma linha pro mesmo par — nunca várias linhas do mesmo
`manhwa_id` com arquivos diferentes (isso é o histórico de leitura e não pode
ser apagado). Das linhas repetidas fica só a mais recente: maior `updated_at`,
com desempate pelo maior `id`.

Duplicatas só surgem por corrida entre requisições (dois "insere se não existe"
simultâneos) ou por dados antigos. A tabela não tem UNIQUE no par porque o
projeto não tem migrações (só `create_all`, que não altera tabela existente).

Uso como script (idempotente — rodar de novo não muda nada):

    cd backend && venv/Scripts/python.exe chapter_progress_dedup.py

Usa o DATABASE_URL do ambiente/.env, ou seja, o banco de verdade. O backend
também roda essa limpeza sozinho no startup (lifespan em main.py).
"""
import asyncio
from typing import Iterable, Optional

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from models import ChapterProgress


def _stmt_remover_duplicatas(manhwa_id: Optional[int] = None, filenames: Optional[Iterable[str]] = None):
    """DELETE das linhas que têm outra linha "mais recente" pro mesmo par.

    Um único statement, sem ler as linhas pra memória, e válido tanto no
    Postgres quanto no SQLite (os testes).
    """
    outra = aliased(ChapterProgress)
    existe_mais_recente = (
        select(outra.id)
        .where(
            outra.manhwa_id == ChapterProgress.manhwa_id,
            outra.filename == ChapterProgress.filename,
            or_(
                outra.updated_at > ChapterProgress.updated_at,
                and_(outra.updated_at == ChapterProgress.updated_at, outra.id > ChapterProgress.id),
            ),
        )
        .exists()
    )
    stmt = delete(ChapterProgress).where(existe_mais_recente)
    if manhwa_id is not None:
        stmt = stmt.where(ChapterProgress.manhwa_id == manhwa_id)
    if filenames is not None:
        stmt = stmt.where(ChapterProgress.filename.in_(list(filenames)))
    # `fetch` tira da sessão os objetos apagados (o `evaluate` padrão não sabe
    # avaliar o EXISTS em Python).
    return stmt.execution_options(synchronize_session="fetch")


async def remover_duplicatas_progress(
    db: AsyncSession,
    manhwa_id: Optional[int] = None,
    filenames: Optional[Iterable[str]] = None,
) -> int:
    """Apaga duplicatas de `chapter_progress`, mantendo a linha mais recente de cada par.

    Sem filtros, limpa a tabela inteira. Com `manhwa_id` e/ou `filenames`, só
    os pares correspondentes. Não faz commit. Devolve quantas linhas apagou.
    """
    if filenames is not None:
        filenames = list(filenames)
        if not filenames:
            return 0
    await db.flush()
    result = await db.execute(_stmt_remover_duplicatas(manhwa_id, filenames))
    return result.rowcount or 0


async def _main() -> int:
    from database import async_session_maker, engine

    try:
        async with async_session_maker() as db:
            removidas = await remover_duplicatas_progress(db)
            await db.commit()
    finally:
        await engine.dispose()
    print(f"chapter_progress: {removidas} linha(s) duplicada(s) removida(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
