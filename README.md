# 📚 Manhwa Tracker

Aplicativo completo para gerenciar manhwas: acompanhar leitura, avaliar, importar capítulos do Telegram e ler `.cbz` direto no navegador ou no celular (com suporte offline).

## Tecnologias

| Parte | Stack |
|---|---|
| Backend | FastAPI (Python, async) + SQLAlchemy async + PostgreSQL + Telethon |
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Mobile | Expo SDK 54 + React Native + NativeWind + expo-router |

## Funcionalidades

- Cadastro e gerenciamento de manhwas (status, avaliação por estrelas, notas, capítulo atual)
- Leitor `.cbz` integrado (web e mobile, com modo imersivo e leitura offline no mobile)
- Importação e download automático de capítulos a partir de tópicos do Telegram
- Ranking "Top 30" por média de reações por capítulo
- Filtros por status, capítulos novos e apenas baixados

## Setup

Cada parte tem seu próprio README com instruções detalhadas:

- **[backend/README.md](backend/README.md)** — API FastAPI + PostgreSQL
- **[frontend/README.md](frontend/README.md)** — Web em Next.js
- **[mobile/README.md](mobile/README.md)** — App Expo

Atalhos na raiz: `iniciaBack.bat` e `iniciaFront.bat`.

## Estrutura do Projeto

```
Manhwa/
├── backend/     # FastAPI + PostgreSQL + Telethon — ver backend/README.md
├── frontend/    # Next.js 14 (web) — ver frontend/README.md
├── mobile/      # Expo SDK 54 (React Native) — ver mobile/README.md
├── automation/  # Automação Trello ↔ Claude Code (uso local, ver AGENT_INSTRUCTIONS.md)
├── AGENT_INSTRUCTIONS.md  # Guia de arquitetura para agentes de IA
├── iniciaBack.bat
└── iniciaFront.bat
```

## API (resumo)

CRUD de manhwas (`/api/manhwas`), leitor CBZ (`/api/manhwas/{id}/read/...`) e integração com Telegram (`/api/telegram/...`, importação e download de capítulos). Lista completa em **[backend/README.md](backend/README.md#endpoints)** ou na doc interativa em `http://localhost:8000/docs`.

## Licença

MIT.

## Autor

Rafael Mendes
