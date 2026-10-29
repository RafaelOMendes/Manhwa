# -*- coding: utf-8 -*-
"""Teste offline (sem rede/banco) do retry de conexão e da classificação de erro transitório.

Rodar:
    cd backend && venv/Scripts/python.exe test_db_resilience.py
"""
import asyncio
import socket
import sys

import asyncpg
from sqlalchemy.exc import DBAPIError
from sqlalchemy.util import greenlet_spawn

import database

falhas = 0


def check(cond, msg):
    global falhas
    print(("  ok   " if cond else "  FALHA ") + msg)
    if not cond:
        falhas += 1


class FakeDialect:
    def __init__(self, erros):
        self.erros = list(erros)
        self.chamadas = 0

    def connect(self, *a, **kw):
        self.chamadas += 1
        if self.erros:
            raise self.erros.pop(0)
        return "conexao"


async def tenta(dialect):
    return await greenlet_spawn(database._connect_with_retry, dialect, None, (), {})


async def main():
    database.CONNECT_RETRY_DELAY_SECONDS = 0

    print("1) retry de conexão")
    d = FakeDialect([socket.gaierror(11001, "getaddrinfo failed"), ConnectionResetError("reset")])
    check(await tenta(d) == "conexao" and d.chamadas == 3, "2 falhas transitórias e depois conecta (3 chamadas)")

    d = FakeDialect([TimeoutError()] * 5)
    try:
        await tenta(d)
        check(False, "esgotadas as tentativas deveria levantar")
    except TimeoutError:
        check(d.chamadas == database.CONNECT_ATTEMPTS, f"esgota em {database.CONNECT_ATTEMPTS} tentativas e relança")

    d = FakeDialect([asyncpg.exceptions.InvalidPasswordError("senha errada")])
    try:
        await tenta(d)
    except asyncpg.exceptions.InvalidPasswordError:
        check(d.chamadas == 1, "credencial inválida não é retentada")

    print("2) is_transient_db_error")
    check(database.is_transient_db_error(asyncpg.exceptions.ConnectionDoesNotExistError("x")), "ConnectionDoesNotExistError")
    check(database.is_transient_db_error(asyncpg.exceptions.ProtocolViolationError("Authentication timed out")), "auth timeout")
    check(database.is_transient_db_error(asyncpg.exceptions.InternalClientError("another operation")), "InternalClientError")
    check(database.is_transient_db_error(socket.gaierror(11001, "x")), "gaierror")
    check(database.is_transient_db_error(TimeoutError()), "TimeoutError")
    envolvido = DBAPIError("SELECT 1", {}, ConnectionResetError("reset"))
    check(database.is_transient_db_error(envolvido), "DBAPIError embrulhando ConnectionResetError")
    check(not database.is_transient_db_error(ValueError("bug")), "ValueError não é transitório")
    check(not database.is_transient_db_error(asyncpg.exceptions.InvalidPasswordError("x")), "senha inválida não é transitório")


asyncio.run(main())
print("\nFALHOU" if falhas else "\nTudo certo.")
sys.exit(1 if falhas else 0)
