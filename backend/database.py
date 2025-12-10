# -*- coding: utf-8 -*-
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool
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


# Dependency para obter session do banco
async def get_db():
    """Dependency que fornece uma sess�o do banco de dados"""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


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
