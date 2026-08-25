# Graph Report - Manhwa  (2026-08-25)

## Corpus Check
- 83 files · ~72,713 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 816 nodes · 1114 edges · 78 communities (58 shown, 20 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 90 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9e125e69`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Mobile App Screens & Cache|Mobile App Screens & Cache]]
- [[_COMMUNITY_Backend API & Models|Backend API & Models]]
- [[_COMMUNITY_Graphify Extraction Pipeline|Graphify Extraction Pipeline]]
- [[_COMMUNITY_Expo App Config (app.json)|Expo App Config (app.json)]]
- [[_COMMUNITY_Mobile Dependencies|Mobile Dependencies]]
- [[_COMMUNITY_Project Architecture Docs|Project Architecture Docs]]
- [[_COMMUNITY_Background Download & Notifications|Background Download & Notifications]]
- [[_COMMUNITY_Frontend Dependencies|Frontend Dependencies]]
- [[_COMMUNITY_Frontend TS Config|Frontend TS Config]]
- [[_COMMUNITY_Mobile CBZ Reader & Sync Queue|Mobile CBZ Reader & Sync Queue]]
- [[_COMMUNITY_Frontend Web UI|Frontend Web UI]]
- [[_COMMUNITY_Mobile Package Scripts|Mobile Package Scripts]]
- [[_COMMUNITY_Graphify Query & Export|Graphify Query & Export]]
- [[_COMMUNITY_Mobile Reader Store|Mobile Reader Store]]
- [[_COMMUNITY_Backend Database Setup|Backend Database Setup]]
- [[_COMMUNITY_Mobile Theming & Hooks|Mobile Theming & Hooks]]
- [[_COMMUNITY_Project Reset Script|Project Reset Script]]
- [[_COMMUNITY_Mobile TS Config|Mobile TS Config]]
- [[_COMMUNITY_Frontend Root Layout|Frontend Root Layout]]
- [[_COMMUNITY_Frontend Manhwa Types|Frontend Manhwa Types]]
- [[_COMMUNITY_Mobile Add Manhwa Modal|Mobile Add Manhwa Modal]]
- [[_COMMUNITY_Mobile Manhwa Types|Mobile Manhwa Types]]
- [[_COMMUNITY_Graphify Project Pointers|Graphify Project Pointers]]
- [[_COMMUNITY_Graph DB Exports|Graph DB Exports]]
- [[_COMMUNITY_Frontend ESLint Config|Frontend ESLint Config]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_Frontend Tailwind Config|Frontend Tailwind Config]]
- [[_COMMUNITY_Notifee Android Plugin|Notifee Android Plugin]]
- [[_COMMUNITY_Expo Router Types|Expo Router Types]]
- [[_COMMUNITY_GraphML Export|GraphML Export]]
- [[_COMMUNITY_SVG Export|SVG Export]]
- [[_COMMUNITY_PowerShell Scroll Bug Note|PowerShell Scroll Bug Note]]
- [[_COMMUNITY_Expo Folder Readme|Expo Folder Readme]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 77|Community 77]]

## God Nodes (most connected - your core abstractions)
1. `TelegramManhwaScraper` - 21 edges
2. `AsyncSession` - 18 edges
3. `Manhwa` - 17 edges
4. `expo` - 17 edges
5. `ChapterProgress` - 16 edges
6. `compilerOptions` - 16 edges
7. `📚 Manhwa Tracker` - 15 edges
8. `TrelloClient` - 14 edges
9. `_run()` - 12 edges
10. `loadIndex()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `📚 Manhwa Tracker` --semantically_similar_to--> `Sincronização manual de tipagens (backend/frontend/mobile)`  [INFERRED] [semantically similar]
  README.md → AGENT_INSTRUCTIONS.md
- `Modo Tela Cheia (Imersivo) no Leitor CBZ` --semantically_similar_to--> `Leitor (CbzReader + reader-store + ReaderHost)`  [INFERRED] [semantically similar]
  AGENT_INSTRUCTIONS.md → mobile/AGENTS.md
- `Leitor .cbz integrado (web e mobile)` --semantically_similar_to--> `Leitor (CbzReader + reader-store + ReaderHost)`  [INFERRED] [semantically similar]
  README.md → mobile/AGENTS.md
- `Persistência de progresso de leitura (scroll por capítulo)` --semantically_similar_to--> `Leitor (CbzReader + reader-store + ReaderHost)`  [INFERRED] [semantically similar]
  AGENT_INSTRUCTIONS.md → mobile/AGENTS.md
- `Mobile (Expo / React Native)` --conceptually_related_to--> `Arquitetura do app mobile (leitura offline)`  [INFERRED]
  AGENT_INSTRUCTIONS.md → mobile/AGENTS.md

## Import Cycles
- 1-file cycle: `backend/main.py -> backend/main.py`

## Hyperedges (group relationships)
- **Manhwa Tracker three-part architecture (backend, frontend, mobile)** — agent_instructions_backend, agent_instructions_frontend, agent_instructions_mobile [EXTRACTED 1.00]
- **Mobile offline reading pipeline (download, cache, reader, sync-queue)** — mobile_agents_download, mobile_agents_cache, mobile_agents_reader, mobile_agents_sync_queue [INFERRED 0.85]
- **EAS OTA delivery flow (versioning, native build, changelog)** — mobile_agents_versioning_ota, mobile_agents_native_build, mobile_agents_eas_update_delivery, mobile_changelog [INFERRED 0.85]
- **graphify Build Pipeline (detect to report)** — graphify_skill_detect_step, graphify_skill_ast_extraction, graphify_skill_semantic_extraction, graphify_skill_clustering, graphify_skill_community_labeling, graphify_skill_html_viz [EXTRACTED 0.95]
- **Graph Database / Format Exports** — exports_neo4j_export, exports_falkordb_export, exports_graphml_export, exports_svg_export, exports_mcp_server [INFERRED 0.85]
- **Graph Query/Navigation Flows** — query_query_flow, query_path_flow, query_explain_flow, query_networkx_fallback, query_save_result [EXTRACTED 0.85]

## Communities (78 total, 20 thin omitted)

### Community 0 - "Mobile App Screens & Cache"
Cohesion: 0.11
Nodes (24): CachedEntry, CacheIndex, CbzFileSnapshot, chapterDir(), chapterNumberFor(), clearLocalScrollFor(), dirSizeBytes(), downloadChapter() (+16 more)

### Community 1 - "Backend API & Models"
Cohesion: 0.05
Nodes (64): AsyncSession, create_manhwa(), delete_manhwa(), download_all_manhwas(), download_cbz_file(), get_cbz_info(), get_cbz_page(), get_manhwa() (+56 more)

### Community 2 - "Graphify Extraction Pipeline"
Cohesion: 0.33
Nodes (7): Calls Edge Direction Rule, DEEP_MODE Extraction, Hyperedges, Semantic Similarity Edges, Extraction Subagent Prompt, Image Vision Extraction Rules, Parallel Subagent Dispatch

### Community 3 - "Expo App Config (app.json)"
Cohesion: 0.05
Nodes (37): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, permissions, predictiveBackGestureEnabled (+29 more)

### Community 4 - "Mobile Dependencies"
Cohesion: 0.05
Nodes (37): dependencies, expo, expo-build-properties, expo-constants, expo-device, expo-file-system, expo-font, expo-glass-effect (+29 more)

### Community 5 - "Project Architecture Docs"
Cohesion: 0.24
Nodes (11): Schema do Banco (tabela manhwas), PostgreSQL, Manhwa Tracker Backend (setup e endpoints), Telethon (cliente Telegram), Backend Python requirements, asyncpg==0.29.0, pydantic==2.5.3, sqlalchemy==2.0.36 (+3 more)

### Community 6 - "Background Download & Notifications"
Cohesion: 0.10
Nodes (29): aggregate(), AndroidForegroundServiceType, AndroidImportance, currentQueue, drainQueue(), ensureChannel(), EventType, inFlight (+21 more)

### Community 7 - "Frontend Dependencies"
Cohesion: 0.08
Nodes (24): dependencies, axios, lucide-react, next, react, react-dom, devDependencies, autoprefixer (+16 more)

### Community 8 - "Frontend TS Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 9 - "Mobile CBZ Reader & Sync Queue"
Cohesion: 0.15
Nodes (17): ReaderPage, ReaderPageProps, styles, { width: SCREEN_WIDTH }, ChapterReadOp, DrainResult, enqueueChapterRead(), enqueueScroll() (+9 more)

### Community 10 - "Frontend Web UI"
Cohesion: 0.13
Nodes (9): AddManhwaModalProps, CbzReader(), CbzReaderProps, ChapterFile, extractChapterNumber(), CbzFile, ManhwaCardProps, authHeaders() (+1 more)

### Community 11 - "Mobile Package Scripts"
Cohesion: 0.12
Nodes (15): devDependencies, @expo/ngrok, @types/react, typescript, main, name, private, scripts (+7 more)

### Community 12 - "Graphify Query & Export"
Cohesion: 0.24
Nodes (12): MCP stdio Server, graph.json, Fast Path - Existing Graph Query, Native CLAUDE.md Integration, BFS Traversal Mode, DFS Traversal Mode, /graphify explain (Node Explanation), NetworkX Inline Traversal Fallback (+4 more)

### Community 13 - "Mobile Reader Store"
Cohesion: 0.22
Nodes (10): ReaderHost(), closeReader(), emit(), listeners, navigateReader(), openReader(), ReaderFile, ReaderRequest (+2 more)

### Community 14 - "Backend Database Setup"
Cohesion: 0.14
Nodes (18): create_tables(), drop_tables(), get_db(), is_connection_closed_error(), Cria todas as tabelas no banco de dados, Remove todas as tabelas do banco de dados, Detecta o caso 'conexao morreu enquanto estava ociosa'.      Acontece em reque, Rollback que nao explode se a conexao ja estiver morta.      Publico de propos (+10 more)

### Community 15 - "Mobile Theming & Hooks"
Cohesion: 0.22
Nodes (6): Colors, Fonts, Spacing, ThemeColor, useColorScheme(), useTheme()

### Community 16 - "Project Reset Script"
Cohesion: 0.22
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 17 - "Mobile TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, strict, extends, include, @/*, @/assets/*

### Community 41 - "Community 41"
Cohesion: 0.05
Nodes (40): 1️⃣ Instalar PostgreSQL, 2️⃣ Criar o Banco de Dados, 3️⃣ Configurar o Projeto, 4️⃣ Inicializar o Banco de Dados, 5️⃣ Iniciar a Aplicação, 6️⃣ Testar, API não está aceitando conexões, Backup e Restore (+32 more)

### Community 42 - "Community 42"
Cohesion: 0.08
Nodes (37): build_prompt(), _parse_draft(), PromptDraft, Path, Usa o próprio Claude Code CLI (headless, -p) para transformar um card do Trello, Extrai MODELO/EFFORT/prompt da resposta do modelo leve. Se o formato não bater, ClaudeRunResult, _log() (+29 more)

### Community 43 - "Community 43"
Cohesion: 0.07
Nodes (27): Confidence Score Rubric, Audit Trail (EXTRACTED/INFERRED/AMBIGUOUS), For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules (+19 more)

### Community 44 - "Community 44"
Cohesion: 0.23
Nodes (20): branch_exists(), branch_name_for_card(), changed_areas(), commit_all_if_dirty(), current_branch(), delete_branch(), GitError, GitResult (+12 more)

### Community 45 - "Community 45"
Cohesion: 0.17
Nodes (16): buildRow(), Downloads(), RowInfo, Unit, getLocalChaptersSet(), getLocalCoverUri(), getReadChaptersSet(), loadManhwaFiles() (+8 more)

### Community 46 - "Community 46"
Cohesion: 0.15
Nodes (11): _build_session(), Any, Cliente fino para a API REST do Trello (https://developer.atlassian.com/cloud/tr, Recebe algo como {"TODO": "A Fazer", "DOING": "Em Andamento", ...} (valores vind, O watcher.py fica horas fazendo polling - uma lentidão passageira da API do, Todas as listas (colunas) do board, na ordem em que aparecem., Todos os cards abertos do board, com o idList (coluna atual) de cada um., Ajuda a sinalizar erro/bloqueio visualmente no card (label vermelha 'bloqueado' (+3 more)

### Community 47 - "Community 47"
Cohesion: 0.12
Nodes (15): 1. Backend (FastAPI / Python), 2. Frontend (Next.js / React Web), 3. Mobile (Expo / React Native), 4. Automação Trello ↔ Claude Code, Como editar este arquivo corretamente, 🔍 Como se Orientar (Instruções para Agentes), ⚙️ Configurações Importantes, 📁 Estrutura Interna (`/mobile`) (+7 more)

### Community 48 - "Community 48"
Cohesion: 0.18
Nodes (14): applyReadReconcile(), cleanupCorrupted(), cleanupExpired(), deleteChapterDirAsync(), downloadCover(), getLocalChapter(), getManhwasWithLocalData(), loadIndex() (+6 more)

### Community 49 - "Community 49"
Cohesion: 0.17
Nodes (11): Arquitetura do app (mobile), Cache local / leitura (`src/lib/cache.ts`), Download (`src/lib/download-manager.ts` + `background-download.ts`), Entregar via `eas update` (autorizado pro Claude), Expo HAS CHANGED, Fila offline (`src/lib/sync-queue.ts`), Leitor (`src/components/CbzReader.tsx` + `src/lib/reader-store.ts` + `ReaderHost.tsx`), Nativo / build (+3 more)

### Community 50 - "Community 50"
Cohesion: 0.18
Nodes (10): 0. Antes de começar — checklist rápido no seu terminal, 1. Ajustar as listas do Trello, 2. Credenciais do Trello, 3. Bot do Telegram (avisos), 4. Configurar o `.env`, 5. Rodar, 6. Uso no dia a dia, 7. Limitações conhecidas (v1) (+2 more)

### Community 51 - "Community 51"
Cohesion: 0.20
Nodes (10): Clustering & Analysis (Step 4), Community Detection, Community Labeling (Step 5), Directed Graph Mode, God Nodes, GRAPH_REPORT.md, Interactive HTML Visualization, Obsidian Vault Export (+2 more)

### Community 52 - "Community 52"
Cohesion: 0.33
Nodes (6): Step 2 - Detect Files, Extraction Cache, Gemini Semantic Extraction Backend, Semantic Extraction (Part B), Video/Audio Transcription (transcribe_all), Whisper Initial Prompt Hint

### Community 53 - "Community 53"
Cohesion: 0.22
Nodes (6): Checkbox, FilterId, FILTERS, styles, getLastReadMap(), saveManhwaList()

### Community 54 - "Community 54"
Cohesion: 0.20
Nodes (10): Debounce Mechanism, /graphify add (URL Ingestion), graphify.ingest.ingest, --watch Folder Watcher, Token Reduction Benchmark, Wiki Export (--wiki), Cumulative Cost Tracker, graphify Python Interpreter Detection (+2 more)

### Community 55 - "Community 55"
Cohesion: 0.33
Nodes (9): Arquitetura do app mobile (leitura offline), Cache local / leitura cumulativa, Download (download-manager + background-download), Entrega via eas update (procedimento), Nativo / build (notifee, eas build vs update), Expo SDK 54 (mobile), Versionamento do app + OTA (APP_VERSION vs fingerprint), mobile/CLAUDE.md (aponta para AGENTS.md) (+1 more)

### Community 56 - "Community 56"
Cohesion: 0.22
Nodes (8): 1.1.10, 1.1.11, 1.1.12, 1.2.0, 1.2.1, 1.2.2, Changelog (mobile), Pré-cálculo de layout do leitor (1.2.0-1.2.2)

### Community 57 - "Community 57"
Cohesion: 0.22
Nodes (8): API Endpoints (resumido), 📝 API Endpoints (resumido), 👤 Autor, 📁 Estrutura do Projeto, 📋 Funcionalidades, 📄 Licença, 📚 Manhwa Tracker, 🔧 Próximas Melhorias

### Community 58 - "Community 58"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 59 - "Community 59"
Cohesion: 0.50
Nodes (7): _default_state(), get_card(), load(), Any, Persistência local do estado da automação Trello -> Claude Code -> Telegram., save(), set_card()

### Community 60 - "Community 60"
Cohesion: 0.33
Nodes (7): Node ID Format Rule, AST Structural Extraction (Part A), Post-Commit Auto-Rebuild Hook, Code-Only Change Detection (Skip LLM), Graph Diff, Incremental Update (--update), Prune Changed/Deleted Sources

### Community 61 - "Community 61"
Cohesion: 0.29
Nodes (6): Get a fresh project, Get started, Join the community, Learn more, Other setup steps, Welcome to your Expo app 👋

### Community 62 - "Community 62"
Cohesion: 0.47
Nodes (6): Modo Tela Cheia (Imersivo) no Leitor CBZ, Mobile (Expo / React Native), Persistência de progresso de leitura (scroll por capítulo), Leitor (CbzReader + reader-store + ReaderHost), Fila offline (sync-queue), Leitor .cbz integrado (web e mobile)

### Community 63 - "Community 63"
Cohesion: 0.50
Nodes (5): Backend (FastAPI / Python), Frontend (Next.js / React Web), Manhwa Tracker Architecture Overview, Sincronização manual de tipagens (backend/frontend/mobile), fastapi==0.109.0

### Community 64 - "Community 64"
Cohesion: 0.50
Nodes (4): Backend, Frontend (web), Mobile, 🚀 Tecnologias

### Community 65 - "Community 65"
Cohesion: 0.50
Nodes (4): Backend (FastAPI + PostgreSQL), Frontend (Next.js), 🛠️ Instalação e Execução, Mobile (Expo)

### Community 66 - "Community 66"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 67 - "Community 67"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 68 - "Community 68"
Cohesion: 0.50
Nodes (3): For /graphify explain, For /graphify path, graphify reference: query, path, explain

### Community 69 - "Community 69"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 77 - "Community 77"
Cohesion: 0.67
Nodes (3): GitHub Repo Clone (Step 0), Cross-Repo Merge, graphify merge-graphs

## Knowledge Gaps
- **345 isolated node(s):** `Path`, `Path`, `Path`, `Session`, `BaseException` (+340 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Extraction Subagent Prompt` connect `Graphify Extraction Pipeline` to `Community 43`, `Community 60`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `TelegramManhwaScraper` (e.g. with `AsyncSession` and `get_telegram_scraper()`) actually correct?**
  _`TelegramManhwaScraper` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `AsyncSession` (e.g. with `ChapterProgress` and `Manhwa`) actually correct?**
  _`AsyncSession` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `Manhwa` (e.g. with `AsyncSession` and `Manhwa`) actually correct?**
  _`Manhwa` has 12 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Path`, `Usa o próprio Claude Code CLI (headless, -p) para transformar um card do Trello`, `Extrai MODELO/EFFORT/prompt da resposta do modelo leve. Se o formato não bater` to the rest of the system?**
  _407 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Mobile App Screens & Cache` be split into smaller, more focused modules?**
  _Cohesion score 0.11384615384615385 - nodes in this community are weakly interconnected._
- **Should `Backend API & Models` be split into smaller, more focused modules?**
  _Cohesion score 0.05160628844839371 - nodes in this community are weakly interconnected._