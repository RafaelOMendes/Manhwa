# -*- coding: utf-8 -*-
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool
from sqlalchemy.exc import InterfaceError, OperationalError
import os
from dotenv import load_dotenv

load_dotenv()

# URL de conexão do PostgreSQL
# Formato: postgresql+asyncpg://usuario:senha@host:porta/database
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/manhwa_tracker"
)

# Criar engine assíncrono
engine = create_async_engine(
    DATABASE_URL,
    echo=True,  # Log SQL queries (desative em produção)
    future=True,
    poolclass=NullPool,  # Útil para desenvolvimento
)

# Criar session maker
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Base para os modelos
Base = declarative_base()


def is_connection_closed_error(exc: BaseException) -> bool:
    """Detecta o caso 'conexao morreu enquanto estava ociosa'.

    Acontece em requests longos (ex.: /api/manhwas/download-all, que passa
    minutos baixando do Telegram): o Postgres/rede derruba a conexao ociosa e
    a proxima operacao levanta asyncpg InterfaceError 'connection is closed'.
    """
    if isinstance(exc, (InterfaceError, OperationalError)):
        return True
    texto = str(exc).lower()
    return "connection is closed" in texto or "connection was closed" in texto


async def safe_rollback(session):
    """Rollback que nao explode se a conexao ja estiver morta.

    Publico de proposito: endpoints longos (ex.: /api/manhwas/download-all e
    /api/manhwas/review-all) chamam isso depois de persistirem numa conexao nova,
    para descartar a sessao do request e impedir que o get_db() tente commitar
    numa conexao que ja sabemos estar morta.
    """
    try:
        await session.rollback()
    except Exception as exc:  # pragma: no cover - conexao ja inutilizavel
        print(f"[get_db] rollback ignorado (conexao ja fechada): {exc}")


async def _safe_close(session):
    """Close que nao explode se a conexao ja estiver morta."""
    try:
        await session.close()
    except Exception as exc:  # pragma: no cover - conexao ja inutilizavel
        print(f"[get_db] close ignorado (conexao ja fechada): {exc}")


# Dependency para obter session do banco
async def get_db():
    """Dependency que fornece uma sess�o do banco de dados.

    Faz commit automatico no fim do request. Se a conexao tiver morrido durante
    um request longo E a sessao nao tiver nenhuma alteracao pendente (ou seja,
    so foram feitas leituras, ou o endpoint ja persistiu por conta propria numa
    sessao nova), o erro do commit e engolido: nao ha nada a perder e deixar ele
    subir viraria um 500 confuso depois que a resposta de sucesso ja foi montada.
    Se houver alteracoes pendentes, o erro sobe normalmente - ai o commit falhou
    de verdade e o cliente PRECISA saber.
    """
    async with async_session_maker() as session:
        try:
            yield session
            # Captura antes do commit: apos um flush que falha o estado fica sujo.
            tem_alteracoes_pendentes = bool(session.new or session.dirty or session.deleted)
            try:
                await session.commit()
            except Exception as commit_exc:
                if not tem_alteracoes_pendentes and is_connection_closed_error(commit_exc):
                    print(
                        "[get_db] Conexao fechada no commit final, mas a sessao nao tinha "
                        f"alteracoes pendentes - nada foi perdido. Detalhe: {commit_exc}"
                    )
                    await safe_rollback(session)
                else:
                    raise
        except Exception:
            await safe_rollback(session)
            raise
        finally:
            await _safe_close(session)


# Fun��o para criar todas as tabelas
async def create_tables():
    """Cria todas as tabelas no banco de dados"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# Fun��o para dropar todas as tabelas (�til para testes)
async def drop_tables():
    """Remove todas as tabelas do banco de dados"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
