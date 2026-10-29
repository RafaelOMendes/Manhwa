# -*- coding: utf-8 -*-
import asyncio
import logging
import os

import asyncpg
from dotenv import load_dotenv
from sqlalchemy import event
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool
from sqlalchemy.util import await_only

load_dotenv()

logger = logging.getLogger(__name__)

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
    # Sem isso o asyncpg espera até 60s por conexão; com o Neon suspenso/rede
    # instável o request ficava pendurado até estourar TimeoutError. Com o
    # timeout curto a tentativa falha rápido e o retry abaixo assume.
    connect_args={"timeout": 15},
)

# Erros de conexão/rede que costumam passar sozinhos (Neon acordando de suspensão,
# DNS ou rede oscilando, handshake/auth que estoura). Credencial errada
# (InvalidPasswordError etc.) NÃO entra: repetir não ajuda.
_TRANSIENT_DB_ERRORS = (
    OSError,  # inclui ConnectionResetError, socket.gaierror e TimeoutError
    asyncio.TimeoutError,
    asyncpg.exceptions.PostgresConnectionError,  # ConnectionDoesNotExistError, CannotConnectNowError...
    asyncpg.exceptions.ProtocolViolationError,  # "Authentication timed out"
    asyncpg.exceptions.InternalClientError,  # "another operation is in progress" (operação cancelada no meio)
)

CONNECT_ATTEMPTS = 3
CONNECT_RETRY_DELAY_SECONDS = 1.0


@event.listens_for(engine.sync_engine, "do_connect")
def _connect_with_retry(dialect, conn_rec, cargs, cparams):
    """Abre a conexão com até CONNECT_ATTEMPTS tentativas em erro transitório.

    Como o pool é NullPool, cada request abre uma conexão nova; uma falha de
    rede/Neon na hora de conectar virava 500 direto. Roda dentro do greenlet do
    SQLAlchemy, então a espera usa await_only (não bloqueia o event loop).
    """
    for tentativa in range(1, CONNECT_ATTEMPTS + 1):
        try:
            return dialect.connect(*cargs, **cparams)
        except _TRANSIENT_DB_ERRORS as exc:
            if tentativa == CONNECT_ATTEMPTS:
                raise
            logger.warning(
                "Falha ao conectar no banco (tentativa %d/%d): %s: %s — tentando de novo",
                tentativa, CONNECT_ATTEMPTS, type(exc).__name__, exc,
            )
            await_only(asyncio.sleep(CONNECT_RETRY_DELAY_SECONDS * tentativa))

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


def is_transient_db_error(exc: BaseException) -> bool:
    """True se `exc` (ou algo na sua cadeia de causas) é falha de conexão com o banco.

    São erros externos e inevitáveis (rede, Neon suspenso, conexão derrubada no meio
    da query): o endpoint responde 503 controlado em vez de 500 com stack trace.
    """
    visto = set()
    atual = exc
    while atual is not None and id(atual) not in visto:
        visto.add(id(atual))
        if isinstance(atual, _TRANSIENT_DB_ERRORS):
            return True
        atual = getattr(atual, "orig", None) or atual.__cause__ or atual.__context__
    return is_connection_closed_error(exc)


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
