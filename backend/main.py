from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import json
import os

app = FastAPI(title="Manhwa Tracker API")

# Configuração de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Arquivo para armazenar dados (simples, sem banco de dados por enquanto)
DATA_FILE = "manhwas.json"

# Modelos Pydantic
class ManhwaBase(BaseModel):
    title: str
    author: Optional[str] = None
    cover_url: Optional[str] = None
    status: str = "plan_to_read"  # reading, completed, plan_to_read
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

# Funções auxiliares para ler/escrever dados
def load_data():
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_data(data):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_next_id(data):
    if not data:
        return 1
    return max(item['id'] for item in data) + 1

# Rotas da API
@app.get("/")
def root():
    return {"message": "Manhwa Tracker API"}

@app.get("/api/manhwas", response_model=List[Manhwa])
def get_manhwas(status: Optional[str] = None):
    """Retorna todos os manhwas, opcionalmente filtrados por status"""
    data = load_data()
    if status:
        data = [m for m in data if m['status'] == status]
    return data

@app.get("/api/manhwas/{manhwa_id}", response_model=Manhwa)
def get_manhwa(manhwa_id: int):
    """Retorna um manhwa específico"""
    data = load_data()
    manhwa = next((m for m in data if m['id'] == manhwa_id), None)
    if not manhwa:
        raise HTTPException(status_code=404, detail="Manhwa não encontrado")
    return manhwa

@app.post("/api/manhwas", response_model=Manhwa, status_code=201)
def create_manhwa(manhwa: ManhwaCreate):
    """Cria um novo manhwa"""
    data = load_data()
    
    new_manhwa = {
        "id": get_next_id(data),
        **manhwa.model_dump(),
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }
    
    data.append(new_manhwa)
    save_data(data)
    
    return new_manhwa

@app.put("/api/manhwas/{manhwa_id}", response_model=Manhwa)
def update_manhwa(manhwa_id: int, manhwa: ManhwaUpdate):
    """Atualiza um manhwa existente"""
    data = load_data()
    
    index = next((i for i, m in enumerate(data) if m['id'] == manhwa_id), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Manhwa não encontrado")
    
    updated_manhwa = {
        "id": manhwa_id,
        **manhwa.model_dump(),
        "created_at": data[index]['created_at'],
        "updated_at": datetime.now().isoformat()
    }
    
    data[index] = updated_manhwa
    save_data(data)
    
    return updated_manhwa

@app.delete("/api/manhwas/{manhwa_id}", status_code=204)
def delete_manhwa(manhwa_id: int):
    """Deleta um manhwa"""
    data = load_data()
    
    index = next((i for i, m in enumerate(data) if m['id'] == manhwa_id), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Manhwa não encontrado")
    
    data.pop(index)
    save_data(data)
    
    return None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
