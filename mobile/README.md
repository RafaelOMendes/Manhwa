# Manhwa Tracker — Mobile

App Expo (React Native) para ler manhwas com suporte a leitura offline.

## Setup

```bash
cd mobile
npm install
npx expo start
```

Abre em Expo Go, emulador Android/iOS, ou dev build. A API padrão aponta para o IP Tailscale configurado em `src/lib/api.ts`. Para usar outro endereço, crie `mobile/.env`:

```env
EXPO_PUBLIC_API_BASE=http://192.168.0.10:8000
```

## Funcionalidades

- Leitor `.cbz` nativo com modo imersivo (sem barra de status/navegação)
- Download de capítulos para leitura 100% offline (fila em background com progresso)
- Sincronização de progresso de leitura (scroll e capítulo atual) entre local e servidor
- Grid de manhwas com filtros por status / capítulos novos / apenas baixados

## Estrutura

```
mobile/src/
├── app/              # Rotas (expo-router): index (home), downloads
├── components/       # ManhwaCard, AddManhwaModal, CbzReader, ReaderHost
├── lib/              # api.ts, cache.ts, download-manager.ts, sync-queue.ts
├── constants/        # theme.ts (paleta dark/light)
├── hooks/            # use-theme, use-color-scheme
└── types/            # manhwa.ts
```

## Rotas

- `index.tsx` — home: grid de manhwas, filtros, FABs de sincronizar/adicionar
- `downloads.tsx` — gerência de downloads (baixar tudo, individual, remover, progresso)
- `_layout.tsx` — Stack raiz + `ReaderHost` (leitor CBZ montado uma única vez)

## Rodando em dev

`npx expo start` e escolha Expo Go, emulador ou dev build no terminal. Mudanças só em JS/TS podem ser entregues via `eas update --branch preview`; mudanças nativas (dependências, `app.json`, plugins) exigem `eas build`.

Para arquitetura detalhada (leitor, cache offline, downloads em background, versionamento/OTA), veja **[AGENTS.md](AGENTS.md)**.
