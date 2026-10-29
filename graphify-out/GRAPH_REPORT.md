# Graph Report - Manhwa  (2026-10-29)

## Corpus Check
- 87 files · ~80,553 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 4, .gz 3, .bat 3)

## Summary
- 1110 nodes · 2229 edges · 91 communities (53 shown, 38 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 82 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b8269166`
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
- trello_client.py
- Mobile Package Scripts
- downloads.tsx
- image-size.ts
- test_db_resilience.py
- _run_once
- src/components/ManhwaCard.tsx
- Mobile TS Config
- theme.ts
- sync-queue.ts
- reset-project.js
- claude_runner.py
- database.py
- Graphify Project Pointers
- Instruções para Agentes 🤖
- Frontend ESLint Config
- Next.js Config
- Frontend Tailwind Config
- loadIndex
- withNotifeeForegroundServiceType.js
- expo-splash-screen@~31.0.13
- state.py
- src/components/CbzReader.tsx
- test_auto_mark_read.py
- test_usage_guard.py
- reader-store.ts
- expo-device@~8.0.10
- backend/README.md
- watcher.py
- expo-updates@~29.0.17
- git_ops.py
- expo-constants@~18.0.13
- TrelloClient
- 3. Mobile (Expo / React Native)
- update_current_chapter
- Arquitetura do app (mobile)
- 🤖 Automação Trello ↔ Claude Code
- jszip
- get_logger
- init_db.py
- remover_duplicatas_progress
- eslint.config.js
- Manhwa Tracker — Frontend
- expo-web-browser@~15.0.11
- telegram_scraper.py
- @react-navigation/bottom-tabs@^7.4.0
- react-native-worklets@0.5.1
- Manhwa Tracker — Mobile
- Manhwa
- @notifee/react-native
- nativewind@^2.0.11
- Backend Python requirements
- @react-navigation/native@^7.1.8
- @react-native-async-storage/async-storage
- react-native-gesture-handler@~2.28.0
- main
- FakeClient
- CLAUDE.md
- .claude/CLAUDE.md
- FakeScraper
- FakeFilenameAttr
- test_review_all_partial.py
- 📚 Manhwa Tracker
- AsyncSession
- Arquitetura do app mobile (leitura offline)
- expo-linking@~8.0.12
- expo-system-ui@~6.0.9
- log_error
- react-dom@19.1.0
- devDependencies
- react-native-screens@~4.16.0
- mobile/package.json
- TelegramManhwaScraper
- react-native-svg@15.12.1
- @react-navigation/elements@^2.9.10

## God Nodes (most connected - your core abstractions)
1. `Manhwa` - 37 edges
2. `handle_dev()` - 24 edges
3. `Changelog (mobile)` - 23 edges
4. `TrelloClient` - 20 edges
5. `TelegramManhwaScraper` - 19 edges
6. `ChapterProgress` - 18 edges
7. `rodar()` - 18 edges
8. `run_claude_code()` - 17 edges
9. `_run()` - 17 edges
10. `record_call()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Leitor .cbz integrado (web e mobile)` --semantically_similar_to--> `Leitor (CbzReader + reader-store + ReaderHost)`  [INFERRED] [semantically similar]
  README.md → mobile/AGENTS.md
- `Modo Tela Cheia (Imersivo) no Leitor CBZ` --semantically_similar_to--> `Leitor (CbzReader + reader-store + ReaderHost)`  [INFERRED] [semantically similar]
  AGENT_INSTRUCTIONS.md → mobile/AGENTS.md
- `8. Troubleshooting rápido` --references--> `resolve_command()`  [INFERRED]
  automation/SETUP.md → automation/proc_utils.py
- `Persistência de progresso de leitura (scroll por capítulo)` --semantically_similar_to--> `Leitor (CbzReader + reader-store + ReaderHost)`  [INFERRED] [semantically similar]
  AGENT_INSTRUCTIONS.md → mobile/AGENTS.md
- `📚 Manhwa Tracker` --references--> `Manhwa Tracker Backend (setup e endpoints)`  [EXTRACTED]
  README.md → backend/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Manhwa Tracker three-part architecture (backend, frontend, mobile)** — agent_instructions_backend, agent_instructions_frontend, agent_instructions_mobile [EXTRACTED 1.00]
- **EAS OTA delivery flow (versioning, native build, changelog)** — mobile_agents_versioning_ota, mobile_agents_native_build, mobile_agents_eas_update_delivery, mobile_changelog [INFERRED 0.85]
- **Mobile offline reading pipeline (download, cache, reader, sync-queue)** — mobile_agents_download, mobile_agents_cache, mobile_agents_reader, mobile_agents_sync_queue [INFERRED 0.85]

## Communities (91 total, 38 thin omitted)

### Community 0 - "ref_react"
Cohesion: 0.20
Nodes (18): Home(), AddManhwaModal(), AddManhwaModalProps, CbzReader(), CbzReaderProps, ChapterFile, extractChapterNumber(), CbzFile (+10 more)

### Community 1 - "main.py"
Cohesion: 0.07
Nodes (20): safe_rollback(), create_manhwa(), download_all_manhwas(), _env_int(), _extract_chapter_number(), get_telegram_scraper(), import_from_telegram(), _list_cbz_files_async() (+12 more)

### Community 2 - "background-download.ts"
Cohesion: 0.10
Nodes (34): aggregate(), AndroidForegroundServiceType, AndroidImportance, clearNotifTimer(), currentQueue, drainQueue(), ensureChannel(), EventType (+26 more)

### Community 3 - "Expo App Config (app.json)"
Cohesion: 0.05
Nodes (37): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, permissions, predictiveBackGestureEnabled (+29 more)

### Community 4 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, expo@~54.0.0, expo-file-system@~19.0.22, expo-navigation-bar@~5.0.10, expo-status-bar@~3.0.9, expo-symbols@~1.0.8, react@19.1.0, react-native-web@~0.21.0 (+9 more)

### Community 5 - "Project Architecture Docs"
Cohesion: 0.09
Nodes (23): 1.1.10, 1.1.11, 1.1.12, 1.2.0, 1.2.1, 1.2.2, 1.2.3, 1.2.4 (+15 more)

### Community 6 - "cache.ts"
Cohesion: 0.12
Nodes (23): CachedEntry, CacheIndex, CbzFileSnapshot, chapterDir(), chapterNumberFor(), clearLocalScrollFor(), downloadChapter(), extractChapterNumberFromFilename() (+15 more)

### Community 7 - "Frontend Dependencies"
Cohesion: 0.06
Nodes (38): inter, metadata, dependencies, axios@^1.6.2, next@14.0.4, react@^18.2.0, react-dom@^18.2.0, devDependencies (+30 more)

### Community 8 - "Frontend TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 9 - "index.tsx"
Cohesion: 0.14
Nodes (20): lucide-react-native@^1.16.0, react-native@0.81.5, Checkbox, FilterId, FILTERS, Home(), styles, AddManhwaModal() (+12 more)

### Community 10 - "trello_client.py"
Cohesion: 0.15
Nodes (3): network_reason(), send_telegram_message(), _build_session()

### Community 11 - "Mobile Package Scripts"
Cohesion: 0.29
Nodes (7): scripts, android, ios, lint, reset-project, start, web

### Community 12 - "downloads.tsx"
Cohesion: 0.22
Nodes (13): expo-router@~6.0.23, buildRow(), Downloads(), formatBytes(), poolMap(), resolveCoverUri(), Unit, dirSizeBytes() (+5 more)

### Community 13 - "image-size.ts"
Cohesion: 0.18
Nodes (16): ascii(), B64_LOOKUP, base64ToBytes(), i32le(), ImageSize, jpegSize(), parseImageSize(), ReadAt (+8 more)

### Community 14 - "test_db_resilience.py"
Cohesion: 0.21
Nodes (4): check(), FakeDialect, main(), tenta()

### Community 15 - "_run_once"
Cohesion: 0.15
Nodes (8): _as_text(), ClaudeRunResult, _log(), _parse_stream_json(), _run_once(), _heartbeat(), session_not_found(), StreamJsonParsingTests

### Community 16 - "src/components/ManhwaCard.tsx"
Cohesion: 0.24
Nodes (12): RowInfo, CbzFile, ManhwaCard(), ManhwaCardProps, applyReadReconcile(), getLocalCoverUri(), getReadChaptersSet(), loadManhwaFiles() (+4 more)

### Community 17 - "Mobile TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, strict, extends, include, @/assets/*, expo/tsconfig.base

### Community 18 - "theme.ts"
Cohesion: 0.18
Nodes (6): BottomTabInset, Colors, Fonts, MaxContentWidth, Spacing, ThemeColor

### Community 19 - "sync-queue.ts"
Cohesion: 0.24
Nodes (13): adoptServerCurrentChapter(), ChapterReadOp, drainQueue(), DrainResult, enqueueChapterRead(), enqueueScroll(), loadQueue(), parseSyncResponse() (+5 more)

### Community 20 - "reset-project.js"
Cohesion: 0.17
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 21 - "claude_runner.py"
Cohesion: 0.15
Nodes (7): build_prompt(), _choose_model_and_effort(), _parse_choice(), PromptDraft, _looks_like_usage_limit(), _parse_usage_limit_reset(), run_claude_code()

### Community 22 - "database.py"
Cohesion: 0.11
Nodes (9): _connect_with_retry(), ChapterProgress, check(), estado(), linha(), novo_banco(), rodar(), seed_duplicatas() (+1 more)

### Community 24 - "Instruções para Agentes 🤖"
Cohesion: 0.29
Nodes (6): Como editar este arquivo corretamente, 🔍 Como se Orientar (Instruções para Agentes), Exemplo de fluxo, Instruções para Agentes 🤖, 📝 Manutenção deste Arquivo (Obrigatório para Agentes), 🎯 Próximos Passos (Para a IA)

### Community 28 - "loadIndex"
Cohesion: 0.26
Nodes (18): RootLayout(), setupDownloadNotificationPress(), addReads(), cleanupCorrupted(), cleanupExpired(), deleteChapterDirAsync(), deleteChapterLocal(), downloadCover() (+10 more)

### Community 31 - "state.py"
Cohesion: 0.24
Nodes (9): _default_state(), get_card(), load(), load_usage(), _read_json(), save(), save_usage(), _write_json() (+1 more)

### Community 34 - "src/components/CbzReader.tsx"
Cohesion: 0.15
Nodes (16): expo-image@~3.0.11, react-native-safe-area-context@~5.6.2, CbzReader(), CbzReaderProps, ChapterFile, extractChapterNumber(), ReaderPage, ReaderPageProps (+8 more)

### Community 36 - "test_auto_mark_read.py"
Cohesion: 0.15
Nodes (10): list_manhwa_files(), _preencher_lidos(), ScrollUpdate, update_scroll(), check(), criar_cbz(), lidos(), registros() (+2 more)

### Community 37 - "test_usage_guard.py"
Cohesion: 0.07
Nodes (18): apply(), ApplyCallAndThresholdTests, ClaudeRunnerIntegrationTests, fake_run_once(), ExtractFiveHourWindowTests, FakeClock, GuardFlowTestCase, ParseThresholdTests (+10 more)

### Community 38 - "reader-store.ts"
Cohesion: 0.22
Nodes (11): ReaderHost(), closeReader(), emit(), getState(), listeners, navigateReader(), ReaderFile, ReaderRequest (+3 more)

### Community 41 - "backend/README.md"
Cohesion: 0.29
Nodes (7): Detalhes técnicos, Endpoints, Estrutura do Projeto, Instalação Rápida, Manhwa Tracker — Backend, Telegram, Troubleshooting

### Community 42 - "watcher.py"
Cohesion: 0.14
Nodes (14): redact(), set_card(), TrelloNetworkError, describe_config(), card_url(), _extract_objective(), handle_dev(), handle_doing() (+6 more)

### Community 44 - "git_ops.py"
Cohesion: 0.16
Nodes (18): automation_version(), branch_exists(), branch_name_for_card(), changed_areas(), changed_areas_since(), commit_all_if_dirty(), current_branch(), current_commit() (+10 more)

### Community 47 - "3. Mobile (Expo / React Native)"
Cohesion: 0.18
Nodes (11): 1. Backend (FastAPI / Python), 2. Frontend (Next.js / React Web), 3. Mobile (Expo / React Native), 4. Automação Trello ↔ Claude Code, 🕒 Comparação de timestamps na sincronização (app offline ↔ banco), ⚙️ Configurações Importantes, 📶 Detecção de conectividade / modo offline, 📁 Estrutura Interna (`/mobile`) (+3 more)

### Community 48 - "update_current_chapter"
Cohesion: 0.16
Nodes (10): _cliente_esta_velho(), get_manhwas(), _ordem(), _iso_utc(), _parse_client_ts(), _to_utc(), update_current_chapter(), UpdateCurrentChapter (+2 more)

### Community 49 - "Arquitetura do app (mobile)"
Cohesion: 0.20
Nodes (10): Arquitetura do app (mobile), Cache local / leitura (`src/lib/cache.ts`), 🚨 Contrato do foreground service (`registerForegroundService`) — LER antes de mexer, Download (`src/lib/download-manager.ts` + `background-download.ts`), Entregar via `eas update` (autorizado pro Claude), Fila offline (`src/lib/sync-queue.ts`), Leitor (`src/components/CbzReader.tsx` + `src/lib/reader-store.ts` + `ReaderHost.tsx`), Nativo / build (+2 more)

### Community 50 - "🤖 Automação Trello ↔ Claude Code"
Cohesion: 0.18
Nodes (10): 0. Antes de começar — checklist rápido no seu terminal, 1. Ajustar as listas do Trello, 2. Credenciais do Trello, 3. Bot do Telegram (avisos), 4. Configurar o `.env`, 5. Rodar, 6. Uso no dia a dia, 7. Limitações conhecidas (v1) (+2 more)

### Community 52 - "get_logger"
Cohesion: 0.16
Nodes (5): get_logger(), RedactingFormatter, setup_logging(), _manual_path_search(), resolve_command()

### Community 53 - "init_db.py"
Cohesion: 0.25
Nodes (5): create_tables(), drop_tables(), check_database_connection(), initialize_database(), main()

### Community 54 - "remover_duplicatas_progress"
Cohesion: 0.22
Nodes (4): _main(), remover_duplicatas_progress(), _stmt_remover_duplicatas(), lifespan()

### Community 55 - "eslint.config.js"
Cohesion: 0.33
Nodes (4): { defineConfig }, expoConfig, eslint-config-expo@~10.0.0, eslint-config-expo

### Community 56 - "Manhwa Tracker — Frontend"
Cohesion: 0.50
Nodes (4): Estrutura, Funcionalidades, Manhwa Tracker — Frontend, Setup

### Community 61 - "Manhwa Tracker — Mobile"
Cohesion: 0.20
Nodes (8): Expo HAS CHANGED, ⚠️ Versão do app + OTA (LER antes de bumpar versão), Estrutura, Funcionalidades, Manhwa Tracker — Mobile, Rodando em dev, Rotas, Setup

### Community 62 - "Manhwa"
Cohesion: 0.14
Nodes (9): carregar_amostra(), run(), snapshot(), Manhwa, cenarios(), check(), forcar_updated_at(), forcar_updated_at_scroll() (+1 more)

### Community 65 - "Backend Python requirements"
Cohesion: 0.24
Nodes (11): Schema do Banco (tabela manhwas), PostgreSQL, Manhwa Tracker Backend (setup e endpoints), Telethon (cliente Telegram), Backend Python requirements, asyncpg==0.29.0, pydantic==2.5.3, sqlalchemy==2.0.36 (+3 more)

### Community 70 - "main"
Cohesion: 0.25
Nodes (3): LegacyScraper, main(), medir()

### Community 77 - "test_review_all_partial.py"
Cohesion: 0.17
Nodes (10): BareScraper, check(), FakeMessage, instalar_scraper_falso(), ler_banco(), main_async(), preparar_banco(), testar_falha_de_persistencia() (+2 more)

### Community 78 - "📚 Manhwa Tracker"
Cohesion: 0.16
Nodes (13): Backend (FastAPI / Python), Frontend (Next.js / React Web), Manhwa Tracker Architecture Overview, fastapi==0.109.0, API Endpoints (resumido), API (resumo), Autor, Estrutura do Projeto (+5 more)

### Community 79 - "AsyncSession"
Cohesion: 0.10
Nodes (14): _buscar_progress(), delete_manhwa(), download_cbz_file(), get_cbz_info(), get_cbz_page(), get_manhwa(), get_scroll(), _manhwa_download_dir() (+6 more)

### Community 80 - "Arquitetura do app mobile (leitura offline)"
Cohesion: 0.19
Nodes (6): Mobile (Expo / React Native), Arquitetura do app mobile (leitura offline), Expo SDK 54 (mobile), mobile/CLAUDE.md (aponta para AGENTS.md), Welcome to your Expo app (README starter), Leitor .cbz integrado (web e mobile)

### Community 83 - "log_error"
Cohesion: 0.11
Nodes (7): get_db(), is_connection_closed_error(), is_transient_db_error(), _safe_close(), log_error(), unhandled_exception_handler(), verify_token()

### Community 85 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, eslint@^9.0.0, @expo/ngrok@^4.1.0, @types/react@~19.1.10, typescript@~5.9.2, eslint, @types/react, typescript (+1 more)

### Community 87 - "mobile/package.json"
Cohesion: 0.15
Nodes (12): expo-build-properties@~1.0.10, expo-font@~14.0.11, expo-glass-effect@~0.1.10, react-native-reanimated@~4.1.1, main, name, private, version (+4 more)

## Knowledge Gaps
- **10 isolated node(s):** `next/core-web-vitals`, `expo/tsconfig.base`, `.claude/CLAUDE.md graphify skill pointer`, `graphify (instruções do projeto)`, `pydantic==2.5.3` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 438 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `lucide-react` connect `ref_react` to `Frontend Dependencies`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `Manhwa` (e.g. with `carregar_amostra()` and `run()`) actually correct?**
  _`Manhwa` has 21 INFERRED edges - model-reasoned connections that need verification._
- **What connects `next/core-web-vitals`, `expo/tsconfig.base`, `.claude/CLAUDE.md graphify skill pointer` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.py` be split into smaller, more focused modules?**
  _Cohesion score 0.06565656565656566 - nodes in this community are weakly interconnected._
- **Why does `FakeClient` connect `FakeClient` to `test_review_all_partial.py`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `handle_dev()` (e.g. with `TrelloClient` and `.comment_card()`) actually correct?**
  _`handle_dev()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `background-download.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1021021021021021 - nodes in this community are weakly interconnected._