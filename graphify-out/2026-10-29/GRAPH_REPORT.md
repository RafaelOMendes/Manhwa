# Graph Report - Manhwa  (2026-10-29)

## Corpus Check
- 83 files · ~70,068 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 4, .gz 3, .bat 3)

## Summary
- 984 nodes · 1925 edges · 82 communities (47 shown, 35 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 79 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `355990bb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ref_react
- main.py
- background-download.ts
- Expo App Config (app.json)
- dependencies
- Project Architecture Docs
- cache.ts
- Frontend Dependencies
- Frontend TS Config
- index.tsx
- logging_setup.py
- Mobile Package Scripts
- downloads.tsx
- _layout.tsx
- Backend Database Setup
- claude_runner.py
- src/components/CbzReader.tsx
- Mobile TS Config
- reader-store.ts
- sync-queue.ts
- reset-project.js
- trello_client.py
- test_chapter_progress_dedup.py
- Graphify Project Pointers
- Instruções para Agentes 🤖
- Frontend ESLint Config
- Next.js Config
- Frontend Tailwind Config
- proc_utils.py
- withNotifeeForegroundServiceType.js
- expo-constants@~18.0.13
- expo-device@~8.0.10
- expo-font@~14.0.11
- expo-linking@~8.0.12
- expo-navigation-bar
- expo-symbols@~1.0.8
- expo-system-ui@~6.0.9
- backend/README.md
- watcher.py
- expo-updates@~29.0.17
- git_ops.py
- expo-web-browser@~15.0.11
- TrelloClient
- 3. Mobile (Expo / React Native)
- update_current_chapter
- Arquitetura do app (mobile)
- 🤖 Automação Trello ↔ Claude Code
- jszip
- @notifee/react-native
- react-native-reanimated@~4.1.1
- react-native-screens@~4.16.0
- eslint.config.js
- Manhwa Tracker — Frontend
- react-native-svg@15.12.1
- react-native-web@~0.21.0
- os
- react-native-worklets@0.5.1
- Manhwa Tracker — Mobile
- test_timestamp_sync.py
- test_auto_mark_read.py
- @react-navigation/elements@^2.9.10
- Backend Python requirements
- @react-navigation/native@^7.1.8
- tailwindcss@^3.3.2
- CLAUDE.md
- .claude/CLAUDE.md
- test_review_all_partial.py
- 📚 Manhwa Tracker
- get
- Arquitetura do app mobile (leitura offline)
- AsyncSession
- unhandled_exception_handler
- Manhwa
- devDependencies
- mobile/package.json
- TelegramManhwaScraper

## God Nodes (most connected - your core abstractions)
1. `Manhwa` - 37 edges
2. `handle_dev()` - 23 edges
3. `Changelog (mobile)` - 23 edges
4. `TrelloClient` - 20 edges
5. `TelegramManhwaScraper` - 19 edges
6. `rodar()` - 18 edges
7. `_run()` - 17 edges
8. `ChapterProgress` - 17 edges
9. `expo` - 17 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Modo Tela Cheia (Imersivo) no Leitor CBZ` --semantically_similar_to--> `Leitor (CbzReader + reader-store + ReaderHost)`  [INFERRED] [semantically similar]
  AGENT_INSTRUCTIONS.md → mobile/AGENTS.md
- `Leitor .cbz integrado (web e mobile)` --semantically_similar_to--> `Leitor (CbzReader + reader-store + ReaderHost)`  [INFERRED] [semantically similar]
  README.md → mobile/AGENTS.md
- `Persistência de progresso de leitura (scroll por capítulo)` --semantically_similar_to--> `Leitor (CbzReader + reader-store + ReaderHost)`  [INFERRED] [semantically similar]
  AGENT_INSTRUCTIONS.md → mobile/AGENTS.md
- `8. Troubleshooting rápido` --references--> `resolve_command()`  [INFERRED]
  automation/SETUP.md → automation/proc_utils.py
- `📚 Manhwa Tracker` --references--> `Manhwa Tracker Backend (setup e endpoints)`  [EXTRACTED]
  README.md → backend/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Manhwa Tracker three-part architecture (backend, frontend, mobile)** — agent_instructions_backend, agent_instructions_frontend, agent_instructions_mobile [EXTRACTED 1.00]
- **Mobile offline reading pipeline (download, cache, reader, sync-queue)** — mobile_agents_download, mobile_agents_cache, mobile_agents_reader, mobile_agents_sync_queue [INFERRED 0.85]
- **EAS OTA delivery flow (versioning, native build, changelog)** — mobile_agents_versioning_ota, mobile_agents_native_build, mobile_agents_eas_update_delivery, mobile_changelog [INFERRED 0.85]

## Communities (82 total, 35 thin omitted)

### Community 0 - "ref_react"
Cohesion: 0.11
Nodes (23): Home(), AddManhwaModal(), AddManhwaModalProps, CbzReader(), CbzReaderProps, ChapterFile, extractChapterNumber(), CbzFile (+15 more)

### Community 1 - "main.py"
Cohesion: 0.09
Nodes (14): log_error(), create_manhwa(), download_all_manhwas(), _env_int(), get_telegram_scraper(), import_from_telegram(), lifespan(), Manhwa (+6 more)

### Community 2 - "background-download.ts"
Cohesion: 0.11
Nodes (32): aggregate(), AndroidForegroundServiceType, AndroidImportance, clearNotifTimer(), currentQueue, drainQueue(), ensureChannel(), EventType (+24 more)

### Community 3 - "Expo App Config (app.json)"
Cohesion: 0.05
Nodes (37): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, permissions, predictiveBackGestureEnabled (+29 more)

### Community 4 - "dependencies"
Cohesion: 0.11
Nodes (18): dependencies, expo-build-properties@~1.0.10, expo-file-system@~19.0.22, expo-glass-effect@~0.1.10, expo-image@~3.0.11, expo-router@~6.0.23, expo-splash-screen@~31.0.13, lucide-react-native@^1.16.0 (+10 more)

### Community 5 - "Project Architecture Docs"
Cohesion: 0.09
Nodes (23): 1.1.10, 1.1.11, 1.1.12, 1.2.0, 1.2.1, 1.2.2, 1.2.3, 1.2.4 (+15 more)

### Community 6 - "cache.ts"
Cohesion: 0.11
Nodes (27): CachedEntry, CacheIndex, CbzFileSnapshot, chapterDir(), chapterNumberFor(), clearLocalScrollFor(), dirSizeBytes(), downloadChapter() (+19 more)

### Community 7 - "Frontend Dependencies"
Cohesion: 0.06
Nodes (39): inter, metadata, dependencies, axios@^1.6.2, lucide-react@^0.294.0, next@14.0.4, react@^18.2.0, react-dom@^18.2.0 (+31 more)

### Community 8 - "Frontend TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 9 - "index.tsx"
Cohesion: 0.14
Nodes (18): react-native@0.81.5, Checkbox, FilterId, FILTERS, Home(), styles, AddManhwaModal(), AddManhwaModalProps (+10 more)

### Community 10 - "logging_setup.py"
Cohesion: 0.12
Nodes (7): build_prompt(), _choose_model_and_effort(), _parse_choice(), PromptDraft, get_logger(), RedactingFormatter, setup_logging()

### Community 11 - "Mobile Package Scripts"
Cohesion: 0.29
Nodes (7): scripts, android, ios, lint, reset-project, start, web

### Community 12 - "downloads.tsx"
Cohesion: 0.19
Nodes (20): buildRow(), Downloads(), formatBytes(), poolMap(), resolveCoverUri(), RowInfo, Unit, CbzFile (+12 more)

### Community 13 - "_layout.tsx"
Cohesion: 0.24
Nodes (19): RootLayout(), setupDownloadNotificationPress(), applyReadReconcile(), cleanupCorrupted(), cleanupExpired(), deleteChapterDirAsync(), deleteChapterLocal(), downloadCover() (+11 more)

### Community 14 - "Backend Database Setup"
Cohesion: 0.12
Nodes (9): create_tables(), drop_tables(), get_db(), is_connection_closed_error(), _safe_close(), safe_rollback(), check_database_connection(), initialize_database() (+1 more)

### Community 15 - "claude_runner.py"
Cohesion: 0.22
Nodes (7): ClaudeRunResult, _log(), _looks_like_usage_limit(), _parse_usage_limit_reset(), run_claude_code(), _run_once(), _heartbeat()

### Community 16 - "src/components/CbzReader.tsx"
Cohesion: 0.18
Nodes (14): react-native-safe-area-context@~5.6.2, CbzReader(), CbzReaderProps, ChapterFile, extractChapterNumber(), ReaderPage, ReaderPageProps, ScrollToken (+6 more)

### Community 17 - "Mobile TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, strict, extends, include, @/assets/*, expo/tsconfig.base

### Community 18 - "reader-store.ts"
Cohesion: 0.26
Nodes (12): ReaderHost(), closeReader(), emit(), getState(), listeners, navigateReader(), openReader(), ReaderFile (+4 more)

### Community 19 - "sync-queue.ts"
Cohesion: 0.24
Nodes (13): adoptServerCurrentChapter(), ChapterReadOp, drainQueue(), DrainResult, enqueueChapterRead(), enqueueScroll(), loadQueue(), parseSyncResponse() (+5 more)

### Community 20 - "reset-project.js"
Cohesion: 0.17
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 22 - "test_chapter_progress_dedup.py"
Cohesion: 0.11
Nodes (10): _main(), remover_duplicatas_progress(), _stmt_remover_duplicatas(), ChapterProgress, check(), estado(), linha(), novo_banco() (+2 more)

### Community 24 - "Instruções para Agentes 🤖"
Cohesion: 0.29
Nodes (6): Como editar este arquivo corretamente, 🔍 Como se Orientar (Instruções para Agentes), Exemplo de fluxo, Instruções para Agentes 🤖, 📝 Manutenção deste Arquivo (Obrigatório para Agentes), 🎯 Próximos Passos (Para a IA)

### Community 28 - "proc_utils.py"
Cohesion: 0.38
Nodes (3): _manual_path_search(), resolve_command(), 8. Troubleshooting rápido

### Community 41 - "backend/README.md"
Cohesion: 0.29
Nodes (7): Detalhes técnicos, Endpoints, Estrutura do Projeto, Instalação Rápida, Manhwa Tracker — Backend, Telegram, Troubleshooting

### Community 42 - "watcher.py"
Cohesion: 0.13
Nodes (13): network_reason(), redact(), send_telegram_message(), card_url(), _extract_objective(), handle_dev(), handle_doing(), handle_done() (+5 more)

### Community 44 - "git_ops.py"
Cohesion: 0.16
Nodes (18): automation_version(), branch_exists(), branch_name_for_card(), changed_areas(), changed_areas_since(), commit_all_if_dirty(), current_branch(), current_commit() (+10 more)

### Community 47 - "3. Mobile (Expo / React Native)"
Cohesion: 0.18
Nodes (11): 1. Backend (FastAPI / Python), 2. Frontend (Next.js / React Web), 3. Mobile (Expo / React Native), 4. Automação Trello ↔ Claude Code, 🕒 Comparação de timestamps na sincronização (app offline ↔ banco), ⚙️ Configurações Importantes, 📶 Detecção de conectividade / modo offline, 📁 Estrutura Interna (`/mobile`) (+3 more)

### Community 48 - "update_current_chapter"
Cohesion: 0.19
Nodes (7): _cliente_esta_velho(), get_manhwas(), _ordem(), _iso_utc(), _parse_client_ts(), _to_utc(), update_current_chapter()

### Community 49 - "Arquitetura do app (mobile)"
Cohesion: 0.20
Nodes (10): Arquitetura do app (mobile), Cache local / leitura (`src/lib/cache.ts`), 🚨 Contrato do foreground service (`registerForegroundService`) — LER antes de mexer, Download (`src/lib/download-manager.ts` + `background-download.ts`), Entregar via `eas update` (autorizado pro Claude), Fila offline (`src/lib/sync-queue.ts`), Leitor (`src/components/CbzReader.tsx` + `src/lib/reader-store.ts` + `ReaderHost.tsx`), Nativo / build (+2 more)

### Community 50 - "🤖 Automação Trello ↔ Claude Code"
Cohesion: 0.20
Nodes (9): 0. Antes de começar — checklist rápido no seu terminal, 1. Ajustar as listas do Trello, 2. Credenciais do Trello, 3. Bot do Telegram (avisos), 4. Configurar o `.env`, 5. Rodar, 6. Uso no dia a dia, 7. Limitações conhecidas (v1) (+1 more)

### Community 55 - "eslint.config.js"
Cohesion: 0.33
Nodes (4): { defineConfig }, expoConfig, eslint-config-expo@~10.0.0, eslint-config-expo

### Community 56 - "Manhwa Tracker — Frontend"
Cohesion: 0.50
Nodes (4): Estrutura, Funcionalidades, Manhwa Tracker — Frontend, Setup

### Community 59 - "os"
Cohesion: 0.32
Nodes (5): _default_state(), get_card(), load(), save(), set_card()

### Community 61 - "Manhwa Tracker — Mobile"
Cohesion: 0.20
Nodes (8): Expo HAS CHANGED, ⚠️ Versão do app + OTA (LER antes de bumpar versão), Estrutura, Funcionalidades, Manhwa Tracker — Mobile, Rodando em dev, Rotas, Setup

### Community 62 - "test_timestamp_sync.py"
Cohesion: 0.30
Nodes (8): cenarios(), check(), forcar_updated_at(), forcar_updated_at_scroll(), get_scroll(), ler_manhwa(), patch_chapter(), rodar()

### Community 63 - "test_auto_mark_read.py"
Cohesion: 0.39
Nodes (4): check(), patch_chapter(), registros(), rodar()

### Community 65 - "Backend Python requirements"
Cohesion: 0.24
Nodes (11): Schema do Banco (tabela manhwas), PostgreSQL, Manhwa Tracker Backend (setup e endpoints), Telethon (cliente Telegram), Backend Python requirements, asyncpg==0.29.0, pydantic==2.5.3, sqlalchemy==2.0.36 (+3 more)

### Community 77 - "test_review_all_partial.py"
Cohesion: 0.09
Nodes (13): BareScraper, check(), FakeClient, FakeFilenameAttr, FakeMessage, FakeScraper, instalar_scraper_falso(), ler_banco() (+5 more)

### Community 78 - "📚 Manhwa Tracker"
Cohesion: 0.16
Nodes (13): Backend (FastAPI / Python), Frontend (Next.js / React Web), Manhwa Tracker Architecture Overview, fastapi==0.109.0, API Endpoints (resumido), API (resumo), Autor, Estrutura do Projeto (+5 more)

### Community 79 - "get"
Cohesion: 0.09
Nodes (12): download_cbz_file(), _extract_chapter_number(), get_cbz_info(), get_cbz_page(), get_manhwa(), _list_cbz_files_async(), list_manhwa_files(), _manhwa_download_dir() (+4 more)

### Community 80 - "Arquitetura do app mobile (leitura offline)"
Cohesion: 0.19
Nodes (6): Mobile (Expo / React Native), Arquitetura do app mobile (leitura offline), Expo SDK 54 (mobile), mobile/CLAUDE.md (aponta para AGENTS.md), Welcome to your Expo app (README starter), Leitor .cbz integrado (web e mobile)

### Community 82 - "AsyncSession"
Cohesion: 0.15
Nodes (9): _buscar_progress(), delete_manhwa(), get_scroll(), _mark_previous_chapters_read(), _remover_duplicatas_progress(), ScrollUpdate, update_manhwa(), update_scroll() (+1 more)

### Community 84 - "Manhwa"
Cohesion: 0.17
Nodes (7): run(), snapshot(), _persist_sync_updates(), review_all_manhwas(), read_stats_with_retry(), review_one_manhwa(), Manhwa

### Community 85 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, eslint@^9.0.0, @expo/ngrok@^4.1.0, @types/react@~19.1.10, typescript@~5.9.2, eslint, @types/react, typescript (+1 more)

### Community 87 - "mobile/package.json"
Cohesion: 0.13
Nodes (14): expo@~54.0.0, expo-status-bar@~3.0.9, nativewind@^2.0.11, react-native-gesture-handler@~2.28.0, @react-navigation/bottom-tabs@^7.4.0, main, name, private (+6 more)

### Community 88 - "TelegramManhwaScraper"
Cohesion: 0.08
Nodes (6): carregar_amostra(), LegacyScraper, main(), medir(), classify_telegram_error(), TelegramManhwaScraper

## Knowledge Gaps
- **10 isolated node(s):** `next/core-web-vitals`, `expo/tsconfig.base`, `API Endpoints (resumido)`, `sqlalchemy==2.0.36`, `uvicorn[standard]==0.27.0` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 407 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `lucide-react` connect `ref_react` to `Frontend Dependencies`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `Manhwa` (e.g. with `carregar_amostra()` and `run()`) actually correct?**
  _`Manhwa` has 21 INFERRED edges - model-reasoned connections that need verification._
- **What connects `next/core-web-vitals`, `expo/tsconfig.base`, `API Endpoints (resumido)` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ref_react` be split into smaller, more focused modules?**
  _Cohesion score 0.10810810810810811 - nodes in this community are weakly interconnected._
- **Why does `react-native` connect `index.tsx` to `ref_react`, `background-download.ts`, `downloads.tsx`, `_layout.tsx`, `src/components/CbzReader.tsx`, `mobile/package.json`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `handle_dev()` (e.g. with `TrelloClient` and `.comment_card()`) actually correct?**
  _`handle_dev()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `main.py` be split into smaller, more focused modules?**
  _Cohesion score 0.08901515151515152 - nodes in this community are weakly interconnected._