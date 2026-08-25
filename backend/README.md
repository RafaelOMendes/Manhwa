# Manhwa Tracker — Backend

API FastAPI (assíncrona) com PostgreSQL, para o Manhwa Tracker.

## Instalação Rápida

Pré-requisitos: PostgreSQL 12+ com banco `manhwa_tracker` criado, e Python 3.8+.

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

Copie `.env.example` para `.env` e preencha:

```env
DATABASE_URL=postgresql+asyncpg://postgres:SUA_SENHA@localhost:5432/manhwa_tracker
DOWNLOAD_DIR=D:\Manhwas
TELEGRAM_API_ID=...       # opcional, só para importação/download via Telegram
TELEGRAM_API_HASH=...
TELEGRAM_PHONE=+55...
```

Inicialize as tabelas e suba a API:

```powershell
python init_db.py
python main.py
```

API em `http://localhost:8000` (Swagger em `/docs`). Atalho: `iniciaBack.bat` na raiz do projeto.

## Estrutura do Projeto

```
backend/
├── main.py                 # Rotas da API (CRUD, leitor CBZ, Telegram)
├── database.py             # Engine async SQLAlchemy, get_db(), safe_rollback()
├── models.py                # Modelos SQLAlchemy (Manhwa, ChapterProgress)
├── telegram_scraper.py      # Scraping + download paralelo de .cbz
├── init_db.py                # Cria/reseta as tabelas (--reset)
├── migrate_json_to_db.py    # Migração legada de manhwas.json → PostgreSQL
├── test_telegram_import.py  # Script manual de teste do Telegram
└── requirements.txt
```

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/manhwas` | Lista todos (filtro opcional `?status=...`) |
| GET | `/api/manhwas/{id}` | Detalhe de um manhwa |
| POST | `/api/manhwas` | Cria um manhwa |
| PUT | `/api/manhwas/{id}` | Atualiza um manhwa |
| DELETE | `/api/manhwas/{id}` | Exclui um manhwa |
| PATCH | `/api/manhwas/{id}/current-chapter` | Atualiza o capítulo atual e marca os anteriores como lidos |
| GET | `/api/manhwas/{id}/files` | Lista `.cbz` em `DOWNLOAD_DIR/{título}/` |
| GET | `/api/manhwas/{id}/read/{filename}` | Info do CBZ (nº de páginas) |
| GET | `/api/manhwas/{id}/read/{filename}/page/{n}` | Serve uma página |
| GET/PUT | `/api/manhwas/{id}/read/{filename}/scroll` | Posição de scroll salva |
| GET | `/api/telegram/test` | Testa credenciais do `.env` |
| POST | `/api/telegram/import` | Importa manhwas de um tópico do Telegram |
| POST | `/api/manhwas/download-all` | Baixa `.cbz` de todos com `download=true` |
| POST | `/api/manhwas/review-all` | Revisa todos (recalcula `total_chapters`/`medium_reaction`, sem baixar) |

Documentação interativa completa: `http://localhost:8000/docs`.

## Telegram

1. Crie credenciais em https://my.telegram.org/apps (API development tools).
2. Preencha `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` e `TELEGRAM_PHONE` no `.env`.
3. Na primeira chamada que usa o Telegram, um código de login é pedido no terminal; depois disso uma sessão fica salva em disco.

Teste rápido: `curl http://localhost:8000/api/telegram/test`.

## Troubleshooting

- **"could not connect to server"** — PostgreSQL não está rodando (verifique o serviço).
- **"password authentication failed"** — senha do `.env` não bate com a do usuário `postgres`.
- **"database does not exist"** — rode `CREATE DATABASE manhwa_tracker;` no psql.
- **"No module named 'asyncpg'"** — instale dentro do venv: `.\venv\Scripts\python.exe -m pip install asyncpg psycopg2-binary`.

## Detalhes técnicos

Para decisões de arquitetura (transações, partial success, performance do `review-all`, etc.), veja **[../AGENT_INSTRUCTIONS.md](../AGENT_INSTRUCTIONS.md)** ou o grafo em `graphify-out/`.
