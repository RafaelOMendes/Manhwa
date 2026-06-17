# Graph Report - .  (2026-06-17)

## Corpus Check
- 96 files · ~60,992 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 532 nodes · 743 edges · 41 communities (26 shown, 15 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 66 edges (avg confidence: 0.67)
- Token cost: 127,881 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `TelegramManhwaScraper` - 19 edges
2. `AsyncSession` - 17 edges
3. `expo` - 17 edges
4. `compilerOptions` - 16 edges
5. `Manhwa` - 15 edges
6. `ChapterProgress` - 14 edges
7. `loadIndex()` - 12 edges
8. `graphify Pipeline` - 12 edges
9. `Arquitetura do app mobile (leitura offline)` - 11 edges
10. `ManhwaCard()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Modo Tela Cheia (Imersivo) no Leitor CBZ` --semantically_similar_to--> `Leitor (CbzReader + reader-store + ReaderHost)`  [INFERRED] [semantically similar]
  AGENT_INSTRUCTIONS.md → mobile/AGENTS.md
- `Leitor .cbz integrado (web e mobile)` --semantically_similar_to--> `Leitor (CbzReader + reader-store + ReaderHost)`  [INFERRED] [semantically similar]
  README.md → mobile/AGENTS.md
- `Persistência de progresso de leitura (scroll por capítulo)` --semantically_similar_to--> `Leitor (CbzReader + reader-store + ReaderHost)`  [INFERRED] [semantically similar]
  AGENT_INSTRUCTIONS.md → mobile/AGENTS.md
- `Manhwa Tracker (projeto raiz)` --semantically_similar_to--> `Sincronização manual de tipagens (backend/frontend/mobile)`  [INFERRED] [semantically similar]
  README.md → AGENT_INSTRUCTIONS.md
- `fastapi==0.109.0` --conceptually_related_to--> `Backend (FastAPI / Python)`  [INFERRED]
  backend/requirements.txt → AGENT_INSTRUCTIONS.md

## Import Cycles
- 1-file cycle: `backend/main.py -> backend/main.py`

## Hyperedges (group relationships)
- **Manhwa Tracker three-part architecture (backend, frontend, mobile)** — agent_instructions_backend, agent_instructions_frontend, agent_instructions_mobile [EXTRACTED 1.00]
- **Mobile offline reading pipeline (download, cache, reader, sync-queue)** — mobile_agents_download, mobile_agents_cache, mobile_agents_reader, mobile_agents_sync_queue [INFERRED 0.85]
- **EAS OTA delivery flow (versioning, native build, changelog)** — mobile_agents_versioning_ota, mobile_agents_native_build, mobile_agents_eas_update_delivery, mobile_changelog [INFERRED 0.85]
- **graphify Build Pipeline (detect to report)** — graphify_skill_detect_step, graphify_skill_ast_extraction, graphify_skill_semantic_extraction, graphify_skill_clustering, graphify_skill_community_labeling, graphify_skill_html_viz [EXTRACTED 0.95]
- **Graph Database / Format Exports** — exports_neo4j_export, exports_falkordb_export, exports_graphml_export, exports_svg_export, exports_mcp_server [INFERRED 0.85]
- **Graph Query/Navigation Flows** — query_query_flow, query_path_flow, query_explain_flow, query_networkx_fallback, query_save_result [EXTRACTED 0.85]

## Communities (41 total, 15 thin omitted)

### Community 0 - "Mobile App Screens & Cache"
Cohesion: 0.06
Nodes (60): buildRow(), Downloads(), RowInfo, Unit, Checkbox, FilterId, FILTERS, styles (+52 more)

### Community 1 - "Backend API & Models"
Cohesion: 0.06
Nodes (55): AsyncSession, create_manhwa(), delete_manhwa(), download_all_manhwas(), download_cbz_file(), get_cbz_info(), get_cbz_page(), get_manhwa() (+47 more)

### Community 2 - "Graphify Extraction Pipeline"
Cohesion: 0.06
Nodes (43): Debounce Mechanism, /graphify add (URL Ingestion), graphify.ingest.ingest, --watch Folder Watcher, Token Reduction Benchmark, Wiki Export (--wiki), Calls Edge Direction Rule, Confidence Score Rubric (+35 more)

### Community 3 - "Expo App Config (app.json)"
Cohesion: 0.05
Nodes (37): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, package, permissions, predictiveBackGestureEnabled (+29 more)

### Community 4 - "Mobile Dependencies"
Cohesion: 0.05
Nodes (37): dependencies, expo, expo-build-properties, expo-constants, expo-device, expo-file-system, expo-font, expo-glass-effect (+29 more)

### Community 5 - "Project Architecture Docs"
Cohesion: 0.09
Nodes (35): Backend (FastAPI / Python), Frontend (Next.js / React Web), Modo Tela Cheia (Imersivo) no Leitor CBZ, Mobile (Expo / React Native), Manhwa Tracker Architecture Overview, Persistência de progresso de leitura (scroll por capítulo), Sincronização manual de tipagens (backend/frontend/mobile), Schema do Banco (tabela manhwas) (+27 more)

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
Cohesion: 0.18
Nodes (15): MCP stdio Server, GitHub Repo Clone (Step 0), Cross-Repo Merge, graphify merge-graphs, graph.json, Fast Path - Existing Graph Query, Native CLAUDE.md Integration, BFS Traversal Mode (+7 more)

### Community 13 - "Mobile Reader Store"
Cohesion: 0.22
Nodes (10): ReaderHost(), closeReader(), emit(), listeners, navigateReader(), openReader(), ReaderFile, ReaderRequest (+2 more)

### Community 14 - "Backend Database Setup"
Cohesion: 0.19
Nodes (11): create_tables(), drop_tables(), get_db(), Dependency que fornece uma sess�o do banco de dados, Cria todas as tabelas no banco de dados, Remove todas as tabelas do banco de dados, check_database_connection(), initialize_database() (+3 more)

### Community 15 - "Mobile Theming & Hooks"
Cohesion: 0.22
Nodes (6): Colors, Fonts, Spacing, ThemeColor, useColorScheme(), useTheme()

### Community 16 - "Project Reset Script"
Cohesion: 0.22
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 17 - "Mobile TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, strict, extends, include, @/*, @/assets/*

## Knowledge Gaps
- **216 isolated node(s):** `extends`, `inter`, `metadata`, `AddManhwaModalProps`, `ChapterFile` (+211 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Mobile Dependencies` to `Mobile Package Scripts`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `lifespan()` connect `Backend API & Models` to `Backend Database Setup`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `TelegramManhwaScraper` (e.g. with `AsyncSession` and `get_telegram_scraper()`) actually correct?**
  _`TelegramManhwaScraper` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `AsyncSession` (e.g. with `ChapterProgress` and `Manhwa`) actually correct?**
  _`AsyncSession` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Dependency que fornece uma sess�o do banco de dados`, `Cria todas as tabelas no banco de dados`, `Remove todas as tabelas do banco de dados` to the rest of the system?**
  _251 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Mobile App Screens & Cache` be split into smaller, more focused modules?**
  _Cohesion score 0.05995975855130785 - nodes in this community are weakly interconnected._
- **Should `Backend API & Models` be split into smaller, more focused modules?**
  _Cohesion score 0.05662862159789289 - nodes in this community are weakly interconnected._