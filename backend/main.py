# -*- coding: utf-8 -*-
from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import os
import re
from contextlib import asynccontextmanager

from database import get_db, create_tables
from models import Manhwa as ManhwaModel, ChapterProgress


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gerencia o ciclo de vida da aplicação"""
    # Startup: criar tabelas
    await create_tables()
    yield
    # Shutdown: limpeza (se necessário)


app = FastAPI(title="Manhwa Tracker API", lifespan=lifespan)

# Configuração de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
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

@app.get("/api/manhwas/{manhwa_id}/files")
async def list_manhwa_files(manhwa_id: int, db: AsyncSession = Depends(get_db)):
    """Lista os arquivos .cbz baixados de um manhwa em D:\\Manhwas\\{titulo}\\"""
    import os

    result = await db.execute(select(ManhwaModel).where(ManhwaModel.id == manhwa_id))
    manhwa = result.scalar_one_or_none()

    if not manhwa:
        raise HTTPException(status_code=404, detail="Manhwa não encontrado")

    # Sanitizar nome igual ao scraper
    safe_name = "".join(c for c in manhwa.title if c.isalnum() or c in " _-().").strip()
    if not safe_name:
        safe_name = "Manhwa_Desconhecido"
    download_dir = os.path.join(r"D:\Manhwas", safe_name)

    if not os.path.exists(download_dir):
        return {"files": [], "path": download_dir}

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

    raw_files = []
    for f in os.listdir(download_dir):
        if f.lower().endswith('.cbz'):
            full_path = os.path.join(download_dir, f)
            size_mb = round(os.path.getsize(full_path) / (1024 * 1024), 1)
            chapter_num = _extract_chapter_number(f)
            raw_files.append({"name": f, "size_mb": size_mb, "chapter_number": chapter_num})

    # Ordenar pelo número do capítulo
    raw_files.sort(key=lambda x: x["chapter_number"])

    return {"files": raw_files, "path": download_dir, "current_chapter": manhwa.current_chapter or 0}

class UpdateCurrentChapter(BaseModel):
    current_chapter: int

@app.patch("/api/manhwas/{manhwa_id}/current-chapter")
async def update_current_chapter(manhwa_id: int, body: UpdateCurrentChapter, db: AsyncSession = Depends(get_db)):
    """Atualiza o current_chapter de um manhwa (chamado ao terminar de ler um capítulo)"""
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
    if manhwa.status != "reading" and manhwa.status != "completed":
        manhwa.status = "reading"
        updated = True

    if updated:
        await db.commit()
        await db.refresh(manhwa)

    return {"success": True, "current_chapter": manhwa.current_chapter, "status": manhwa.status}

class ScrollUpdate(BaseModel):
    scroll_position: int

@app.put("/api/manhwas/{manhwa_id}/read/{filename}/scroll")
async def update_scroll(manhwa_id: int, filename: str, body: ScrollUpdate, db: AsyncSession = Depends(get_db)):
    """Salva a posição de rolagem de um capítulo específico"""
    result = await db.execute(select(ChapterProgress).where(
        ChapterProgress.manhwa_id == manhwa_id, 
        ChapterProgress.filename == filename
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
        ChapterProgress.manhwa_id == manhwa_id, 
        ChapterProgress.filename == filename
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

    safe_name = "".join(c for c in manhwa.title if c.isalnum() or c in " _-().").strip() or "Manhwa_Desconhecido"
    cbz_path = os.path.join(r"D:\Manhwas", safe_name, filename)

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

@app.get("/api/manhwas/{manhwa_id}/read/{filename}/page/{page_num}")
async def get_cbz_page(manhwa_id: int, filename: str, page_num: int, db: AsyncSession = Depends(get_db)):
    """Serve uma página individual do CBZ como imagem"""
    import zipfile

    result = await db.execute(select(ManhwaModel).where(ManhwaModel.id == manhwa_id))
    manhwa = result.scalar_one_or_none()
    if not manhwa:
        raise HTTPException(status_code=404, detail="Manhwa não encontrado")

    safe_name = "".join(c for c in manhwa.title if c.isalnum() or c in " _-().").strip() or "Manhwa_Desconhecido"
    cbz_path = os.path.join(r"D:\Manhwas", safe_name, filename)

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

@app.post("/api/manhwas/download-all")
async def download_all_manhwas(db: AsyncSession = Depends(get_db)):
    """
    Sincroniza todos os manhwas em paralelo: baixa os .cbz de todos que possuem link do Telegram
    para D:\\Manhwas\\{titulo}\\ usando uma única conexão com downloads concorrentes.
    """
    import asyncio

    # Buscar todos os manhwas com link do Telegram
    result = await db.execute(select(ManhwaModel))
    all_manhwas = result.scalars().all()

    manhwas_to_download = [
        m for m in all_manhwas
        if m.notes and 't.me' in m.notes and m.download
    ]

    if not manhwas_to_download:
        return {
            "success": True,
            "message": "Nenhum manhwa com link do Telegram encontrado.",
            "results": [],
            "total_downloaded": 0,
            "total_skipped": 0,
            "total_errors": 0,
        }

    try:
        scraper = await get_telegram_scraper()
        results_list = []

        # Semáforo para limitar manhwas simultâneos (1 por vez para evitar Flood 429 do Telegram)
        manhwa_sem = asyncio.Semaphore(1)

        async def download_one_manhwa(manhwa):
            async with manhwa_sem:
                try:
                    dl_result = await scraper.download_cbz_from_topic(manhwa.notes, manhwa.title)
                    dl_result["manhwa_title"] = manhwa.title
                    
                    # Atualizar total de capítulos no banco de dados
                    if dl_result.get("success") and "total" in dl_result:
                        total_found = dl_result["total"]
                        if manhwa.total_chapters != total_found:
                            manhwa.total_chapters = total_found
                            db.add(manhwa)
                            
                    return dl_result
                except Exception as e:
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
        
        # Salvar no banco as alterações de total_chapters
        await db.commit()

        # Agregar totais
        total_downloaded = sum(r.get("downloaded", 0) for r in results_list)
        total_skipped = sum(r.get("skipped", 0) for r in results_list)
        total_errors = sum(r.get("errors", 0) for r in results_list)

        return {
            "success": True,
            "message": f"Sincronização concluída! {total_downloaded} baixados, {total_skipped} já existiam, {total_errors} erros.",
            "results": results_list,
            "total_downloaded": total_downloaded,
            "total_skipped": total_skipped,
            "total_errors": total_errors,
            "manhwas_processed": len(manhwas_to_download),
        }

    except ImportError:
        raise HTTPException(status_code=500, detail="Módulo telegram_scraper não encontrado.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na sincronização: {str(e)}")

@app.post("/api/telegram/import")
async def import_from_telegram(request: TelegramImportRequest, db: AsyncSession = Depends(get_db)):
    """
    Importa manhwas de um canal do Telegram
    
    Requer configuração prévia das credenciais do Telegram no .env:
    - TELEGRAM_API_ID
    - TELEGRAM_API_HASH
    - TELEGRAM_PHONE
    """
    try:
        scraper = await get_telegram_scraper()
        
        # Buscar títulos já existentes para ignorar no scraper e ganhar performance
        result = await db.execute(select(ManhwaModel.title))
        existing_titles = {title.lower() for title in result.scalars().all()}
        
        # Conectar e buscar um ou múltiplos manhwas a partir do tópico
        manhwa_data_list = await scraper.scrape_manhwa_topic(request.channel_link, existing_titles=existing_titles)
            
        if not manhwa_data_list:
            return {"success": False, "message": "Nenhum dado encontrado no tópico.", "imported": 0}
            
        # Transformar para lista se ele resolver retornar 1 item só (compatibilidade)
        if isinstance(manhwa_data_list, dict):
            manhwa_data_list = [manhwa_data_list]
            
        imported = 0
        skipped = 0
        
        for m_data in manhwa_data_list:
            if m_data.get('skipped_because_exists'):
                skipped += 1
                continue
                
            title_to_search = m_data['title']
            result = await db.execute(select(ManhwaModel).where(ManhwaModel.title.ilike(title_to_search)))
            db_manhwa = result.scalar_one_or_none()
            
            if db_manhwa:
                skipped += 1
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
            
        # Salvar alterações no banco
        await db.commit()
        
        return {
            "success": True,
            "imported": imported,
            "skipped": skipped,
            "total_found": len(manhwa_data_list),
            "message": f"Sincronização concluída! {imported} importados, {skipped} ignorados."
        }
        
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="Módulo telegram_scraper não encontrado. Instale as dependências: pip install telethon cryptg"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erro de configuração: {str(e)}"
        )
    except Exception as e:
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
