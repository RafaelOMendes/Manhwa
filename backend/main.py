# -*- coding: utf-8 -*-
import time
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.responses import Response, FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
import os
import re
from contextlib import asynccontextmanager

from database import (
    get_db,
    create_tables,
    async_session_maker,
    is_connection_closed_error,
    safe_rollback,
)
from models import Manhwa as ManhwaModel, ChapterProgress
from error_logger import log_error

DOWNLOAD_DIR = os.environ.get("DOWNLOAD_DIR", r"D:\Manhwas")


def _env_int(nome: str, padrao: int, minimo: int, maximo: int) -> int:
    """Lê um int do ambiente, com limites — valor inválido cai no padrão."""
    try:
        valor = int(os.environ.get(nome, padrao))
    except (TypeError, ValueError):
        return padrao
    return max(minimo, min(maximo, valor))


# Quantas leituras de tópico do Telegram o /api/manhwas/review-all faz em paralelo.
# Ver AGENT_INSTRUCTIONS.md (Backend) para o critério do limite.
REVIEW_PARALLELISM = _env_int("REVIEW_PARALLELISM", 4, 1, 16)

# Token de acesso. Se vazio (ex.: dev local), a auth fica desligada.
# No VPS, defina API_TOKEN no ambiente para exigir o token em todas as rotas.
API_TOKEN = os.environ.get("API_TOKEN", "").strip()


async def verify_token(request: Request):
    """Exige o token quando API_TOKEN está definido.

    Aceita via header `Authorization: Bearer <token>` (usado pelos fetch)
    ou via query `?token=<token>` (usado pelas <img> das páginas, que não
    conseguem enviar headers).
    """
    if not API_TOKEN:
        return
    auth = request.headers.get("Authorization", "")
    token = auth[7:].strip() if auth[:7].lower() == "bearer " else ""
    if not token:
        token = request.query_params.get("token", "")
    if token != API_TOKEN:
        raise HTTPException(status_code=401, detail="Token inválido ou ausente")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gerencia o ciclo de vida da aplicação"""
    # Startup: criar tabelas
    await create_tables()
    yield
    # Shutdown: limpeza (se necessário)


app = FastAPI(title="Manhwa Tracker API", lifespan=lifespan, dependencies=[Depends(verify_token)])

# Serve cover images from the frontend public folder
# This lets mobile clients load covers via http://<host>:8000/covers/<filename>
_covers_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "covers")
os.makedirs(_covers_dir, exist_ok=True)
app.mount("/covers", StaticFiles(directory=_covers_dir), name="covers")

# Configuração de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Garante corpo JSON consistente para qualquer exceção não tratada.

    Sem isso, uma exceção que escapa do endpoint (ex.: no commit automático do
    get_db() rodando DEPOIS que o endpoint já retornou um dict de sucesso) vira
    o texto puro "Internal Server Error" do Starlette — não é JSON, então
    `response.json()` no frontend quebra e cai no catch genérico ("Erro de
    conexão com o servidor"), mesmo quando os dados já tinham sido salvos
    corretamente no banco. Não intercepta HTTPException (tratada à parte pelo
    FastAPI), só o que sobrar.
    """
    print(f"❌ ERRO NÃO TRATADO em {request.url.path}: {exc}")
    log_error(exc, context=f"ERRO NÃO TRATADO em {request.url.path}")
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": f"Erro interno do servidor: {str(exc)}"},
    )

# Modelos Pydantic
class ManhwaBase(BaseModel):
    title: str
    cover_url: Optional[str] = None
    status: str = "plan_to_read"  # reading, completed, plan_to_read
    andamento: Optional[str] = "andamento"
    current_chapter: Optional[int] = 0
    total_chapters: Optional[int] = None
    rating: Optional[int] = None
    notes: Optional[str] = None
    download: Optional[bool] = False
    medium_reaction: Optional[int] = None

class ManhwaCreate(ManhwaBase):
    pass

class ManhwaUpdate(ManhwaBase):
    pass

class Manhwa(ManhwaBase):
    id: int
    download: bool
    medium_reaction: Optional[int] = None
    created_at: str
    updated_at: str

class TelegramImportRequest(BaseModel):
    channel_link: str
    auto_status: str = "plan_to_read"


class SyncResponse(BaseModel):
    """Formato de resposta único do /api/manhwas/download-all — sucesso, falha
    parcial (revertida) e falha crítica sempre retornam este mesmo shape, para
    o frontend nunca cair no `{ detail: ... }` padrão do FastAPI."""
    success: bool
    message: str
    results: List[dict] = []
    total_downloaded: int = 0
    total_skipped: int = 0
    total_errors: int = 0
    manhwas_processed: int = 0


import asyncio

_shared_scraper = None
_scraper_lock = asyncio.Lock()

async def get_telegram_scraper():
    """Retorna uma instância única e conectada do scraper do Telegram para evitar erro de banco travado."""
    global _shared_scraper
    from telegram_scraper import TelegramManhwaScraper
    
    async with _scraper_lock:
        if _shared_scraper is None:
            try:
                _shared_scraper = TelegramManhwaScraper()
            except Exception as e:
                if "database is locked" in str(e).lower():
                    raise ValueError("O banco de dados do Telegram está travado por um processo zumbi. Cancele o backend (Ctrl+C) e inicie novamente.")
                raise e
            
        if not _shared_scraper.client.is_connected():
            try:
                await _shared_scraper.connect()
            except Exception as e:
                if "database is locked" in str(e).lower():
                    raise ValueError("O banco de dados do Telegram está travado por um processo zumbi. Cancele o backend (Ctrl+C) e inicie novamente.")
                raise e
                
        return _shared_scraper

# Rotas da API
@app.get("/")
def root():
    return {"message": "Manhwa Tracker API"}

@app.get("/api/manhwas", response_model=List[Manhwa])
async def get_manhwas(status: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """Retorna todos os manhwas, opcionalmente filtrados por status"""
    query = select(ManhwaModel)
    if status:
        query = query.where(ManhwaModel.status == status)
    
    result = await db.execute(query)
    manhwas = result.scalars().all()
    
    return [manhwa.to_dict() for manhwa in manhwas]

@app.get("/api/manhwas/{manhwa_id}", response_model=Manhwa)
async def get_manhwa(manhwa_id: int, db: AsyncSession = Depends(get_db)):
    """Retorna um manhwa específico"""
    result = await db.execute(select(ManhwaModel).where(ManhwaModel.id == manhwa_id))
    manhwa = result.scalar_one_or_none()
    
    if not manhwa:
        raise HTTPException(status_code=404, detail="Manhwa não encontrado")
    
    return manhwa.to_dict()

@app.post("/api/manhwas", response_model=Manhwa, status_code=201)
async def create_manhwa(manhwa: ManhwaCreate, db: AsyncSession = Depends(get_db)):
    """Cria um novo manhwa"""
    new_manhwa = ManhwaModel(**manhwa.model_dump())
    
    db.add(new_manhwa)
    await db.commit()
    await db.refresh(new_manhwa)
    
    return new_manhwa.to_dict()

@app.put("/api/manhwas/{manhwa_id}", response_model=Manhwa)
async def update_manhwa(manhwa_id: int, manhwa: ManhwaUpdate, db: AsyncSession = Depends(get_db)):
    """Atualiza um manhwa existente"""
    result = await db.execute(select(ManhwaModel).where(ManhwaModel.id == manhwa_id))
    db_manhwa = result.scalar_one_or_none()
    
    if not db_manhwa:
        raise HTTPException(status_code=404, detail="Manhwa não encontrado")
    
    # Atualizar campos
    for key, value in manhwa.model_dump().items():
        setattr(db_manhwa, key, value)
    
    await db.commit()
    await db.refresh(db_manhwa)
    
    return db_manhwa.to_dict()

@app.delete("/api/manhwas/{manhwa_id}", status_code=204)
async def delete_manhwa(manhwa_id: int, db: AsyncSession = Depends(get_db)):
    """Deleta um manhwa"""
    result = await db.execute(select(ManhwaModel).where(ManhwaModel.id == manhwa_id))
    manhwa = result.scalar_one_or_none()
    
    if not manhwa:
        raise HTTPException(status_code=404, detail="Manhwa não encontrado")
    
    await db.delete(manhwa)
    await db.commit()
    
    return None

def _manhwa_download_dir(title: str) -> str:
    """Diretório dos .cbz de um manhwa — mesmo saneamento de nome usado pelo scraper."""
    safe_name = "".join(c for c in title if c.isalnum() or c in " _-().").strip()
    return os.path.join(DOWNLOAD_DIR, safe_name or "Manhwa_Desconhecido")


def _extract_chapter_number(filename: str) -> float:
    """Extrai o número do capítulo do nome do arquivo para ordenação."""
    # Tenta padrões como "Cap 01", "Chapter 123", "Cap. 05", "- 10 -", etc.
    m = re.search(r'(?:cap(?:[ií]tulo)?\.?\s*|chapter\s*|ch\.?\s*|ep\.?\s*|#)(\d+(?:\.\d+)?)', filename, re.IGNORECASE)
    if m:
        return float(m.group(1))
    # Fallback: pega qualquer número no nome
    nums = re.findall(r'(\d+(?:\.\d+)?)', filename)
    if nums:
        return float(nums[-1])
    return 0


def _scan_cbz_files(download_dir: str) -> List[dict]:
    """Lista os .cbz de um diretório já ordenados pelo número do capítulo.

    Bloqueante por natureza (syscalls de disco): não chame direto de uma rota
    async — use `_list_cbz_files_async`, que joga isso numa thread.

    Usa `os.scandir` em vez de `listdir` + `getsize` por arquivo: o DirEntry já
    vem com os metadados da própria listagem (no Windows, sempre; no Linux, o
    stat é feito uma vez só), então some um syscall por arquivo.
    """
    raw_files = []
    try:
        with os.scandir(download_dir) as entradas:
            for entrada in entradas:
                if not entrada.name.lower().endswith('.cbz'):
                    continue
                try:
                    tamanho = entrada.stat().st_size
                except OSError:
                    # Arquivo sumiu no meio da varredura (download em andamento,
                    # por exemplo). Ignorar é melhor que derrubar a listagem toda.
                    continue
                raw_files.append({
                    "name": entrada.name,
                    "size_mb": round(tamanho / (1024 * 1024), 1),
                    "chapter_number": _extract_chapter_number(entrada.name),
                })
    except (FileNotFoundError, NotADirectoryError, PermissionError):
        # Diretório inexistente (manhwa sem nada baixado ainda) ou inacessível.
        return []

    raw_files.sort(key=lambda x: x["chapter_number"])
    return raw_files


async def _list_cbz_files_async(download_dir: str) -> List[dict]:
    """Versão não-bloqueante de `_scan_cbz_files`.

    O ganho aqui não é paralelizar `getsize` arquivo a arquivo — despachar uma
    thread por arquivo custa mais que o syscall que ela faria. É tirar a
    varredura inteira do event loop: assim as chamadas simultâneas de
    `/files` (o mobile pede 4 manhwas em paralelo) de fato se sobrepõem em vez
    de enfileirar atrás de uma listagem síncrona.
    """
    return await asyncio.to_thread(_scan_cbz_files, download_dir)


@app.get("/api/manhwas/{manhwa_id}/files")
async def list_manhwa_files(manhwa_id: int, db: AsyncSession = Depends(get_db)):
    """Lista os arquivos .cbz baixados de um manhwa em D:\\Manhwas\\{titulo}\\"""
    result = await db.execute(select(ManhwaModel).where(ManhwaModel.id == manhwa_id))
    manhwa = result.scalar_one_or_none()

    if not manhwa:
        raise HTTPException(status_code=404, detail="Manhwa não encontrado")

    download_dir = _manhwa_download_dir(manhwa.title)

    # Diretório inexistente já cai em [] dentro do scan — sem checagem extra
    # aqui, a resposta tem sempre o mesmo formato (inclusive `current_chapter`).
    return {
        "files": await _list_cbz_files_async(download_dir),
        "path": download_dir,
        "current_chapter": manhwa.current_chapter or 0,
    }

class UpdateCurrentChapter(BaseModel):
    current_chapter: int


async def _mark_previous_chapters_read(db: AsyncSession, manhwa: ManhwaModel, current_chapter: int) -> int:
    """Registra como lidos todos os capítulos anteriores ao capítulo atual.

    Um capítulo conta como lido quando existe um ChapterProgress pro arquivo
    dele. Aqui só criamos os que faltam, com scroll_position=0 — registros
    existentes não são tocados, pra não apagar posição de scroll real. Nada é
    deletado: regredir o current_chapter mantém o histórico de leitura.

    Devolve quantos registros novos foram adicionados à sessão (o commit fica
    a cargo de quem chamou).
    """
    if current_chapter <= 1:
        return 0

    arquivos = await _list_cbz_files_async(_manhwa_download_dir(manhwa.title))
    if not arquivos:
        return 0

    # chapter_number == 0 é o fallback de "não achei número no nome do arquivo";
    # marcar esses como lidos seria chute, então ficam de fora.
    anteriores = [f["name"] for f in arquivos if 0 < f["chapter_number"] < current_chapter]
    if not anteriores:
        return 0

    result = await db.execute(
        select(ChapterProgress.filename).where(ChapterProgress.manhwa_id == manhwa.id)
    )
    ja_registrados = set(result.scalars().all())

    novos = 0
    for filename in anteriores:
        if filename in ja_registrados:
            continue
        db.add(ChapterProgress(manhwa_id=manhwa.id, filename=filename, scroll_position=0))
        novos += 1

    return novos


@app.patch("/api/manhwas/{manhwa_id}/current-chapter")
async def update_current_chapter(manhwa_id: int, body: UpdateCurrentChapter, db: AsyncSession = Depends(get_db)):
    """Atualiza o current_chapter de um manhwa (chamado ao terminar de ler um capítulo).

    Também marca automaticamente como lidos todos os capítulos anteriores ao
    informado — quem pula direto pro 50 não fica com 1..49 aparecendo como não lidos.
    """
    result = await db.execute(select(ManhwaModel).where(ManhwaModel.id == manhwa_id))
    manhwa = result.scalar_one_or_none()
    if not manhwa:
        raise HTTPException(status_code=404, detail="Manhwa não encontrado")

    updated = False
    # Atualiza o capítulo atual para o capítulo que acabou de ser lido (permite regressão)
    if manhwa.current_chapter != body.current_chapter:
        manhwa.current_chapter = body.current_chapter
        updated = True

    # Muda automaticamente para "reading" se não estiver lendo ou completo
    if manhwa.status not in ("reading", "completed"):
        manhwa.status = "reading"
        updated = True

    marcados = await _mark_previous_chapters_read(db, manhwa, body.current_chapter)

    if updated or marcados:
        await db.commit()
        await db.refresh(manhwa)

    return {
        "success": True,
        "current_chapter": manhwa.current_chapter,
        "status": manhwa.status,
        "chapters_marked_read": marcados,
    }

class ScrollUpdate(BaseModel):
    scroll_position: int

@app.put("/api/manhwas/{manhwa_id}/read/{filename}/scroll")
async def update_scroll(manhwa_id: int, filename: str, body: ScrollUpdate, db: AsyncSession = Depends(get_db)):
    """Salva a posição de rolagem de um capítulo específico"""
    result = await db.execute(select(ChapterProgress).where(
        (ChapterProgress.manhwa_id == manhwa_id) &
        (ChapterProgress.filename == filename)
    ))
    progress = result.scalar_one_or_none()

    if progress:
        progress.scroll_position = body.scroll_position
    else:
        progress = ChapterProgress(manhwa_id=manhwa_id, filename=filename, scroll_position=body.scroll_position)
        db.add(progress)
        
    await db.commit()
    return {"success": True}

@app.get("/api/manhwas/{manhwa_id}/read/{filename}/scroll")
async def get_scroll(manhwa_id: int, filename: str, db: AsyncSession = Depends(get_db)):
    """Retorna a posição de rolagem salva de um capítulo específico"""
    result = await db.execute(select(ChapterProgress).where(
        (ChapterProgress.manhwa_id == manhwa_id) &
        (ChapterProgress.filename == filename)
    ))
    progress = result.scalar_one_or_none()

    return {"scroll_position": progress.scroll_position if progress else 0}

@app.get("/api/manhwas/{manhwa_id}/read/{filename}")
async def get_cbz_info(manhwa_id: int, filename: str, db: AsyncSession = Depends(get_db)):
    """Retorna informações do CBZ (número de páginas)"""
    import zipfile

    result = await db.execute(select(ManhwaModel).where(ManhwaModel.id == manhwa_id))
    manhwa = result.scalar_one_or_none()
    if not manhwa:
        raise HTTPException(status_code=404, detail="Manhwa não encontrado")

    cbz_path = os.path.join(_manhwa_download_dir(manhwa.title), filename)

    if not os.path.exists(cbz_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    image_extensions = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'}

    with zipfile.ZipFile(cbz_path, 'r') as zf:
        pages = sorted([
            name for name in zf.namelist()
            if os.path.splitext(name.lower())[1] in image_extensions
            and not os.path.basename(name).startswith('.')
        ])

    return {"filename": filename, "total_pages": len(pages), "pages": list(range(len(pages)))}

@app.get("/api/manhwas/{manhwa_id}/read/{filename}/download")
async def download_cbz_file(manhwa_id: int, filename: str, db: AsyncSession = Depends(get_db)):
    """Serve o .cbz inteiro pra download (usado pelo cache local do mobile)."""
    result = await db.execute(select(ManhwaModel).where(ManhwaModel.id == manhwa_id))
    manhwa = result.scalar_one_or_none()
    if not manhwa:
        print(f"📵 [APP-DOWNLOAD] 404 — manhwa_id={manhwa_id} não existe")
        raise HTTPException(status_code=404, detail="Manhwa não encontrado")

    cbz_path = os.path.join(_manhwa_download_dir(manhwa.title), filename)

    if not os.path.exists(cbz_path):
        print(f"📵 [APP-DOWNLOAD] 404 — {manhwa.title} / {filename} (não está em disco)")
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    size_mb = os.path.getsize(cbz_path) / (1024 * 1024)
    print(f"📤 [APP-DOWNLOAD] {manhwa.title} / {filename} → enviando {size_mb:.1f}MB pro celular")

    return FileResponse(
        cbz_path,
        media_type="application/zip",
        filename=filename,
        headers={"Cache-Control": "public, max-age=86400"},
    )

@app.get("/api/manhwas/{manhwa_id}/read/{filename}/page/{page_num}")
async def get_cbz_page(manhwa_id: int, filename: str, page_num: int, db: AsyncSession = Depends(get_db)):
    """Serve uma página individual do CBZ como imagem"""
    import zipfile

    result = await db.execute(select(ManhwaModel).where(ManhwaModel.id == manhwa_id))
    manhwa = result.scalar_one_or_none()
    if not manhwa:
        raise HTTPException(status_code=404, detail="Manhwa não encontrado")

    cbz_path = os.path.join(_manhwa_download_dir(manhwa.title), filename)

    if not os.path.exists(cbz_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    image_extensions = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'}

    with zipfile.ZipFile(cbz_path, 'r') as zf:
        pages = sorted([
            name for name in zf.namelist()
            if os.path.splitext(name.lower())[1] in image_extensions
            and not os.path.basename(name).startswith('.')
        ])

        if page_num < 0 or page_num >= len(pages):
            raise HTTPException(status_code=404, detail="Página não encontrada")

        page_name = pages[page_num]
        ext = os.path.splitext(page_name.lower())[1]
        content_types = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.png': 'image/png', '.webp': 'image/webp',
            '.gif': 'image/gif', '.bmp': 'image/bmp',
        }

        image_data = zf.read(page_name)
        return Response(
            content=image_data,
            media_type=content_types.get(ext, 'image/jpeg'),
            headers={"Cache-Control": "public, max-age=86400"}
        )

async def _persist_sync_updates(pending_updates: dict) -> int:
    """Persiste as alterações da sincronização numa sessão/conexão NOVA.

    Motivo: a sessão do request (`db`) fica ociosa durante todo o download do
    Telegram, que pode levar vários minutos. Nesse meio tempo o Postgres/rede
    derruba a conexão, e qualquer escrita nela falha com
    `InterfaceError: connection is closed` — mesmo que a escrita seja feita
    imediatamente após o `asyncio.gather()`, porque a conexão já está morta há
    minutos. Por isso as alterações são acumuladas como dados simples durante os
    downloads e só aqui, no fim, aplicadas numa conexão nova e saudável.

    Tudo vai numa única transação: ou todas as alterações entram, ou nenhuma.
    Retorna a quantidade de manhwas atualizados.
    """
    if not pending_updates:
        print("💾 Nenhuma alteração para persistir (nada mudou nesta sincronização).")
        return 0

    print(f"\n💾 Commitando alterações no banco... ({len(pending_updates)} manhwa(s) com mudanças)")

    # Uma tentativa extra cobre o caso raro da conexão nova nascer inutilizável.
    ultima_excecao = None
    for tentativa in (1, 2):
        async with async_session_maker() as write_session:
            try:
                for manhwa_id, changes in pending_updates.items():
                    await write_session.execute(
                        update(ManhwaModel)
                        .where(ManhwaModel.id == manhwa_id)
                        .values(**changes)
                    )
                await write_session.commit()
                print(f"   ✅ Alterações commitadas com sucesso ({len(pending_updates)} manhwa(s)).")
                return len(pending_updates)
            except Exception as exc:
                ultima_excecao = exc
                try:
                    await write_session.rollback()
                except Exception:
                    pass
                if tentativa == 1 and is_connection_closed_error(exc):
                    print(f"   ⚠️  Conexão morta na tentativa 1 ({exc}). Repetindo numa conexão nova...")
                    continue
                print(f"   ❌ Falha ao commitar alterações: {exc}")
                raise

    raise ultima_excecao


@app.post("/api/manhwas/download-all", response_model=SyncResponse, status_code=200)
async def download_all_manhwas(db: AsyncSession = Depends(get_db)):
    """
    Sincroniza todos os manhwas em paralelo: baixa os .cbz de todos que possuem link do Telegram
    para D:\\Manhwas\\{titulo}\\ usando uma única conexão com downloads concorrentes.
    """
    import asyncio

    sync_start = time.time()
    print("\n" + "=" * 60)
    print("📥 SINCRONIZAÇÃO DE DOWNLOADS INICIADA")
    print(f"⏰ Horário: {datetime.now().strftime('%H:%M:%S')}")
    print("=" * 60)

    # Buscar todos os manhwas com link do Telegram
    print("\n🔍 Buscando manhwas no banco de dados...")
    result = await db.execute(select(ManhwaModel))
    all_manhwas = result.scalars().all()
    print(f"   Total de manhwas no banco: {len(all_manhwas)}")

    manhwas_to_download = [
        m for m in all_manhwas
        if m.notes and 't.me' in m.notes and m.download
    ]

    print(f"   Com link Telegram + download ativo: {len(manhwas_to_download)}")
    
    if not manhwas_to_download:
        print("⚠️  Nenhum manhwa elegível para sincronização.")
        print("=" * 60 + "\n")
        resposta = {
            "success": True,
            "message": "Nenhum manhwa com link do Telegram encontrado.",
            "results": [],
            "total_downloaded": 0,
            "total_skipped": 0,
            "total_errors": 0,
            "manhwas_processed": 0,
        }
        print(f"✅ Retornando resposta de sucesso ao frontend: {resposta['message']}")
        return resposta

    # Listar os manhwas que serão processados
    print("\n📋 Fila de sincronização:")
    for i, m in enumerate(manhwas_to_download, 1):
        print(f"   {i}. {m.title}")

    try:
        print("\n🔌 Conectando ao Telegram...")
        scraper = await get_telegram_scraper()
        print("   ✅ Conexão com Telegram estabelecida.")
        results_list = []

        # Semáforo para limitar manhwas simultâneos (1 por vez para evitar Flood 429 do Telegram)
        manhwa_sem = asyncio.Semaphore(1)
        processed_count = 0

        # Alterações acumuladas como dados simples ({id: {campo: valor}}), NÃO
        # aplicadas na sessão `db` — a conexão dela morre durante os downloads
        # longos. São persistidas no fim, numa conexão nova (_persist_sync_updates).
        pending_updates: dict = {}

        async def download_one_manhwa(manhwa):
            nonlocal processed_count
            async with manhwa_sem:
                processed_count += 1
                manhwa_start = time.time()
                print(f"\n{'─' * 50}")
                print(f"📦 [{processed_count}/{len(manhwas_to_download)}] Processando: {manhwa.title}")
                print(f"   Link: {manhwa.notes}")
                try:
                    dl_result = await scraper.download_cbz_from_topic(manhwa.notes, manhwa.title)
                    dl_result["manhwa_title"] = manhwa.title
                    
                    elapsed = time.time() - manhwa_start
                    dl = dl_result.get('downloaded', 0)
                    sk = dl_result.get('skipped', 0)
                    rp = dl_result.get('replaced', 0)
                    er = dl_result.get('errors', 0)
                    
                    print(f"   📊 Resultado: {dl} baixados | {sk} já existiam | {rp} substituídos | {er} erros")
                    print(f"   ⏱️  Tempo: {elapsed:.1f}s")
                    
                    # Acumular alterações (aplicadas no banco só no fim, numa
                    # conexão nova — ver _persist_sync_updates).
                    changes = {}

                    # Atualizar total de capítulos no banco de dados
                    if dl_result.get("success") and "total" in dl_result:
                        total_found = dl_result["total"]
                        if manhwa.total_chapters != total_found:
                            print(f"   🔄 Atualizando total de capítulos: {manhwa.total_chapters} → {total_found}")
                            changes["total_chapters"] = total_found

                    # Atualizar reação média (recalculada no mesmo loop do download)
                    if dl_result.get("success") and "medium_reaction" in dl_result:
                        new_reaction = dl_result["medium_reaction"]
                        if manhwa.medium_reaction != new_reaction:
                            print(f"   ❤️ Atualizando reação média: {manhwa.medium_reaction} → {new_reaction}")
                            changes["medium_reaction"] = new_reaction

                    if changes:
                        pending_updates[manhwa.id] = changes

                    return dl_result
                except Exception as e:
                    elapsed = time.time() - manhwa_start
                    print(f"   ❌ ERRO após {elapsed:.1f}s: {str(e)}")
                    return {
                        "manhwa_title": manhwa.title,
                        "success": False,
                        "message": str(e),
                        "downloaded": 0,
                        "skipped": 0,
                        "errors": 1,
                    }

        # Disparar todos os downloads em paralelo (limitado pelo semáforo)
        tasks = [download_one_manhwa(m) for m in manhwas_to_download]
        results_list = await asyncio.gather(*tasks)

        # Agregar totais
        total_downloaded = sum(r.get("downloaded", 0) for r in results_list)
        total_skipped = sum(r.get("skipped", 0) for r in results_list)
        total_errors = sum(r.get("errors", 0) for r in results_list)

        failed_manhwas = [r.get("manhwa_title", "?") for r in results_list if not r.get("success")]

        if failed_manhwas:
            # Atomicidade: se QUALQUER manhwa falhou, descarta TODAS as alterações
            # desta sincronização (total_chapters/medium_reaction de quem teve sucesso
            # inclusos) para não deixar o banco em estado intermediário que só se
            # resolve numa segunda tentativa. Como nada foi escrito ainda (as mudanças
            # só existem em `pending_updates`, na memória), basta descartá-las — não há
            # transação suja pra reverter, então isso nunca toca na conexão morta.
            print(f"\n🔄 ROLLBACK: {len(failed_manhwas)} manhwa(s) falharam — descartando TODAS as alterações desta sincronização.")
            print(f"   Manhwas com falha: {', '.join(failed_manhwas)}")
            print(f"   Alterações descartadas: {len(pending_updates)} manhwa(s) que haviam tido sucesso.")
            pending_updates.clear()
            # Descarta a sessão do request antes de responder: ela ficou ociosa
            # durante os downloads e a conexão provavelmente já morreu. Sem isso,
            # o get_db() ainda tentaria commitar nela depois da resposta.
            await safe_rollback(db)
            print("   ↩️  Rollback concluído — nenhuma alteração foi salva no banco.")

            total_elapsed = time.time() - sync_start
            print(f"\n{'=' * 60}")
            print(f"❌ SINCRONIZAÇÃO FALHOU (revertida)")
            print(f"   Manhwas processados: {len(manhwas_to_download)}")
            print(f"   Manhwas com erro:    {len(failed_manhwas)}")
            print(f"   Tempo total:        {total_elapsed:.1f}s")
            print(f"{'=' * 60}\n")

            resposta = {
                "success": False,
                "message": f"Sincronização falhou em {len(failed_manhwas)} manhwa(s) ({', '.join(failed_manhwas)}). Nenhuma alteração foi salva — tente novamente.",
                "results": results_list,
                "total_downloaded": total_downloaded,
                "total_skipped": total_skipped,
                "total_errors": total_errors,
                "manhwas_processed": len(manhwas_to_download),
            }
            print(f"❌ Retornando resposta de falha (revertida) ao frontend: {resposta['message']}")
            return resposta

        # Todos os manhwas tiveram sucesso: persistir agora, numa conexão nova,
        # ANTES de montar a resposta. Se isso falhar, cai no except abaixo e o
        # frontend recebe falha — em vez de "sucesso" seguido de um 500 solto.
        await _persist_sync_updates(pending_updates)

        # Tudo já está persistido na conexão nova. A sessão `db` do request não
        # tem nenhuma alteração em memória (as mudanças só existiram em
        # `pending_updates`), então damos rollback explícito nela: descarta
        # qualquer estado intermediário e evita que o get_db() tente commitar
        # numa conexão que ficou minutos ociosa e já está morta.
        await safe_rollback(db)

        total_elapsed = time.time() - sync_start
        print(f"\n{'=' * 60}")
        print(f"✅ SINCRONIZAÇÃO CONCLUÍDA")
        print(f"   Manhwas processados: {len(manhwas_to_download)}")
        print(f"   Capítulos baixados:  {total_downloaded}")
        print(f"   Já existiam:        {total_skipped}")
        print(f"   Erros:              {total_errors}")
        print(f"   Tempo total:        {total_elapsed:.1f}s")
        print(f"{'=' * 60}\n")

        resposta = {
            "success": True,
            "message": f"Sincronização concluída! {total_downloaded} baixados, {total_skipped} já existiam, {total_errors} erros.",
            "results": results_list,
            "total_downloaded": total_downloaded,
            "total_skipped": total_skipped,
            "total_errors": total_errors,
            "manhwas_processed": len(manhwas_to_download),
        }
        print(f"✅ Retornando resposta de sucesso ao frontend: {resposta['message']}")
        return resposta

    except ImportError:
        # Falha crítica antes/durante a conexão com o Telegram — nenhuma alteração
        # chegou a ser feita no banco (ainda não houve nenhum db.add). Retornamos
        # JSONResponse diretamente (em vez de HTTPException) para que o corpo
        # continue no mesmo formato { success, message, ... } que o frontend espera,
        # ao invés do { detail: ... } padrão do FastAPI para HTTPException.
        print("❌ ERRO CRÍTICO: Módulo telegram_scraper não encontrado.")
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": "Módulo telegram_scraper não encontrado.",
            "results": [],
            "total_downloaded": 0,
            "total_skipped": 0,
            "total_errors": 0,
            "manhwas_processed": 0,
        })
    except Exception as e:
        print(f"❌ ERRO CRÍTICO na sincronização: {str(e)}")
        log_error(e, context="ERRO CRÍTICO na sincronização (/api/manhwas/download-all)")
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": f"Erro na sincronização: {str(e)}",
            "results": [],
            "total_downloaded": 0,
            "total_skipped": 0,
            "total_errors": 0,
            "manhwas_processed": 0,
        })

@app.post("/api/manhwas/review-all")
async def review_all_manhwas(limit: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    """
    Revisita todos os manhwas com link do Telegram e recalcula os metadados do tópico:
    `total_chapters` (quantidade de .cbz) e `medium_reaction` (média de reações por capítulo).

    Diferente do `/api/manhwas/download-all`, nada é baixado — só a leitura das estatísticas
    do tópico. Manhwas sem link do Telegram nas `notes` são pulados silenciosamente.

    `limit` (opcional) revisa só os N primeiros manhwas. Uma revisão completa leva
    dezenas de minutos (ver a nota de performance em AGENT_INSTRUCTIONS.md), então o
    limite serve para validar a rota de ponta a ponta sem esperar o lote inteiro.

    Política: **partial success**. Uma falha de leitura no Telegram (link morto, tópico
    privado, timeout) afeta apenas o manhwa em questão — os demais são persistidos
    normalmente. A atomicidade "tudo ou nada" vale só para a escrita no banco: se o
    commit falhar, nenhuma alteração entra. Ver AGENT_INSTRUCTIONS.md (Backend).
    """
    review_start = time.time()
    print("\n" + "=" * 60)
    print("🔎 REVISÃO DE MANHWAS INICIADA")
    print(f"⏰ Horário: {datetime.now().strftime('%H:%M:%S')}")
    print("=" * 60)

    print("\n🔍 Buscando manhwas no banco de dados...")
    # ORDER BY explícito: sem ele o Postgres devolve as linhas em ordem arbitrária,
    # que muda depois de cada UPDATE (linhas atualizadas migram no heap). Isso tornava
    # o `limit` não-determinístico — cada execução revisava um subconjunto diferente.
    result = await db.execute(select(ManhwaModel).order_by(ManhwaModel.id))
    all_manhwas = result.scalars().all()
    print(f"   Total de manhwas no banco: {len(all_manhwas)}")

    manhwas_to_review = [m for m in all_manhwas if m.notes and 't.me' in m.notes]
    skipped_count = len(all_manhwas) - len(manhwas_to_review)

    print(f"   Com link do Telegram: {len(manhwas_to_review)}")
    print(f"   Sem link (pulados):   {skipped_count}")

    if limit is not None and limit > 0:
        manhwas_to_review = manhwas_to_review[:limit]
        print(f"   ✂️  limit={limit} — revisando só os {len(manhwas_to_review)} primeiros.")

    if not manhwas_to_review:
        print("⚠️  Nenhum manhwa elegível para revisão.")
        print("=" * 60 + "\n")
        return {
            "success": True,
            "message": "Nenhum manhwa com link do Telegram encontrado.",
            "total_processed": 0,
            "total_updated": 0,
            "total_errors": 0,
            "results": [],
        }

    print("\n📋 Fila de revisão:")
    for i, m in enumerate(manhwas_to_review, 1):
        print(f"   {i}. {m.title}")

    try:
        # Import tardio (igual ao get_telegram_scraper()): mantém o telethon opcional
        # e faz o `except ImportError` abaixo continuar valendo.
        from telegram_scraper import (
            DEFINITIVE_ERROR_TYPES,
            EMPTY_TOPIC,
            TEMPORARY_ERROR_TYPES,
        )

        print("\n🔌 Conectando ao Telegram...")
        scraper = await get_telegram_scraper()
        print("   ✅ Conexão com Telegram estabelecida.")

        # Leituras de tópico são I/O puro (espera de resposta do Telegram), então
        # rodar em paralelo derruba o tempo total. O teto é a tolerância de flood
        # do Telegram: acima de ~4 leituras simultâneas o risco de FloodWait 429
        # sobe sem ganho real de throughput. Ajustável por REVIEW_PARALLELISM.
        # Se aparecer flood wait, o scraper freia TODAS as leituras juntas
        # (`_wait_flood_gate`), então subir esse número degrada suave em vez de quebrar.
        manhwa_sem = asyncio.Semaphore(REVIEW_PARALLELISM)
        processed_count = 0
        RETRY_DELAY_SECONDS = 5
        print(f"   ⚡ Paralelismo: {REVIEW_PARALLELISM} leitura(s) simultânea(s) de tópico.")

        # Mesmo padrão do download-all: a leitura das stats de todos os tópicos leva
        # minutos e a conexão da sessão `db` morre nesse meio tempo. As alterações
        # ficam como dados simples aqui e são aplicadas no fim, numa conexão nova.
        pending_updates: dict = {}

        # Soma dos tempos individuais de leitura. Comparada com o tempo de parede no
        # fim, dá o speedup REAL medido do paralelismo (sem chutar baseline).
        serial_seconds = 0.0

        async def read_stats_with_retry(manhwa, log):
            """Lê as stats do tópico, repetindo UMA vez em caso de erro temporário.

            Erro definitivo (link morto, tópico privado) não é repetido: o resultado
            seria o mesmo e só atrasaria a revisão inteira. Em flood wait, respeita o
            tempo que o próprio Telegram pediu — o scraper já segurou as outras
            leituras paralelas no mesmo instante.
            """
            stats = await scraper._get_topic_stats(manhwa.notes)
            if stats.get("error_type") in TEMPORARY_ERROR_TYPES:
                espera = stats.get("retry_after") or RETRY_DELAY_SECONDS
                log.append(
                    f"   ⏳ Erro temporário ({stats.get('error_type')}) — "
                    f"tentando de novo em {espera}s..."
                )
                await asyncio.sleep(espera)
                stats = await scraper._get_topic_stats(manhwa.notes)
            return stats

        async def review_one_manhwa(manhwa):
            nonlocal processed_count, serial_seconds
            async with manhwa_sem:
                manhwa_start = time.time()

                # Com leituras concorrentes, prints soltos de corrotinas diferentes se
                # embaralham. Cada manhwa acumula suas linhas e solta um bloco só.
                log = [f"   Link: {manhwa.notes}"]

                old_chapters = manhwa.total_chapters
                old_reaction = manhwa.medium_reaction

                base_result = {
                    "manhwa_id": manhwa.id,
                    "manhwa_title": manhwa.title,
                    "old_total_chapters": old_chapters,
                    "old_medium_reaction": old_reaction,
                }

                def flush(elapsed):
                    """Imprime o bloco deste manhwa de uma vez só."""
                    nonlocal processed_count
                    processed_count += 1
                    cabecalho = (
                        f"\n{'─' * 50}\n"
                        f"🔎 [{processed_count}/{len(manhwas_to_review)}] {manhwa.title} "
                        f"({elapsed:.1f}s)"
                    )
                    print("\n".join([cabecalho] + log))

                try:
                    stats = await read_stats_with_retry(manhwa, log)
                except Exception as e:
                    # Rede/telethon explodindo fora do tratamento do scraper. Continua
                    # sendo falha só DESTE manhwa — os outros seguem normalmente.
                    elapsed = time.time() - manhwa_start
                    serial_seconds += elapsed
                    log.append(f"   ❌ ERRO inesperado: {e}")
                    flush(elapsed)
                    return {
                        **base_result,
                        "success": False,
                        "updated": False,
                        "error_type": "unknown",
                        "error_message": f"{type(e).__name__}: {e}",
                        "message": f"Erro inesperado ao ler o tópico: {e}",
                        "elapsed": round(elapsed, 1),
                    }

                cbz_count = stats.get("cbz_count", 0)
                avg_reactions = stats.get("avg_reactions", 0)
                error_type = stats.get("error_type")
                error_message = stats.get("error_message")
                elapsed = time.time() - manhwa_start
                serial_seconds += elapsed

                # Tópico existe e foi lido, só não tem CBZ. Não é erro — mas também não
                # gravamos 0 por cima de um valor válido, então conta como "sem mudança".
                if error_type == EMPTY_TOPIC:
                    log.append("   📭 Tópico vazio (0 CBZs) — nada a alterar.")
                    flush(elapsed)
                    return {
                        **base_result,
                        "success": True,
                        "updated": False,
                        "error_type": EMPTY_TOPIC,
                        "error_message": error_message,
                        "message": "Tópico sem nenhum .cbz — banco mantido como está.",
                        "total_chapters": old_chapters,
                        "medium_reaction": old_reaction,
                        "elapsed": round(elapsed, 1),
                    }

                # Falha de leitura: registra o motivo e segue. NÃO reverte os outros —
                # antes, um único tópico morto descartava centenas de updates corretos.
                if error_type:
                    definitivo = error_type in DEFINITIVE_ERROR_TYPES
                    rotulo = "definitivo" if definitivo else "temporário"
                    log.append(f"   ❌ Falha [{error_type}/{rotulo}]: {error_message}")
                    flush(elapsed)
                    return {
                        **base_result,
                        "success": False,
                        "updated": False,
                        "error_type": error_type,
                        "error_message": error_message,
                        "definitive": definitivo,
                        "message": f"Falha ao ler o tópico ({error_type}): {error_message}",
                        "elapsed": round(elapsed, 1),
                    }

                log.append(f"   📊 Resultado: {cbz_count} CBZs | reação média: {avg_reactions}")

                changes = {}
                if manhwa.total_chapters != cbz_count:
                    log.append(f"   🔄 Total de capítulos: {old_chapters} → {cbz_count}")
                    changes["total_chapters"] = cbz_count
                if manhwa.medium_reaction != avg_reactions:
                    log.append(f"   ❤️  Reação média: {old_reaction} → {avg_reactions}")
                    changes["medium_reaction"] = avg_reactions

                updated = bool(changes)
                if updated:
                    pending_updates[manhwa.id] = changes
                else:
                    log.append("   ✔️  Já estava atualizado — nada a alterar.")
                flush(elapsed)

                return {
                    **base_result,
                    "success": True,
                    "updated": updated,
                    "error_type": None,
                    "error_message": None,
                    "total_chapters": cbz_count,
                    "medium_reaction": avg_reactions,
                    "elapsed": round(elapsed, 1),
                }

        tasks = [review_one_manhwa(m) for m in manhwas_to_review]
        results_list = await asyncio.gather(*tasks)

        total_updated = sum(1 for r in results_list if r.get("updated"))
        failed_results = [r for r in results_list if not r.get("success")]
        failed_manhwas = [r.get("manhwa_title", "?") for r in failed_results]
        total_errors = len(failed_results)
        total_empty = sum(1 for r in results_list if r.get("error_type") == EMPTY_TOPIC)

        # Resumo por tipo de erro: ajuda a saber se é link podre (definitivo) ou se
        # vale rodar a revisão de novo mais tarde (temporário).
        errors_by_type: dict = {}
        for r in failed_results:
            tipo = r.get("error_type") or "unknown"
            errors_by_type[tipo] = errors_by_type.get(tipo, 0) + 1

        if failed_results:
            print(f"\n⚠️  {total_errors} manhwa(s) falharam na leitura do Telegram:")
            for r in failed_results:
                print(f"   • {r.get('manhwa_title')} [{r.get('error_type')}]: {r.get('error_message')}")
            print(f"   Resumo por tipo: {errors_by_type}")
            print(
                f"   ➡️  Partial success: as {len(pending_updates)} alteração(ões) bem-sucedida(s) "
                "serão persistidas mesmo assim."
            )

        # Persistir os sucessos numa conexão nova, independentemente das falhas de
        # leitura acima. Atomicidade agora vale só para a ESCRITA: ou todas as
        # alterações válidas entram, ou nenhuma entra.
        try:
            await _persist_sync_updates(pending_updates)
        except Exception as persist_exc:
            # Falha de PERSISTÊNCIA (constraint, permissão no banco, conexão morta):
            # aqui sim nada foi salvo. `_persist_sync_updates()` já desfez a própria
            # transação; o rollback abaixo só descarta a sessão do request.
            await safe_rollback(db)
            total_elapsed = time.time() - review_start
            print(f"\n{'=' * 60}")
            print("❌ REVISÃO FALHOU AO PERSISTIR — nenhuma alteração foi salva.")
            print(f"   Motivo: {persist_exc}")
            print(f"   Tempo total: {total_elapsed:.1f}s")
            print(f"{'=' * 60}\n")
            return JSONResponse(status_code=500, content={
                "success": False,
                "message": f"Erro ao salvar as alterações no banco: {persist_exc}. Nenhuma alteração foi salva — tente novamente.",
                "total_processed": len(manhwas_to_review),
                "total_updated": 0,
                "total_errors": total_errors,
                "total_empty": total_empty,
                "errors_by_type": errors_by_type,
                "persisted": False,
                "results": results_list,
            })

        # Alterações já persistidas; a sessão `db` não tem nada em memória. Rollback
        # explícito para o get_db() não tentar commitar na conexão morta. Só aqui, no
        # fim do endpoint — no meio do partial success ele quebraria a sessão à toa.
        await safe_rollback(db)

        total_elapsed = time.time() - review_start

        # Performance: `serial_seconds` é quanto essas mesmas leituras teriam custado
        # uma atrás da outra (semáforo=1). Comparado ao tempo de parede, dá o ganho
        # medido — não uma estimativa chutada.
        throughput = len(manhwas_to_review) / total_elapsed if total_elapsed > 0 else 0
        speedup = serial_seconds / total_elapsed if total_elapsed > 0 else 1.0
        economia_pct = (1 - 1 / speedup) * 100 if speedup > 1 else 0.0
        minutos, segundos = divmod(int(total_elapsed), 60)

        print(f"\n{'=' * 60}")
        print("✅ REVISÃO CONCLUÍDA" + (" (com falhas parciais)" if total_errors else ""))
        print(f"   Manhwas processados: {len(manhwas_to_review)}")
        print(f"   Manhwas atualizados: {total_updated}")
        print(f"   Tópicos vazios:      {total_empty}")
        print(f"   Sem link (pulados):  {skipped_count}")
        print(f"   Erros:               {total_errors}")
        print(f"   Tempo total:         {minutos}m{segundos:02d}s")
        print(
            f"   ⏱️  {minutos}m{segundos:02d}s | {len(manhwas_to_review)} tópicos | "
            f"{throughput:.1f} tópicos/s ({REVIEW_PARALLELISM} paralelos) | "
            f"{speedup:.1f}x vs. sequencial (~{economia_pct:.0f}% mais rápido)"
        )
        print(f"   (soma dos tempos individuais: {serial_seconds:.0f}s)")
        print(f"{'=' * 60}\n")

        mensagem = (
            f"Revisão concluída! {len(manhwas_to_review)} processados, "
            f"{total_updated} atualizados, {total_errors} erros."
        )
        if total_errors:
            mensagem += (
                f" As alterações dos {len(manhwas_to_review) - total_errors} manhwa(s) que deram certo"
                f" foram salvas. Falharam: {', '.join(failed_manhwas)}."
            )

        return {
            "success": True,
            "message": mensagem,
            "total_processed": len(manhwas_to_review),
            "total_updated": total_updated,
            "total_errors": total_errors,
            "total_empty": total_empty,
            "errors_by_type": errors_by_type,
            "persisted": True,
            "performance": {
                "elapsed_seconds": round(total_elapsed, 1),
                "topics_per_second": round(throughput, 2),
                "parallelism": REVIEW_PARALLELISM,
                "serial_seconds": round(serial_seconds, 1),
                "speedup_vs_sequential": round(speedup, 2),
            },
            "results": results_list,
        }

    except ImportError:
        print("❌ ERRO CRÍTICO: Módulo telegram_scraper não encontrado.")
        raise HTTPException(status_code=500, detail="Módulo telegram_scraper não encontrado.")
    except Exception as e:
        print(f"❌ ERRO CRÍTICO na revisão: {str(e)}")
        log_error(e, context="ERRO CRÍTICO na revisão (/api/manhwas/review-all)")
        raise HTTPException(status_code=500, detail=f"Erro na revisão: {str(e)}")

@app.post("/api/telegram/import")
async def import_from_telegram(request: TelegramImportRequest, db: AsyncSession = Depends(get_db)):
    """
    Importa manhwas de um canal do Telegram
    
    Requer configuração prévia das credenciais do Telegram no .env:
    - TELEGRAM_API_ID
    - TELEGRAM_API_HASH
    - TELEGRAM_PHONE
    """
    import_start = time.time()
    print("\n" + "=" * 60)
    print("📡 IMPORTAÇÃO DO TELEGRAM INICIADA")
    print(f"⏰ Horário: {datetime.now().strftime('%H:%M:%S')}")
    print(f"🔗 Link: {request.channel_link}")
    print(f"📌 Status padrão: {request.auto_status}")
    print("=" * 60)
    
    try:
        print("\n🔌 Conectando ao Telegram...")
        scraper = await get_telegram_scraper()
        print("   ✅ Conexão estabelecida.")
        
        # Buscar títulos já existentes para ignorar no scraper e ganhar performance
        print("\n🔍 Buscando títulos já existentes no banco...")
        result = await db.execute(select(ManhwaModel.title))
        existing_titles = {title.lower() for title in result.scalars().all()}
        print(f"   Títulos existentes: {len(existing_titles)}")
        
        # Conectar e buscar um ou múltiplos manhwas a partir do tópico
        print("\n📥 Fazendo scraping do tópico do Telegram...")
        scrape_start = time.time()
        manhwa_data_list = await scraper.scrape_manhwa_topic(request.channel_link, existing_titles=existing_titles)
        scrape_elapsed = time.time() - scrape_start
        print(f"   ⏱️  Scraping concluído em {scrape_elapsed:.1f}s")
            
        if not manhwa_data_list:
            print("⚠️  Nenhum dado encontrado no tópico.")
            print("=" * 60 + "\n")
            return {"success": False, "message": "Nenhum dado encontrado no tópico.", "imported": 0}
            
        # Transformar para lista se ele resolver retornar 1 item só (compatibilidade)
        if isinstance(manhwa_data_list, dict):
            manhwa_data_list = [manhwa_data_list]
        
        print(f"   📋 Manhwas encontrados no tópico: {len(manhwa_data_list)}")
            
        imported = 0
        skipped = 0
        
        print("\n📝 Processando manhwas encontrados:")
        for i, m_data in enumerate(manhwa_data_list, 1):
            title_display = m_data.get('title', 'Sem título')
            
            if m_data.get('skipped_because_exists'):
                skipped += 1
                print(f"   {i}. ⏭️  {title_display} — já existe (pulado no scraper)")
                continue
                
            title_to_search = m_data['title']
            result = await db.execute(select(ManhwaModel).where(ManhwaModel.title.ilike(title_to_search)))
            db_manhwa = result.scalar_one_or_none()
            
            if db_manhwa:
                skipped += 1
                print(f"   {i}. ⏭️  {title_display} — já existe no banco (pulado)")
                continue
            
            # Detectar andamento pelo título original (antes de limpar)
            raw_title = str(m_data.get('raw_title', m_data['title']))
            title_lower = raw_title.lower()
            if "finalizado" in title_lower:
                derived_andamento = "finalizado"
            else:
                derived_andamento = "andamento"
            
            # Limpar título: remover sufixos como "Finalizado", "Em Andamento", etc.
            _status_words = r'(finalizado|em andamento|completo|hiato|dropped)'
            clean_title = re.sub(rf'\s*[-–—|/]\s*{_status_words}\s*$', '', raw_title, flags=re.IGNORECASE)
            clean_title = re.sub(rf'\s*[\(\[]{_status_words}[\)\]]\s*$', '', clean_title, flags=re.IGNORECASE)
            clean_title = re.sub(rf'\s+{_status_words}\s*$', '', clean_title, flags=re.IGNORECASE)
            clean_title = clean_title.strip()
            
            new_manhwa = ManhwaModel(
                title=clean_title,
                cover_url=m_data.get('cover_url'),
                status=request.auto_status,
                andamento=derived_andamento,
                current_chapter=0,
                total_chapters=m_data.get('total_chapters') or None,
                medium_reaction=m_data.get('medium_reaction') or None,
                rating=None,
                notes=m_data.get('notes', ''),
            )
            db.add(new_manhwa)
            imported += 1
            chaps = m_data.get('total_chapters', '?')
            react = m_data.get('medium_reaction', '?')
            print(f"   {i}. ✅ {clean_title} — andamento: {derived_andamento} | caps: {chaps} | reações: {react}")
            
        # Salvar alterações no banco
        print("\n💾 Salvando no banco de dados...")
        await db.commit()
        print("   ✅ Banco atualizado.")
        
        total_elapsed = time.time() - import_start
        print(f"\n{'=' * 60}")
        print(f"✅ IMPORTAÇÃO CONCLUÍDA")
        print(f"   Encontrados: {len(manhwa_data_list)}")
        print(f"   Importados:  {imported}")
        print(f"   Ignorados:   {skipped}")
        print(f"   Tempo total: {total_elapsed:.1f}s")
        print(f"{'=' * 60}\n")
        
        return {
            "success": True,
            "imported": imported,
            "skipped": skipped,
            "total_found": len(manhwa_data_list),
            "message": f"Sincronização concluída! {imported} importados, {skipped} ignorados."
        }
        
    except ImportError:
        print("❌ ERRO: Módulo telegram_scraper não encontrado.")
        raise HTTPException(
            status_code=500,
            detail="Módulo telegram_scraper não encontrado. Instale as dependências: pip install telethon cryptg"
        )
    except ValueError as e:
        print(f"❌ ERRO de configuração: {str(e)}")
        raise HTTPException(
            status_code=400,
            detail=f"Erro de configuração: {str(e)}"
        )
    except Exception as e:
        print(f"❌ ERRO na importação: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao importar do Telegram: {str(e)}"
        )

@app.get("/api/telegram/test")
def test_telegram_config():
    """Testa se as configurações do Telegram estão corretas"""
    try:
        from dotenv import load_dotenv
        load_dotenv()
        
        api_id = os.getenv('TELEGRAM_API_ID')
        api_hash = os.getenv('TELEGRAM_API_HASH')
        phone = os.getenv('TELEGRAM_PHONE')
        
        config_status = {
            "api_id": "✓ Configurado" if api_id else "✗ Não configurado",
            "api_hash": "✓ Configurado" if api_hash else "✗ Não configurado",
            "phone": "✓ Configurado" if phone else "✗ Não configurado",
        }
        
        all_configured = all([api_id, api_hash, phone])
        
        return {
            "configured": all_configured,
            "config": config_status,
            "message": "Todas as configurações OK!" if all_configured else "Configure as credenciais no arquivo .env"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
