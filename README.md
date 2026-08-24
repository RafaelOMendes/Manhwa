# 📚 Manhwa Tracker

Um aplicativo completo para gerenciar seus manhwas favoritos, acompanhar o que você está lendo, o que já leu, avaliar e adicionar notas. Inclui leitor nativo de arquivos `.cbz` (web e mobile) e importação/download automático de capítulos a partir de tópicos do Telegram.

## 🚀 Tecnologias

### Frontend (web)
- **Next.js 14** com App Router
- **TypeScript**
- **Tailwind CSS**
- **Lucide React** para ícones

### Backend
- **FastAPI** (Python, assíncrono)
- **SQLAlchemy async** + **asyncpg**
- **PostgreSQL** como banco de dados
- **Telethon** para integração com Telegram (scraping de tópicos e download de `.cbz`)

### Mobile
- **Expo SDK 54** + **React Native** + **NativeWind**
- `expo-router` para rotas baseadas em arquivos
- Mesma API REST do backend (default via Tailscale)

## 📋 Funcionalidades

- ✅ Adicionar manhwas com informações detalhadas
- ✅ Gerenciar status (Lendo, Completo, Planejo Ler)
- ✅ Avaliar com sistema de estrelas (1–5)
- ✅ Acompanhar capítulos lidos (com posição de scroll salva)
- ✅ Leitor `.cbz` integrado, com modo imersivo no mobile
- ✅ Importar manhwas a partir de tópicos do Telegram (com capa e contagem de capítulos)
- ✅ Sincronizar/baixar capítulos `.cbz` em paralelo direto do Telegram
- ✅ Ranking "Top 30" por média de reações por capítulo
- ✅ Filtros por status / com capítulos novos / apenas baixados
- ✅ Interface moderna e responsiva (web e mobile)

## 🛠️ Instalação e Execução

### Backend (FastAPI + PostgreSQL)

Pré-requisito: PostgreSQL 12+ rodando localmente com banco `manhwa_tracker` criado (ver `backend/README.md` para detalhes).

1. Entre na pasta do backend:
```powershell
cd backend
```

2. Crie e ative um ambiente virtual:
```powershell
python -m venv venv
.\venv\Scripts\activate
```

3. Instale as dependências:
```powershell
pip install -r requirements.txt
```

4. Configure o `.env` (na pasta `backend/`):
```env
DATABASE_URL=postgresql+asyncpg://postgres:senha@localhost:5432/manhwa_tracker
DOWNLOAD_DIR=D:\Manhwas
TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
TELEGRAM_PHONE=+55...
```

5. Inicialize as tabelas:
```powershell
python init_db.py
```

6. Inicie o servidor:
```powershell
python main.py
```

Backend disponível em `http://localhost:8000` (Swagger em `/docs`).
Atalho: rode `iniciaBack.bat` na raiz do projeto.

### Frontend (Next.js)

```powershell
cd frontend
npm install
npm run dev
```

Web em `http://localhost:3000`. Atalho: `iniciaFront.bat`.

### Mobile (Expo)

```powershell
cd mobile
npm install
npx expo start
```

O `API_BASE` padrão aponta para o IP Tailscale configurado em `src/lib/api.ts`. Para sobrescrever (por exemplo, durante desenvolvimento em rede local), crie `mobile/.env`:

```env
EXPO_PUBLIC_API_BASE=http://192.168.0.10:8000
```

## 📁 Estrutura do Projeto

```
Manhwa/
├── backend/                 # FastAPI + PostgreSQL + Telethon
│   ├── main.py              # API e rotas
│   ├── database.py          # Engine async SQLAlchemy
│   ├── models.py            # Manhwa, ChapterProgress (SQLAlchemy)
│   ├── telegram_scraper.py  # Scraping + download de .cbz
│   ├── init_db.py           # Criação/reset das tabelas
│   ├── requirements.txt
│   └── README.md
│
├── frontend/                # Next.js 14 (web)
│   ├── app/                 # Rotas (App Router)
│   ├── components/          # ManhwaCard, AddManhwaModal, CbzReader
│   ├── lib/api.ts           # API base dinâmico (window.location.hostname)
│   └── types/manhwa.ts
│
├── mobile/                  # Expo SDK 54 (React Native)
│   ├── src/app/             # Rotas (expo-router)
│   ├── src/components/      # ManhwaCard, AddManhwaModal, CbzReader
│   ├── src/lib/api.ts       # API base (EXPO_PUBLIC_API_BASE)
│   └── src/types/manhwa.ts
│
├── AGENT_INSTRUCTIONS.md    # Guia para agentes de IA
├── iniciaBack.bat           # Inicia o backend
└── iniciaFront.bat          # Inicia o frontend
```

## 🔧 Próximas Melhorias

- [ ] Autenticação de usuários
- [ ] Sistema de busca avançada
- [ ] Estatísticas de leitura
- [ ] Dark/Light mode toggle
- [ ] Exportar/Importar lista
- [ ] Integração com APIs de manhwas (MAL, AniList, etc)
- [ ] PWA (Progressive Web App)
- [ ] Unificar tipos compartilhados em pacote único

## 📝 API Endpoints (resumido)

CRUD básico:
- `GET    /api/manhwas` — lista todos (filtro opcional `?status=...`)
- `GET    /api/manhwas/{id}` — detalhe
- `POST   /api/manhwas` — criar
- `PUT    /api/manhwas/{id}` — atualizar
- `DELETE /api/manhwas/{id}` — excluir
- `PATCH  /api/manhwas/{id}/current-chapter` — atualiza capítulo atual

Leitor CBZ:
- `GET /api/manhwas/{id}/files` — lista `.cbz` em `DOWNLOAD_DIR/{titulo}/`
- `GET /api/manhwas/{id}/read/{filename}` — info do CBZ (nº de páginas)
- `GET /api/manhwas/{id}/read/{filename}/page/{n}` — serve uma página
- `GET /PUT /api/manhwas/{id}/read/{filename}/scroll` — posição de scroll

Telegram:
- `POST /api/telegram/import` — importa manhwas de um tópico
- `POST /api/manhwas/download-all` — baixa `.cbz` de todos com `download=true`
- `POST /api/manhwas/review-all` — revisa todos com link do Telegram e recalcula `total_chapters` e `medium_reaction` (sem baixar nada)
- `GET  /api/telegram/test` — testa credenciais do `.env`

Documentação completa interativa: `http://localhost:8000/docs`.

## 📄 Licença

Este projeto é open source e está disponível sob a licença MIT.

## 👤 Autor

Rafael Mendes

---

Feito com ❤️ para amantes de Manhwas!
