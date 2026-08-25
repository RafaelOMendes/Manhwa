# Manhwa Tracker — Frontend

App web em Next.js 14 (App Router) para gerenciar e ler manhwas.

## Setup

```bash
cd frontend
npm install
npm run dev
```

Acesse `http://localhost:3000`. A API base é resolvida dinamicamente a partir de `window.location.hostname` em `lib/api.ts` (aponta para o backend na porta 8000 do mesmo host).

## Funcionalidades

- Grid de manhwas com filtros por status, capítulos novos e apenas baixados
- Cadastro/edição de manhwas (título, capa, status, avaliação, notas)
- Leitor `.cbz` integrado, com posição de scroll salva
- Importação e sincronização de capítulos via Telegram

## Estrutura

```
frontend/
├── app/            # Rotas (App Router): layout.tsx, page.tsx
├── components/     # ManhwaCard, AddManhwaModal, CbzReader
├── lib/api.ts      # Base URL da API (dinâmico via hostname)
└── types/manhwa.ts # Tipagens TypeScript (Manhwa, etc.)
```

Consome a mesma API do **[backend](../backend/README.md)**.
