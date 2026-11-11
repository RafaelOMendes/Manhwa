# Graph Report - Manhwa  (2026-11-10)

## Corpus Check
- 98 files · ~96,555 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 4, .gz 3, .bat 3)

## Summary
- 1217 nodes · 2513 edges · 91 communities (55 shown, 36 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 86 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dcd4989c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ref_react
- test_timestamp_sync.py
- background-download.ts
- Expo App Config (app.json)
- dependencies
- Project Architecture Docs
- cache.ts
- Frontend Dependencies
- Frontend TS Config
- index.tsx
- Manhwa
- Mobile Package Scripts
- database.py
- src/components/CbzReader.tsx
- loadIndex
- _run_once
- downloads.tsx
- Mobile TS Config
- image-size.ts
- expo-build-properties@~1.0.10
- reset-project.js
- claude_prompt.py
- test_chapter_progress_dedup.py
- Graphify Project Pointers
- Instruções para Agentes 🤖
- Frontend ESLint Config
- Next.js Config
- Frontend Tailwind Config
- memory.ts
- withNotifeeForegroundServiceType.js
- test_cbz_pages.py
- apply
- sync-queue.ts
- test_auto_mark_read.py
- usage_guard.py
- 🤖 Automação Trello ↔ Claude Code
- os
- backend/README.md
- watcher.py
- FakeClient
- git_ops.py
- _mark_previous_chapters_read
- TrelloClient
- 3. Mobile (Expo / React Native)
- os
- Arquitetura do app (mobile)
- expo-file-system
- test_cbz_path_traversal.py
- logging_setup.py
- test_usage_guard.py
- expo-glass-effect@~0.1.10
- eslint.config.js
- Manhwa Tracker — Frontend
- reader-store.ts
- nativewind@^2.0.11
- @react-navigation/bottom-tabs@^7.4.0
- react-native-gesture-handler@~2.28.0
- Manhwa Tracker — Mobile
- expo-network@~8.0.8
- theme.ts
- downloadChapter
- Backend Python requirements
- src/components/ManhwaCard.tsx
- expo-splash-screen@~31.0.13
- expo-status-bar
- expo-web-browser@~15.0.11
- @react-native-async-storage/async-storage
- CLAUDE.md
- .claude/CLAUDE.md
- react-native-reanimated@~4.1.1
- react-native-worklets@0.5.1
- test_review_all_partial.py
- 📚 Manhwa Tracker
- react-native-safe-area-context
- Arquitetura do app mobile (leitura offline)
- main.py
- expo-symbols@~1.0.8
- devDependencies
- expo-system-ui@~6.0.9
- mobile/package.json
- TelegramManhwaScraper
- expo-updates@~29.0.17
- @react-navigation/elements@^2.9.10
- react-dom@19.1.0
- @react-navigation/native@^7.1.8

## God Nodes (most connected - your core abstractions)
1. `Manhwa` - 40 edges
2. `CbzReader()` - 28 edges
3. `handle_dev()` - 24 edges
4. `Changelog (mobile)` - 23 edges
5. `TrelloClient` - 20 edges
6. `TelegramManhwaScraper` - 19 edges
7. `ChapterProgress` - 18 edges
8. `rodar()` - 18 edges
9. `run_claude_code()` - 17 edges
10. `_run()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Leitor .cbz integrado (web e mobile)` --semantically_similar_to--> `Leitor (CbzReader + reader-store + ReaderHost)`  [INFERRED] [semantically similar]
  README.md → mobile/AGENTS.md
- `Modo Tela Cheia (Imersivo) no Leitor CBZ` --semantically_similar_to--> `Leitor (CbzReader + reader-store + ReaderHost)`  [INFERRED] [semantically similar]
  AGENT_INSTRUCTIONS.md → mobile/AGENTS.md
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
- **EAS OTA delivery flow (versioning, native build, changelog)** — mobile_agents_versioning_ota, mobile_agents_native_build, mobile_agents_eas_update_delivery, mobile_changelog [INFERRED 0.85]
- **Mobile offline reading pipeline (download, cache, reader, sync-queue)** — mobile_agents_download, mobile_agents_cache, mobile_agents_reader, mobile_agents_sync_queue [INFERRED 0.85]

## Communities (91 total, 36 thin omitted)

### Community 0 - "ref_react"
Cohesion: 0.19
Nodes (17): Home(), AddManhwaModal(), AddManhwaModalProps, CbzReader(), CbzReaderProps, ChapterFile, extractChapterNumber(), CbzFile (+9 more)

### Community 1 - "test_timestamp_sync.py"
Cohesion: 0.11
Nodes (20): _cliente_esta_velho(), get_manhwas(), _ordem(), _iso_utc(), _parse_client_ts(), ScrollUpdate, _to_utc(), update_current_chapter() (+12 more)

### Community 2 - "background-download.ts"
Cohesion: 0.11
Nodes (32): aggregate(), AndroidForegroundServiceType, AndroidImportance, clearNotifTimer(), currentQueue, drainQueue(), ensureChannel(), EventType (+24 more)

### Community 3 - "Expo App Config (app.json)"
Cohesion: 0.05
Nodes (37): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, permissions, predictiveBackGestureEnabled (+29 more)

### Community 4 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, expo@~54.0.0, expo-constants@~18.0.13, expo-font@~14.0.11, expo-linking@~8.0.12, jszip@^3.10.1, @notifee/react-native@^9.1.8, react-native-screens@~4.16.0 (+9 more)

### Community 5 - "Project Architecture Docs"
Cohesion: 0.09
Nodes (23): 1.1.10, 1.1.11, 1.1.12, 1.2.0, 1.2.1, 1.2.2, 1.2.3, 1.2.4 (+15 more)

### Community 6 - "cache.ts"
Cohesion: 0.09
Nodes (31): CachedEntry, CacheIndex, CbzFileSnapshot, chapterDir(), chapterNumberFor(), clearLocalScrollFor(), deleteMeasured(), dirSizeBytes() (+23 more)

### Community 7 - "Frontend Dependencies"
Cohesion: 0.06
Nodes (39): inter, metadata, dependencies, axios@^1.6.2, lucide-react@^0.294.0, next@14.0.4, react@^18.2.0, react-dom@^18.2.0 (+31 more)

### Community 8 - "Frontend TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 9 - "index.tsx"
Cohesion: 0.16
Nodes (17): lucide-react-native@^1.16.0, Checkbox, FilterId, FILTERS, Home(), styles, AddManhwaModal(), AddManhwaModalProps (+9 more)

### Community 10 - "Manhwa"
Cohesion: 0.12
Nodes (9): carregar_amostra(), run(), snapshot(), ManhwaUpdate, update_manhwa(), Manhwa, check(), rodar() (+1 more)

### Community 11 - "Mobile Package Scripts"
Cohesion: 0.29
Nodes (7): scripts, android, ios, lint, reset-project, start, web

### Community 12 - "database.py"
Cohesion: 0.07
Nodes (14): _connect_with_retry(), create_tables(), drop_tables(), get_db(), is_connection_closed_error(), is_transient_db_error(), _safe_close(), check_database_connection() (+6 more)

### Community 13 - "src/components/CbzReader.tsx"
Cohesion: 0.11
Nodes (22): cancelScrollToken(), CbzReader(), CbzReaderProps, ChapterFile, extractChapterNumber(), jsHeapSuffix(), measureLocalRatios(), newScrollToken() (+14 more)

### Community 14 - "loadIndex"
Cohesion: 0.15
Nodes (25): RootLayout(), setupDownloadNotificationPress(), addReads(), applyReadReconcile(), cleanupCorrupted(), cleanupExpired(), cleanupOrphanedStorage(), commitDownloadedChapter() (+17 more)

### Community 15 - "_run_once"
Cohesion: 0.11
Nodes (13): _as_text(), ClaudeRunResult, _log(), _looks_like_usage_limit(), _parse_stream_json(), _parse_usage_limit_reset(), run_claude_code(), _run_once() (+5 more)

### Community 16 - "downloads.tsx"
Cohesion: 0.12
Nodes (23): expo-image@~3.0.11, expo-router@~6.0.23, react-native@0.81.5, Downloads(), formatBytes(), poolMap(), RowInfo, Unit (+15 more)

### Community 17 - "Mobile TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, strict, extends, include, @/assets/*, expo/tsconfig.base

### Community 18 - "image-size.ts"
Cohesion: 0.21
Nodes (16): activeProbeSessions, ascii(), B64_LOOKUP, base64ToBytes(), i32le(), ImageSize, jpegSize(), parseImageSize() (+8 more)

### Community 20 - "reset-project.js"
Cohesion: 0.17
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 21 - "claude_prompt.py"
Cohesion: 0.27
Nodes (4): build_prompt(), _choose_model_and_effort(), _parse_choice(), PromptDraft

### Community 22 - "test_chapter_progress_dedup.py"
Cohesion: 0.12
Nodes (11): _main(), remover_duplicatas_progress(), _stmt_remover_duplicatas(), _remover_duplicatas_progress(), ChapterProgress, check(), estado(), linha() (+3 more)

### Community 24 - "Instruções para Agentes 🤖"
Cohesion: 0.29
Nodes (6): Como editar este arquivo corretamente, 🔍 Como se Orientar (Instruções para Agentes), Exemplo de fluxo, Instruções para Agentes 🤖, 📝 Manutenção deste Arquivo (Obrigatório para Agentes), 🎯 Próximos Passos (Para a IA)

### Community 28 - "memory.ts"
Cohesion: 0.29
Nodes (10): releaseImageMemory(), MemoryLabel(), MemoryLabelProps, formatMB(), formatMemory(), kbFieldToMB(), MemorySample, readMemory() (+2 more)

### Community 30 - "test_cbz_pages.py"
Cohesion: 0.18
Nodes (15): dimensoes_imagem(), dimensoes_paginas(), _jpeg(), listar_paginas(), _medir(), _valido(), bmp(), check() (+7 more)

### Community 31 - "apply"
Cohesion: 0.15
Nodes (6): apply(), ApplyCallAndThresholdTests, ExtractFiveHourWindowTests, apply_call(), extract_five_hour_window(), should_pause()

### Community 34 - "sync-queue.ts"
Cohesion: 0.22
Nodes (15): adoptServerCurrentChapter(), markReadThroughLocal(), saveLocalScroll(), ChapterReadOp, drainQueue(), DrainResult, enqueueChapterRead(), enqueueScroll() (+7 more)

### Community 36 - "test_auto_mark_read.py"
Cohesion: 0.09
Nodes (15): _buscar_progress(), delete_manhwa(), get_cbz_info(), get_manhwa(), get_scroll(), list_manhwa_files(), ping(), _preencher_lidos() (+7 more)

### Community 37 - "usage_guard.py"
Cohesion: 0.22
Nodes (8): GuardFlowTestCase, PauseResumeTests, rate_limit_info(), describe_config(), _fmt_pct(), _fmt_time(), record_call(), wait_if_paused()

### Community 38 - "🤖 Automação Trello ↔ Claude Code"
Cohesion: 0.18
Nodes (10): 0. Antes de começar — checklist rápido no seu terminal, 1. Ajustar as listas do Trello, 2. Credenciais do Trello, 3. Bot do Telegram (avisos), 4. Configurar o `.env`, 5. Rodar, 6. Uso no dia a dia, 7. Limitações conhecidas (v1) (+2 more)

### Community 40 - "os"
Cohesion: 0.24
Nodes (10): _default_state(), get_card(), load(), load_usage(), _read_json(), save(), save_usage(), set_card() (+2 more)

### Community 41 - "backend/README.md"
Cohesion: 0.29
Nodes (7): Detalhes técnicos, Endpoints, Estrutura do Projeto, Instalação Rápida, Manhwa Tracker — Backend, Telegram, Troubleshooting

### Community 42 - "watcher.py"
Cohesion: 0.13
Nodes (14): redact(), send_telegram_message(), resolve_list_ids(), TrelloNetworkError, _describe_network_error(), _extract_objective(), handle_doing(), handle_done() (+6 more)

### Community 44 - "git_ops.py"
Cohesion: 0.16
Nodes (20): automation_version(), branch_exists(), branch_name_for_card(), changed_areas(), changed_areas_since(), commit_all_if_dirty(), current_branch(), current_commit() (+12 more)

### Community 45 - "_mark_previous_chapters_read"
Cohesion: 0.20
Nodes (5): _extract_chapter_number(), _list_cbz_files_async(), _manhwa_download_dir(), _mark_previous_chapters_read(), _scan_cbz_files()

### Community 47 - "3. Mobile (Expo / React Native)"
Cohesion: 0.18
Nodes (11): 1. Backend (FastAPI / Python), 2. Frontend (Next.js / React Web), 3. Mobile (Expo / React Native), 4. Automação Trello ↔ Claude Code, 🕒 Comparação de timestamps na sincronização (app offline ↔ banco), ⚙️ Configurações Importantes, 📶 Detecção de conectividade / modo offline, 📁 Estrutura Interna (`/mobile`) (+3 more)

### Community 49 - "Arquitetura do app (mobile)"
Cohesion: 0.20
Nodes (10): Arquitetura do app (mobile), Cache local / leitura (`src/lib/cache.ts`), 🚨 Contrato do foreground service (`registerForegroundService`) — LER antes de mexer, Download (`src/lib/download-manager.ts` + `background-download.ts`), Entregar via `eas update` (autorizado pro Claude), Fila offline (`src/lib/sync-queue.ts`), Leitor (`src/components/CbzReader.tsx` + `src/lib/reader-store.ts` + `ReaderHost.tsx`), Nativo / build (+2 more)

### Community 51 - "test_cbz_path_traversal.py"
Cohesion: 0.24
Nodes (6): _cbz_path(), download_cbz_file(), get_cbz_page(), check(), recusado(), rodar()

### Community 52 - "logging_setup.py"
Cohesion: 0.10
Nodes (5): get_logger(), network_reason(), RedactingFormatter, setup_logging(), _build_session()

### Community 53 - "test_usage_guard.py"
Cohesion: 0.15
Nodes (3): FakeClock, ParseThresholdTests, parse_threshold()

### Community 55 - "eslint.config.js"
Cohesion: 0.33
Nodes (4): { defineConfig }, expoConfig, eslint-config-expo@~10.0.0, eslint-config-expo

### Community 56 - "Manhwa Tracker — Frontend"
Cohesion: 0.50
Nodes (4): Estrutura, Funcionalidades, Manhwa Tracker — Frontend, Setup

### Community 57 - "reader-store.ts"
Cohesion: 0.28
Nodes (11): ReaderHost(), closeReader(), emit(), getState(), listeners, navigateReader(), ReaderFile, ReaderRequest (+3 more)

### Community 61 - "Manhwa Tracker — Mobile"
Cohesion: 0.20
Nodes (8): Expo HAS CHANGED, ⚠️ Versão do app + OTA (LER antes de bumpar versão), Estrutura, Funcionalidades, Manhwa Tracker — Mobile, Rodando em dev, Rotas, Setup

### Community 63 - "theme.ts"
Cohesion: 0.18
Nodes (6): BottomTabInset, Colors, Fonts, MaxContentWidth, Spacing, ThemeColor

### Community 64 - "downloadChapter"
Cohesion: 0.26
Nodes (7): downloadChapter(), createLimiter(), Limiter, retryUnlessTimeout(), runPages(), TimeoutError, withTimeout()

### Community 65 - "Backend Python requirements"
Cohesion: 0.24
Nodes (11): Schema do Banco (tabela manhwas), PostgreSQL, Manhwa Tracker Backend (setup e endpoints), Telethon (cliente Telegram), Backend Python requirements, asyncpg==0.29.0, pydantic==2.5.3, sqlalchemy==2.0.36 (+3 more)

### Community 66 - "src/components/ManhwaCard.tsx"
Cohesion: 0.29
Nodes (14): buildRow(), resolveCoverUri(), CbzFile, ManhwaCard(), forgetManhwaLocal(), getLocalChaptersSet(), getLocalCoverUri(), getReadChaptersSet() (+6 more)

### Community 77 - "test_review_all_partial.py"
Cohesion: 0.13
Nodes (11): check(), FakeFilenameAttr, FakeMessage, FakeScraper, instalar_scraper_falso(), ler_banco(), main_async(), preparar_banco() (+3 more)

### Community 78 - "📚 Manhwa Tracker"
Cohesion: 0.16
Nodes (13): Backend (FastAPI / Python), Frontend (Next.js / React Web), Manhwa Tracker Architecture Overview, fastapi==0.109.0, API Endpoints (resumido), API (resumo), Autor, Estrutura do Projeto (+5 more)

### Community 80 - "Arquitetura do app mobile (leitura offline)"
Cohesion: 0.19
Nodes (6): Mobile (Expo / React Native), Arquitetura do app mobile (leitura offline), Expo SDK 54 (mobile), mobile/CLAUDE.md (aponta para AGENTS.md), Welcome to your Expo app (README starter), Leitor .cbz integrado (web e mobile)

### Community 83 - "main.py"
Cohesion: 0.06
Nodes (19): safe_rollback(), log_error(), create_manhwa(), download_all_manhwas(), _env_int(), get_telegram_scraper(), import_from_telegram(), lifespan() (+11 more)

### Community 85 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, eslint@^9.0.0, @expo/ngrok@^4.1.0, @types/react@~19.1.10, typescript@~5.9.2, eslint, @types/react, typescript (+1 more)

### Community 87 - "mobile/package.json"
Cohesion: 0.13
Nodes (14): expo-device@~8.0.10, expo-navigation-bar@~5.0.10, react@19.1.0, react-native-svg@15.12.1, tailwindcss@^3.3.2, react, tailwindcss, main (+6 more)

### Community 88 - "TelegramManhwaScraper"
Cohesion: 0.07
Nodes (6): LegacyScraper, main(), medir(), classify_telegram_error(), TelegramManhwaScraper, BareScraper

## Knowledge Gaps
- **10 isolated node(s):** `next/core-web-vitals`, `expo/tsconfig.base`, `.claude/CLAUDE.md graphify skill pointer`, `graphify (instruções do projeto)`, `pydantic==2.5.3` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 464 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `lucide-react` connect `ref_react` to `Frontend Dependencies`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Are the 22 inferred relationships involving `Manhwa` (e.g. with `carregar_amostra()` and `run()`) actually correct?**
  _`Manhwa` has 22 INFERRED edges - model-reasoned connections that need verification._
- **What connects `next/core-web-vitals`, `expo/tsconfig.base`, `.claude/CLAUDE.md graphify skill pointer` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `test_timestamp_sync.py` be split into smaller, more focused modules?**
  _Cohesion score 0.10606060606060606 - nodes in this community are weakly interconnected._
- **Why does `react-native` connect `downloads.tsx` to `ref_react`, `src/components/ManhwaCard.tsx`, `background-download.ts`, `index.tsx`, `src/components/CbzReader.tsx`, `loadIndex`, `mobile/package.json`, `memory.ts`, `theme.ts`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `handle_dev()` (e.g. with `TrelloClient` and `.comment_card()`) actually correct?**
  _`handle_dev()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `background-download.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10588235294117647 - nodes in this community are weakly interconnected._