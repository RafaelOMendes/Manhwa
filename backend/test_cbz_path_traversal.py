# -*- coding: utf-8 -*-
"""Teste do `_cbz_path`: o nome de arquivo da URL nunca pode sair da pasta do manhwa.

As rotas `/api/manhwas/{id}/read/{filename}[/download|/page/N]` montavam o caminho
com `os.path.join(pasta_do_manhwa, filename)`. O `{filename}` do Starlette só barra
`/`, então `..\\..\\x` e `C:\\Windows\\win.ini` chegavam inteiros — e no Windows o
`join` trata `\\` como separador e deixa um caminho absoluto substituir a base. A
rota `/download` devolvia o arquivo cru: leitura de qualquer arquivo do PC.

Não precisa de banco nem do servidor no ar (usa um diretório temporário):

    cd backend && venv/Scripts/python.exe test_cbz_path_traversal.py
"""
import os
import sys
import tempfile

from fastapi import HTTPException

import main

falhas = []


def check(condicao: bool, descricao: str):
    print(f"  [{'OK  ' if condicao else 'FALHA'}] {descricao}")
    if not condicao:
        falhas.append(descricao)


def recusado(titulo: str, filename: str) -> bool:
    try:
        main._cbz_path(titulo, filename)
    except HTTPException as exc:
        return exc.status_code == 404
    return False


def rodar():
    with tempfile.TemporaryDirectory() as raiz:
        main.DOWNLOAD_DIR = os.path.join(raiz, "Manhwas")
        pasta = os.path.join(main.DOWNLOAD_DIR, "Solo Leveling")
        os.makedirs(pasta)
        capitulo = os.path.join(pasta, "Capítulo 01.cbz")
        open(capitulo, "wb").close()
        # Fora da pasta do manhwa: o que um nome malicioso tentaria alcançar.
        segredo = os.path.join(raiz, "segredo.cbz")
        open(segredo, "wb").close()
        vizinho = os.path.join(main.DOWNLOAD_DIR, "Outro Manhwa")
        os.makedirs(vizinho)
        open(os.path.join(vizinho, "Capítulo 01.cbz"), "wb").close()

        print("Nomes legítimos")
        check(
            main._cbz_path("Solo Leveling", "Capítulo 01.cbz") == os.path.realpath(capitulo),
            "capítulo existente resolve pra dentro da pasta do manhwa",
        )
        check(
            os.path.dirname(main._cbz_path("Solo Leveling", "Capítulo 99 (2).CBZ"))
            == os.path.realpath(pasta),
            "nome com espaço, parênteses e extensão maiúscula é aceito (404 fica pra rota)",
        )

        print("Nomes que tentam sair da pasta")
        for nome in [
            "..",
            ".",
            "",
            "..\\..\\segredo.cbz",
            "../../segredo.cbz",
            "..\\Outro Manhwa\\Capítulo 01.cbz",
            "../Outro Manhwa/Capítulo 01.cbz",
            segredo,  # caminho absoluto
            "C:\\Windows\\win.ini",
            "C:segredo.cbz",  # relativo ao drive, no Windows
            "\\\\servidor\\share\\x.cbz",  # UNC
            "sub/Capítulo 01.cbz",
            "Capítulo 01.cbz\x00.jpg",
        ]:
            check(recusado("Solo Leveling", nome), f"recusa {nome!r}")

        print("Só .cbz")
        open(os.path.join(pasta, "notas.txt"), "wb").close()
        check(recusado("Solo Leveling", "notas.txt"), "arquivo que não é .cbz é recusado")

        if os.name == "nt":
            print("Regressão (Windows): o join antigo escapava")
            antigo = os.path.join(pasta, segredo)
            check(antigo == segredo, "os.path.join(base, absoluto) devolve o absoluto")


if __name__ == "__main__":
    rodar()
    print()
    if falhas:
        print(f"{len(falhas)} FALHA(S):")
        for f in falhas:
            print("  -", f)
        sys.exit(1)
    print("Tudo OK")
