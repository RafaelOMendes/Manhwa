# Graph Report - Manhwa  (2026-11-09)

## Corpus Check
- 89 files · ~87,909 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 4, .gz 3, .bat 3)

## Summary
- 1149 nodes · 2336 edges · 85 communities (50 shown, 35 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 84 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `da8b0052`
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
- state.py
- Mobile Package Scripts
- expo-constants@~18.0.13
- src/components/CbzReader.tsx
- test_db_resilience.py
- _run_once
- src/components/ManhwaCard.tsx
- Mobile TS Config
- downloads.tsx
- expo-build-properties@~1.0.10
- reset-project.js
- _extract_objective
- test_chapter_progress_dedup.py
- Graphify Project Pointers
- Instruções para Agentes 🤖
- Frontend ESLint Config
- Next.js Config
- Frontend Tailwind Config
- _layout.tsx
- withNotifeeForegroundServiceType.js
- is_connection_closed_error
- expo-navigation-bar
- sync-queue.ts
- test_auto_mark_read.py
- test_usage_guard.py
- init_db.py
- expo-device@~8.0.10
- backend/README.md
- watcher.py
- FakeClient
- git_ops.py
- Manhwa
- TrelloClient
- 3. Mobile (Expo / React Native)
- update_current_chapter
- Arquitetura do app (mobile)
- 🤖 Automação Trello ↔ Claude Code
- FakeFilenameAttr
- claude_runner.py
- expo-glass-effect@~0.1.10
- expo-web-browser@~15.0.11
- eslint.config.js
- Manhwa Tracker — Frontend
- expo-status-bar
- nativewind@^2.0.11
- @react-navigation/bottom-tabs@^7.4.0
- react-native-gesture-handler@~2.28.0
- Manhwa Tracker — Mobile
- test_timestamp_sync.py
- react-native-svg@15.12.1
- tailwindcss@^3.3.2
- Backend Python requirements
- @react-navigation/native@^7.1.8
- expo-splash-screen@~31.0.13
- react-native-reanimated@~4.1.1
- expo-updates@~29.0.17
- react-native-safe-area-context
- CLAUDE.md
- .claude/CLAUDE.md
- react-native-web@~0.21.0
- react-native-worklets@0.5.1
- test_review_all_partial.py
- 📚 Manhwa Tracker
- AsyncSession
- Arquitetura do app mobile (leitura offline)
- review_all_manhwas
- devDependencies
- mobile/package.json
- TelegramManhwaScraper

## God Nodes (most connected - your core abstractions)
1. `Manhwa` - 37 edges
2. `handle_dev()` - 24 edges
3. `CbzReader()` - 23 edges
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

## Communities (85 total, 35 thin omitted)

### Community 0 - "ref_react"
Cohesion: 0.11
Nodes (28): Home(), AddManhwaModal(), AddManhwaModalProps, CbzReader(), CbzReaderProps, ChapterFile, extractChapterNumber(), CbzFile (+20 more)

### Community 1 - "main.py"
Cohesion: 0.08
Nodes (18): create_manhwa(), download_all_manhwas(), _env_int(), _extract_chapter_number(), get_telegram_scraper(), import_from_telegram(), _list_cbz_files_async(), Manhwa (+10 more)

### Community 2 - "background-download.ts"
Cohesion: 0.10
Nodes (33): aggregate(), AndroidForegroundServiceType, AndroidImportance, clearNotifTimer(), currentQueue, drainQueue(), ensureChannel(), EventType (+25 more)

### Community 3 - "Expo App Config (app.json)"
Cohesion: 0.05
Nodes (37): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, permissions, predictiveBackGestureEnabled (+29 more)

### Community 4 - "dependencies"
Cohesion: 0.11
Nodes (18): dependencies, expo-font@~14.0.11, expo-symbols@~1.0.8, expo-system-ui@~6.0.9, jszip@^3.10.1, react@19.1.0, react-native@0.81.5, @react-native-async-storage/async-storage@2.2.0 (+10 more)

### Community 5 - "Project Architecture Docs"
Cohesion: 0.09
Nodes (23): 1.1.10, 1.1.11, 1.1.12, 1.2.0, 1.2.1, 1.2.2, 1.2.3, 1.2.4 (+15 more)

### Community 6 - "cache.ts"
Cohesion: 0.11
Nodes (36): addReads(), applyReadReconcile(), CachedEntry, CacheIndex, CbzFileSnapshot, chapterDir(), chapterNumberFor(), commitDownloadedChapter() (+28 more)

### Community 7 - "Frontend Dependencies"
Cohesion: 0.06
Nodes (39): inter, metadata, dependencies, axios@^1.6.2, lucide-react@^0.294.0, next@14.0.4, react@^18.2.0, react-dom@^18.2.0 (+31 more)

### Community 8 - "Frontend TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 9 - "index.tsx"
Cohesion: 0.14
Nodes (19): lucide-react-native@^1.16.0, Checkbox, FilterId, FILTERS, Home(), styles, AddManhwaModal(), AddManhwaModalProps (+11 more)

### Community 10 - "state.py"
Cohesion: 0.24
Nodes (10): _default_state(), get_card(), load(), load_usage(), _read_json(), save(), save_usage(), set_card() (+2 more)

### Community 11 - "Mobile Package Scripts"
Cohesion: 0.29
Nodes (7): scripts, android, ios, lint, reset-project, start, web

### Community 13 - "src/components/CbzReader.tsx"
Cohesion: 0.05
Nodes (54): expo-file-system@~19.0.22, cancelScrollToken(), CbzReader(), CbzReaderProps, ChapterFile, extractChapterNumber(), jsHeapSuffix(), newScrollToken() (+46 more)

### Community 14 - "test_db_resilience.py"
Cohesion: 0.21
Nodes (4): check(), FakeDialect, main(), tenta()

### Community 15 - "_run_once"
Cohesion: 0.12
Nodes (10): _as_text(), ClaudeRunResult, _log(), _parse_stream_json(), _run_once(), _heartbeat(), session_not_found(), ClaudeRunnerIntegrationTests (+2 more)

### Community 16 - "src/components/ManhwaCard.tsx"
Cohesion: 0.20
Nodes (15): expo-image@~3.0.11, RowInfo, CbzFile, ManhwaCard(), ManhwaCardProps, dropFromJsonMap(), forgetManhwaLocal(), getLocalCoverUri() (+7 more)

### Community 17 - "Mobile TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, strict, extends, include, @/assets/*, expo/tsconfig.base

### Community 18 - "downloads.tsx"
Cohesion: 0.23
Nodes (14): buildRow(), Downloads(), formatBytes(), poolMap(), resolveCoverUri(), Unit, cleanupCorrupted(), dirSizeBytes() (+6 more)

### Community 20 - "reset-project.js"
Cohesion: 0.17
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 22 - "test_chapter_progress_dedup.py"
Cohesion: 0.10
Nodes (11): _main(), remover_duplicatas_progress(), _stmt_remover_duplicatas(), log_error(), lifespan(), check(), estado(), linha() (+3 more)

### Community 24 - "Instruções para Agentes 🤖"
Cohesion: 0.29
Nodes (6): Como editar este arquivo corretamente, 🔍 Como se Orientar (Instruções para Agentes), Exemplo de fluxo, Instruções para Agentes 🤖, 📝 Manutenção deste Arquivo (Obrigatório para Agentes), 🎯 Próximos Passos (Para a IA)

### Community 28 - "_layout.tsx"
Cohesion: 0.24
Nodes (12): expo-router@~6.0.23, RootLayout(), setupDownloadNotificationPress(), cleanupExpired(), cleanupOrphanedStorage(), deleteMeasured(), enforceImageDiskCacheLimit(), loadIndexStrict() (+4 more)

### Community 30 - "is_connection_closed_error"
Cohesion: 0.18
Nodes (4): is_connection_closed_error(), is_transient_db_error(), unhandled_exception_handler(), verify_token()

### Community 34 - "sync-queue.ts"
Cohesion: 0.17
Nodes (18): adoptServerCurrentChapter(), clearLocalScrollFor(), getLocalScrollEntry(), loadScrollMap(), saveLocalScroll(), saveScrollMap(), ChapterReadOp, drainQueue() (+10 more)

### Community 36 - "test_auto_mark_read.py"
Cohesion: 0.16
Nodes (9): list_manhwa_files(), _preencher_lidos(), ChapterProgress, check(), criar_cbz(), lidos(), patch_chapter(), registros() (+1 more)

### Community 37 - "test_usage_guard.py"
Cohesion: 0.07
Nodes (16): apply(), ApplyCallAndThresholdTests, ExtractFiveHourWindowTests, FakeClock, GuardFlowTestCase, ParseThresholdTests, PauseResumeTests, rate_limit_info() (+8 more)

### Community 38 - "init_db.py"
Cohesion: 0.25
Nodes (5): create_tables(), drop_tables(), check_database_connection(), initialize_database(), main()

### Community 41 - "backend/README.md"
Cohesion: 0.29
Nodes (7): Detalhes técnicos, Endpoints, Estrutura do Projeto, Instalação Rápida, Manhwa Tracker — Backend, Telegram, Troubleshooting

### Community 42 - "watcher.py"
Cohesion: 0.10
Nodes (13): network_reason(), redact(), send_telegram_message(), resolve_list_ids(), TrelloNetworkError, describe_config(), _describe_network_error(), handle_done() (+5 more)

### Community 44 - "git_ops.py"
Cohesion: 0.15
Nodes (20): automation_version(), branch_exists(), branch_name_for_card(), changed_areas(), changed_areas_since(), commit_all_if_dirty(), current_branch(), current_commit() (+12 more)

### Community 45 - "Manhwa"
Cohesion: 0.13
Nodes (5): carregar_amostra(), _connect_with_retry(), run(), snapshot(), Manhwa

### Community 46 - "TrelloClient"
Cohesion: 0.17
Nodes (3): _build_session(), TrelloClient, handle_doing()

### Community 47 - "3. Mobile (Expo / React Native)"
Cohesion: 0.18
Nodes (11): 1. Backend (FastAPI / Python), 2. Frontend (Next.js / React Web), 3. Mobile (Expo / React Native), 4. Automação Trello ↔ Claude Code, 🕒 Comparação de timestamps na sincronização (app offline ↔ banco), ⚙️ Configurações Importantes, 📶 Detecção de conectividade / modo offline, 📁 Estrutura Interna (`/mobile`) (+3 more)

### Community 48 - "update_current_chapter"
Cohesion: 0.16
Nodes (8): _cliente_esta_velho(), get_manhwas(), _ordem(), _iso_utc(), _parse_client_ts(), _to_utc(), update_current_chapter(), update_scroll()

### Community 49 - "Arquitetura do app (mobile)"
Cohesion: 0.20
Nodes (10): Arquitetura do app (mobile), Cache local / leitura (`src/lib/cache.ts`), 🚨 Contrato do foreground service (`registerForegroundService`) — LER antes de mexer, Download (`src/lib/download-manager.ts` + `background-download.ts`), Entregar via `eas update` (autorizado pro Claude), Fila offline (`src/lib/sync-queue.ts`), Leitor (`src/components/CbzReader.tsx` + `src/lib/reader-store.ts` + `ReaderHost.tsx`), Nativo / build (+2 more)

### Community 50 - "🤖 Automação Trello ↔ Claude Code"
Cohesion: 0.18
Nodes (10): 0. Antes de começar — checklist rápido no seu terminal, 1. Ajustar as listas do Trello, 2. Credenciais do Trello, 3. Bot do Telegram (avisos), 4. Configurar o `.env`, 5. Rodar, 6. Uso no dia a dia, 7. Limitações conhecidas (v1) (+2 more)

### Community 52 - "claude_runner.py"
Cohesion: 0.09
Nodes (12): build_prompt(), _choose_model_and_effort(), _parse_choice(), PromptDraft, _looks_like_usage_limit(), _parse_usage_limit_reset(), run_claude_code(), get_logger() (+4 more)

### Community 55 - "eslint.config.js"
Cohesion: 0.33
Nodes (4): { defineConfig }, expoConfig, eslint-config-expo@~10.0.0, eslint-config-expo

### Community 56 - "Manhwa Tracker — Frontend"
Cohesion: 0.50
Nodes (4): Estrutura, Funcionalidades, Manhwa Tracker — Frontend, Setup

### Community 61 - "Manhwa Tracker — Mobile"
Cohesion: 0.20
Nodes (8): Expo HAS CHANGED, ⚠️ Versão do app + OTA (LER antes de bumpar versão), Estrutura, Funcionalidades, Manhwa Tracker — Mobile, Rodando em dev, Rotas, Setup

### Community 62 - "test_timestamp_sync.py"
Cohesion: 0.26
Nodes (9): cenarios(), check(), forcar_updated_at(), forcar_updated_at_scroll(), get_scroll(), ler_manhwa(), patch_chapter(), put_scroll() (+1 more)

### Community 65 - "Backend Python requirements"
Cohesion: 0.24
Nodes (11): Schema do Banco (tabela manhwas), PostgreSQL, Manhwa Tracker Backend (setup e endpoints), Telethon (cliente Telegram), Backend Python requirements, asyncpg==0.29.0, pydantic==2.5.3, sqlalchemy==2.0.36 (+3 more)

### Community 77 - "test_review_all_partial.py"
Cohesion: 0.16
Nodes (10): check(), FakeMessage, FakeScraper, instalar_scraper_falso(), ler_banco(), main_async(), preparar_banco(), testar_falha_de_persistencia() (+2 more)

### Community 78 - "📚 Manhwa Tracker"
Cohesion: 0.16
Nodes (13): Backend (FastAPI / Python), Frontend (Next.js / React Web), Manhwa Tracker Architecture Overview, fastapi==0.109.0, API Endpoints (resumido), API (resumo), Autor, Estrutura do Projeto (+5 more)

### Community 79 - "AsyncSession"
Cohesion: 0.10
Nodes (13): _buscar_progress(), delete_manhwa(), download_cbz_file(), get_cbz_info(), get_cbz_page(), get_manhwa(), get_scroll(), _manhwa_download_dir() (+5 more)

### Community 80 - "Arquitetura do app mobile (leitura offline)"
Cohesion: 0.19
Nodes (6): Mobile (Expo / React Native), Arquitetura do app mobile (leitura offline), Expo SDK 54 (mobile), mobile/CLAUDE.md (aponta para AGENTS.md), Welcome to your Expo app (README starter), Leitor .cbz integrado (web e mobile)

### Community 83 - "review_all_manhwas"
Cohesion: 0.20
Nodes (6): get_db(), _safe_close(), safe_rollback(), review_all_manhwas(), read_stats_with_retry(), review_one_manhwa()

### Community 85 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, eslint@^9.0.0, @expo/ngrok@^4.1.0, @types/react@~19.1.10, typescript@~5.9.2, eslint, @types/react, typescript (+1 more)

### Community 87 - "mobile/package.json"
Cohesion: 0.15
Nodes (12): expo@~54.0.0, expo-linking@~8.0.12, @notifee/react-native@^9.1.8, react-dom@19.1.0, react-dom, main, name, private (+4 more)

### Community 88 - "TelegramManhwaScraper"
Cohesion: 0.07
Nodes (6): LegacyScraper, main(), medir(), classify_telegram_error(), TelegramManhwaScraper, BareScraper

## Knowledge Gaps
- **10 isolated node(s):** `next/core-web-vitals`, `expo/tsconfig.base`, `.claude/CLAUDE.md graphify skill pointer`, `graphify (instruções do projeto)`, `pydantic==2.5.3` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 447 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `lucide-react` connect `ref_react` to `Frontend Dependencies`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `Manhwa` (e.g. with `carregar_amostra()` and `run()`) actually correct?**
  _`Manhwa` has 21 INFERRED edges - model-reasoned connections that need verification._
- **What connects `next/core-web-vitals`, `expo/tsconfig.base`, `.claude/CLAUDE.md graphify skill pointer` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ref_react` be split into smaller, more focused modules?**
  _Cohesion score 0.11470985155195682 - nodes in this community are weakly interconnected._
- **Why does `react-native` connect `src/components/CbzReader.tsx` to `ref_react`, `background-download.ts`, `dependencies`, `index.tsx`, `src/components/ManhwaCard.tsx`, `downloads.tsx`, `mobile/package.json`, `_layout.tsx`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `handle_dev()` (e.g. with `TrelloClient` and `.comment_card()`) actually correct?**
  _`handle_dev()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `main.py` be split into smaller, more focused modules?**
  _Cohesion score 0.07681365576102418 - nodes in this community are weakly interconnected._