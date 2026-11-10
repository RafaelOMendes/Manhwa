# -*- coding: utf-8 -*-
"""Teste de `cbz_pages.py`: ordem das páginas e dimensões pelo cabeçalho.

O app usa `page_sizes` (rota de info) pra montar o leitor com a altura de cada
página e baixa/mostra a página `i` pela rota `/page/{i}`: as duas listas têm que
sair na mesma ordem, e cada dimensão tem que ser a da imagem de verdade.

Sem banco, sem servidor e sem Pillow (as imagens são montadas byte a byte):

    cd backend && venv/Scripts/python.exe test_cbz_pages.py
"""
import os
import struct
import sys
import tempfile
import zipfile

import cbz_pages as cp

falhas = []


def check(condicao: bool, descricao: str):
    print(f"  [{'OK  ' if condicao else 'FALHA'}] {descricao}")
    if not condicao:
        falhas.append(descricao)


def png(w, h):
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", w, h) + b"\x08\x02\x00\x00\x00" + b"\x00" * 8


def gif(w, h):
    return b"GIF89a" + struct.pack("<HH", w, h) + b"\x00" * 8


def bmp(w, h):
    return b"BM" + b"\x00" * 12 + struct.pack("<I", 40) + struct.pack("<ii", w, -h) + b"\x00" * 30


def webp_vp8x(w, h):
    corpo = b"VP8X" + struct.pack("<I", 10) + b"\x00" * 4 + (w - 1).to_bytes(3, "little") + (h - 1).to_bytes(3, "little")
    return b"RIFF" + struct.pack("<I", len(corpo) + 4) + b"WEBP" + corpo


def webp_vp8l(w, h):
    bits = (w - 1) | ((h - 1) << 14)
    corpo = b"VP8L" + struct.pack("<I", 5) + b"\x2f" + bits.to_bytes(4, "little")
    return b"RIFF" + struct.pack("<I", len(corpo) + 4) + b"WEBP" + corpo


def webp_vp8(w, h):
    corpo = b"VP8 " + struct.pack("<I", 10) + b"\x00" * 3 + b"\x9d\x01\x2a" + struct.pack("<HH", w, h)
    return b"RIFF" + struct.pack("<I", len(corpo) + 4) + b"WEBP" + corpo


def jpeg(w, h, app_extra=0):
    # Segmentos APP de até 64KB cada (limite do formato) somando `app_extra` bytes.
    app1 = b""
    while app_extra > 0:
        parte = min(app_extra, 65_000)
        app1 += b"\xff\xe1" + struct.pack(">H", 2 + parte) + b"E" * parte
        app_extra -= parte
    sof = b"\xff\xc2" + struct.pack(">H", 17) + b"\x08" + struct.pack(">HH", h, w) + b"\x03" + b"\x00" * 9
    return b"\xff\xd8" + app1 + sof + b"\xff\xda" + b"\x00" * 20


def rodar():
    print("Dimensões pelo cabeçalho")
    for nome, dados, esperado in [
        ("PNG", png(800, 15000), (800, 15000)),
        ("GIF", gif(320, 240), (320, 240)),
        ("BMP (altura negativa)", bmp(1080, 2016), (1080, 2016)),
        ("WebP VP8X", webp_vp8x(800, 13173), (800, 13173)),
        ("WebP VP8L", webp_vp8l(720, 4500), (720, 4500)),
        ("WebP VP8", webp_vp8(1241, 8940), (1241, 8940)),
        ("JPEG progressivo", jpeg(1080, 20461), (1080, 20461)),
        ("JPEG com APP1 de 60KB antes do SOF", jpeg(900, 6807, app_extra=60_000), (900, 6807)),
    ]:
        check(cp.dimensoes_imagem(dados) == esperado, f"{nome}: {esperado}")
    check(cp.dimensoes_imagem(b"nao e imagem") is None, "lixo devolve None")
    check(cp.dimensoes_imagem(jpeg(800, 600)[:6]) is None, "JPEG truncado devolve None")
    check(cp.dimensoes_imagem(png(0, 10)) is None, "largura zero devolve None")

    with tempfile.TemporaryDirectory() as raiz:
        caminho = os.path.join(raiz, "Capítulo 01.cbz")
        grande = jpeg(800, 9000, app_extra=300_000)  # SOF além dos 256KB do cabeçalho
        with zipfile.ZipFile(caminho, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("010.jpg", jpeg(800, 1000))
            zf.writestr("002.png", png(800, 2000))
            zf.writestr("sub/005.webp", webp_vp8x(800, 3000))
            zf.writestr(".oculto.jpg", jpeg(1, 1))
            zf.writestr("info.txt", b"x")
            zf.writestr("020.jpg", grande)
            zf.writestr("030.jpg", b"\xff\xd8 corrompido")

        print("Ordem e medidas do .cbz")
        with zipfile.ZipFile(caminho) as zf:
            nomes = cp.listar_paginas(zf)
        check(nomes == ["002.png", "010.jpg", "020.jpg", "030.jpg", "sub/005.webp"],
              f"só imagens, sem ocultas, ordenadas: {nomes}")
        tamanhos = cp.dimensoes_paginas(caminho)
        check(len(tamanhos) == len(nomes), "uma medida por página")
        check(tamanhos[0] == (800, 2000) and tamanhos[1] == (800, 1000), "medidas na ordem das páginas")
        check(tamanhos[2] == (800, 9000), "SOF depois dos 256KB: lê a página inteira")
        check(tamanhos[3] is None, "página corrompida vira None, o resto continua")
        check(tamanhos[4] == (800, 3000), "página em subpasta")

        print("Cache")
        check(cp.dimensoes_paginas(caminho) is tamanhos, "segunda chamada vem do cache")
        os.utime(caminho, ns=(1, 1))
        check(cp.dimensoes_paginas(caminho) is not tamanhos, "arquivo alterado (mtime) invalida o cache")


if __name__ == "__main__":
    rodar()
    print()
    if falhas:
        print(f"{len(falhas)} FALHA(S):")
        for f in falhas:
            print("  -", f)
        sys.exit(1)
    print("Tudo OK")
