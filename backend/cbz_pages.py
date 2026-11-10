# -*- coding: utf-8 -*-
"""Páginas de um `.cbz`: lista ordenada e dimensões (largura × altura) de cada uma.

Usado pelas rotas `/api/manhwas/{id}/read/{filename}` (info) e `.../page/{n}`.
As duas TÊM que usar `listar_paginas()`: o índice `n` da rota de página e a
posição em `page_sizes` só batem se a ordem for a mesma — e o app baixa e mede
pelo índice.

`page_sizes` existe pro leitor do app saber a altura de TODAS as páginas antes de
montar a lista (`getItemLayout`). Sem isso ele só descobria a altura de uma página
quando ela era montada, e o botão de descer / a volta pro ponto de leitura
paravam onde a lista tinha terminado de carregar. As dimensões vêm só do
cabeçalho de cada imagem (alguns KB, sem decodificar pixel nenhum) e ficam em
cache por arquivo (caminho + mtime + tamanho).
"""
import os
import struct
import threading
import zipfile
from collections import OrderedDict
from typing import List, Optional, Tuple

EXTENSOES_IMAGEM = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
# Quanto ler do começo de cada página pra achar as dimensões. JPEG pode ter
# EXIF/ICC grandes antes do SOF; se não achar nesse pedaço, lê a página inteira.
_CABECALHO_BYTES = 256 * 1024
_PAGINA_MAX_BYTES = 64 * 1024 * 1024
_CACHE_MAX = 256

_cache: "OrderedDict[tuple, List[Optional[Tuple[int, int]]]]" = OrderedDict()
_cache_lock = threading.Lock()


def listar_paginas(zf: zipfile.ZipFile) -> List[str]:
    """Nomes das páginas (imagens, sem arquivos ocultos), na ordem de leitura."""
    return sorted(
        name
        for name in zf.namelist()
        if os.path.splitext(name.lower())[1] in EXTENSOES_IMAGEM
        and not os.path.basename(name).startswith(".")
    )


def dimensoes_imagem(dados: bytes) -> Optional[Tuple[int, int]]:
    """(largura, altura) pelo cabeçalho: JPEG, PNG, GIF, WebP e BMP. `None` se não reconhecer."""
    try:
        if dados[:8] == b"\x89PNG\r\n\x1a\n" and len(dados) >= 24:
            return _valido(*struct.unpack(">II", dados[16:24]))
        if dados[:6] in (b"GIF87a", b"GIF89a") and len(dados) >= 10:
            return _valido(*struct.unpack("<HH", dados[6:10]))
        if dados[:2] == b"BM" and len(dados) >= 26:
            if struct.unpack("<I", dados[14:18])[0] == 12:
                return _valido(*struct.unpack("<HH", dados[18:22]))
            w, h = struct.unpack("<ii", dados[18:26])
            return _valido(w, abs(h))
        if dados[:4] == b"RIFF" and dados[8:12] == b"WEBP" and len(dados) >= 16:
            chunk = dados[12:16]
            if chunk == b"VP8X" and len(dados) >= 30:
                return _valido(1 + int.from_bytes(dados[24:27], "little"), 1 + int.from_bytes(dados[27:30], "little"))
            if chunk == b"VP8 " and len(dados) >= 30:
                w, h = struct.unpack("<HH", dados[26:30])
                return _valido(w & 0x3FFF, h & 0x3FFF)
            if chunk == b"VP8L" and len(dados) >= 25:
                b = int.from_bytes(dados[21:25], "little")
                return _valido((b & 0x3FFF) + 1, ((b >> 14) & 0x3FFF) + 1)
            return None
        if dados[:2] == b"\xff\xd8":
            return _jpeg(dados)
    except (struct.error, IndexError, ValueError):
        return None
    return None


def _valido(w: int, h: int) -> Optional[Tuple[int, int]]:
    return (int(w), int(h)) if w > 0 and h > 0 else None


# Marcadores SOF com as dimensões (SOF0–SOF15, menos DHT/JPG/DAC).
_SOF = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}


def _jpeg(d: bytes) -> Optional[Tuple[int, int]]:
    i = 2
    n = len(d)
    while i + 4 <= n:
        if d[i] != 0xFF:
            i += 1
            continue
        marker = d[i + 1]
        if marker == 0xFF:  # preenchimento
            i += 1
            continue
        if marker in (0x01, 0xD8) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        if marker in _SOF:
            if i + 9 > n:
                return None
            h, w = struct.unpack(">HH", d[i + 5:i + 9])
            return _valido(w, h)
        if marker == 0xDA:  # início dos dados: SOF devia ter vindo antes
            return None
        tamanho = struct.unpack(">H", d[i + 2:i + 4])[0]
        if tamanho < 2:
            return None
        i += 2 + tamanho
    return None


def _medir(zf: zipfile.ZipFile, nome: str) -> Optional[Tuple[int, int]]:
    with zf.open(nome) as f:
        tamanho = dimensoes_imagem(f.read(_CABECALHO_BYTES))
    # Teto na leitura completa: um arquivo gigante com extensão de imagem (zip
    # malformado ou "zip bomb") não pode ser descompactado inteiro na memória só
    # pra procurar um cabeçalho.
    if tamanho is None and _CABECALHO_BYTES < zf.getinfo(nome).file_size <= _PAGINA_MAX_BYTES:
        tamanho = dimensoes_imagem(zf.read(nome))
    return tamanho


def dimensoes_paginas(cbz_path: str) -> List[Optional[Tuple[int, int]]]:
    """Dimensões de cada página, na ordem de `listar_paginas()`. `None` na que não deu pra medir."""
    st = os.stat(cbz_path)
    chave = (os.path.realpath(cbz_path), st.st_mtime_ns, st.st_size)
    with _cache_lock:
        if chave in _cache:
            _cache.move_to_end(chave)
            return _cache[chave]
    with zipfile.ZipFile(cbz_path, "r") as zf:
        resultado: List[Optional[Tuple[int, int]]] = []
        for nome in listar_paginas(zf):
            try:
                resultado.append(_medir(zf, nome))
            except (zipfile.BadZipFile, OSError, RuntimeError, ValueError):
                resultado.append(None)
    with _cache_lock:
        _cache[chave] = resultado
        _cache.move_to_end(chave)
        while len(_cache) > _CACHE_MAX:
            _cache.popitem(last=False)
    return resultado
