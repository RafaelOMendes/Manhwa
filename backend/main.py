# -*- coding: utf-8 -*-
from fastapi import FastAPI, HTTPException, Depends
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
from models import Manhwa as ManhwaModel


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
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
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

class ManhwaCreate(ManhwaBase):
    pass

class ManhwaUpdate(ManhwaBase):
    pass

class Manhwa(ManhwaBase):
    id: int
    created_at: str
    updated_at: str

class TelegramImportRequest(BaseModel):
    channel_link: str
    limit: Optional[int] = 10
    auto_status: str = "plan_to_read"


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
        from telegram_scraper import TelegramManhwaScraper
        
        # Instantiate without connecting inside the try initially
        scraper = TelegramManhwaScraper()
        
        try:
            # Conectar e buscar um ou múltiplos manhwas a partir do tópico
            await scraper.connect()
            manhwa_data_list = await scraper.scrape_manhwa_topic(request.channel_link, limit=request.limit)
        except Exception as scraper_err:
            if "database is locked" in str(scraper_err):
                return {"success": False, "message": "Erro: O banco de dados do Telegram está em uso por outro processo (talvez o servidor reiniciou). Reinicie o backend e tente novamente.", "imported": 0}
            raise scraper_err
        finally:
            await scraper.disconnect()
            
        if not manhwa_data_list:
            return {"success": False, "message": "Nenhum dado encontrado no tópico.", "imported": 0}
            
        # Transformar para lista se ele resolver retornar 1 item só (compatibilidade)
        if isinstance(manhwa_data_list, dict):
            manhwa_data_list = [manhwa_data_list]
            
        imported = 0
        skipped = 0
        
        for m_data in manhwa_data_list:
            title_to_search = m_data['title']
            result = await db.execute(select(ManhwaModel).where(ManhwaModel.title.ilike(title_to_search)))
            db_manhwa = result.scalar_one_or_none()
            
            if db_manhwa:
                skipped += 1
                continue
            
            # Detectar andamento pelo título original (antes de limpar)
            raw_title = str(m_data['title'])
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
