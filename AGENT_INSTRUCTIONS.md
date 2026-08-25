# Instruções para Agentes 🤖

Bem-vindo ao repositório **Manhwa Tracker**! Este documento foi criado para ajudar futuros agentes de IA a entender rapidamente a arquitetura, as tecnologias e como o projeto está estruturado. **Sempre leia este documento e pesquise por outros arquivos `.md` antes de começar a fazer alterações significativas no código.**

## 📂 Visão Geral da Arquitetura

O projeto Manhwa Tracker é composto por três partes principais:

### 1. Backend (FastAPI / Python)
- **Diretório:** `/backend`
- **Descrição:** API FastAPI assíncrona para gerenciar a coleção de manhwas, com persistência em **PostgreSQL** via SQLAlchemy async.
- **Arquivos principais:**
  - `main.py`: Ponto de entrada da API, com as definições das rotas (CRUD, leitor CBZ, importação/sincronização Telegram).
  - `database.py`: Setup do engine assíncrono SQLAlchemy + `get_db()` dependency. Lê `DATABASE_URL` do `.env`.
  - `models.py`: Modelos SQLAlchemy (`Manhwa`, `ChapterProgress`). Os modelos Pydantic ficam dentro do `main.py`.
  - `telegram_scraper.py`: Integração com Telegram (Telethon) — scraping de tópicos e download paralelo de `.cbz`.
  - `init_db.py`: Script para criar/resetar as tabelas (`python init_db.py [--reset]`).
  - `add_col.py`: Migração ad-hoc (adiciona coluna `andamento`). Use só se atualizar um banco antigo.
  - `error_logger.py`: `log_error(exc, context="...")` grava erro + traceback em
    `backend/logs/<YYYY-MM-DD>/<timestamp>_error.log`, criando a pasta do dia automaticamente.
    `backend/logs/` não é versionado (`.gitignore`). Desligável via `ERROR_LOGGING_ENABLED=0` no
    ambiente. Chamado hoje no `@app.exception_handler(Exception)` global e nos dois blocos "ERRO
    CRÍTICO" (`/api/manhwas/download-all`, `/api/manhwas/review-all`) — ao adicionar um novo `except`
    para uma falha inesperada/crítica, chame `log_error()` junto do `print()` existente.
- **Transações no `get_db()` (`database.py`):** a dependency já faz `commit()` automático se o endpoint
  retornar sem exceção, e `rollback()` se uma exceção propagar. **Não dê `await db.commit()` manual
  dentro de um endpoint** — deixe o `get_db()` cuidar disso, senão fica fácil deixar o banco com commits
  parciais (ex.: um loop que atualiza vários registros e falha no meio). Se um endpoint precisa de
  atomicidade "tudo ou nada" sobre múltiplas operações (ex.: `/api/manhwas/download-all`, que processa
  vários manhwas e só deve persistir se TODOS derem certo), capture as falhas, descarte/reverta as
  alterações antes de retornar, e retorne normalmente (sem raise) com `success: False` no payload — o
  `get_db()` faz um commit vazio depois, o que é um no-op seguro. Veja também a regra de requests longos
  abaixo, que muda ONDE a escrita deve acontecer — e a de **partial success**, que define QUANDO
  reverter tudo ainda faz sentido (só em falha de escrita, não em falha de scraper).
- **❗ Requests longos: NÃO escreva na sessão do request depois de uma espera longa.** A sessão injetada
  por `Depends(get_db)` segura uma conexão asyncpg aberta durante todo o request. Em endpoints que passam
  minutos fora do banco (ex.: `/api/manhwas/download-all`, que baixa do Telegram), essa conexão fica
  ociosa e é derrubada pelo Postgres/rede — qualquer escrita depois disso falha com
  `InterfaceError: connection is closed`, **inclusive um commit feito imediatamente após o trabalho longo**
  (a conexão já está morta há minutos; adiantar ou atrasar o commit não muda nada). Padrão correto:
  1. Use a sessão do request só para as **leituras iniciais**.
  2. Durante o trabalho longo, acumule as alterações em **estrutura na memória** (ex.: `{id: {campo: valor}}`),
     sem `db.add()` / mutação de objetos ORM.
  3. No fim, persista tudo numa **sessão/conexão nova** (`async_session_maker()`), numa única transação —
     ver `_persist_sync_updates()` em `main.py`. Isso preserva a atomicidade "tudo ou nada" e roda numa
     conexão saudável. O helper ainda tenta uma segunda vez se a conexão nova nascer inutilizável.
  4. Persista **antes** de montar a resposta de sucesso, para que uma falha de escrita vire falha para o
     cliente — e não um "sucesso" seguido de um 500 solto.
  5. **Rollback explícito depois de persistir:** logo após `_persist_sync_updates()` (e também nos caminhos
     de falha, antes de retornar), chame `await safe_rollback(db)`. Tudo que importava já foi gravado na
     conexão nova e a sessão do request não tem nada em memória, então o rollback só serve para descartá-la
     e impedir que o `get_db()` tente commitar numa conexão que sabemos estar morta. `safe_rollback()`
     (em `database.py`) engole a exceção se a conexão já estiver inutilizável. Sem isso, dependemos do
     tratamento defensivo do `get_db()` e o log fica poluído com `InterfaceError` / `cannot call
     Transaction.commit()` depois que a resposta de sucesso já foi enviada. Endpoints que seguem o padrão:
     `/api/manhwas/download-all` e `/api/manhwas/review-all`.
  - `is_connection_closed_error()` (em `database.py`) centraliza a detecção desse tipo de erro.
- **Partial success: erro de SCRAPER não reverte escrita boa (`/api/manhwas/review-all`).** A política
  antiga era "tudo ou nada" sobre o lote inteiro: se qualquer manhwa falhasse, TODAS as alterações eram
  descartadas. Na prática isso doeu — numa revisão real, 15 tópicos falharam na leitura do Telegram e as
  **996 alterações corretas foram jogadas fora**. O porquê da mudança: uma falha de leitura no Telegram
  (link morto, tópico privado, timeout) não diz nada sobre a validade das outras 996 leituras, então
  reverter tudo perde trabalho certo sem proteger nada. Regra atual:
  1. **Atomicidade vale só para a PERSISTÊNCIA.** Se o commit falhar (constraint, permissão no banco,
     conexão morta), nada entra — resposta com `success: False`, `persisted: False` e HTTP 500.
     Falha do scraper **nunca** dispara rollback das outras alterações.
  2. **Diferencie os tipos de erro em vez de olhar só o resultado numérico.** `cbz_count = 0` sozinho é
     ambíguo. `_get_topic_stats()` (em `telegram_scraper.py`) devolve `error_type` + `error_message`:
     `None` (sucesso), `empty` (tópico lido, mas sem `.cbz`), `invalid_link`, `entity_not_found`,
     `private_topic`, `flood_wait`, `timeout`, `network`, `unknown`. Os conjuntos
     `DEFINITIVE_ERROR_TYPES` (não adianta repetir) e `TEMPORARY_ERROR_TYPES` (vale um retry) dizem ao
     caller o que fazer; `classify_telegram_error()` faz a tradução das exceções do Telethon.
  3. **Tópico vazio é sucesso, não erro** — e mesmo assim NÃO se grava `0` por cima de um valor válido;
     o resultado só marca "sem mudança".
  4. **Erro temporário ganha um retry** dentro do próprio endpoint antes de virar falha.
  5. **Toda entrada de `results` carrega `error_type` e `error_message`** (`None` quando deu certo), mais
     um `errors_by_type` agregado na resposta — o client precisa saber *por que* cada manhwa falhou para
     decidir entre corrigir o link e tentar de novo mais tarde.
  6. **`await safe_rollback(db)` só no fim do endpoint**, quando ele já vai retornar. Chamar no meio do
     partial success quebraria a sessão do request à toa (o que importava já foi gravado na conexão nova).
  - Testes: `backend/test_review_all_partial.py` (roda sem pytest e sem Telegram, num SQLite temporário —
    nunca no banco real) cobre a classificação de erros, o partial success com 5 manhwas (1 falhando de
    propósito, os outros 4 conferidos por `SELECT`) e a falha de escrita.
- **⚡ Performance do `review-all`: o gargalo é o NÚMERO de requisições, não a concorrência.**
  `REVIEW_PARALLELISM` (env, padrão **4**, limitado a 1–16) controla o `asyncio.Semaphore` das leituras de
  tópico. Medido em 2026-08-25 com 25 tópicos reais (`backend/bench_review_parallelism.py`, só leitura):

  | paralelismo | tempo de parede | soma dos tempos | flood waits |
  |---|---|---|---|
  | 1 | 65,7s | 65,7s | 0 |
  | 2 | 75,2s | 149,9s | 0 |
  | 4 | 62,4s | 244,4s | 0 |
  | 8 | 87,1s | 581,0s | 0 |

  **Subir o semáforo quase não mexe no tempo de parede.** A soma dos tempos cresce proporcional ao
  paralelismo (3,9x em N=4), ou seja: as requisições ficam na fila e cada uma demora N vezes mais. A conta
  é limitada a **~1 requisição/segundo**, independente de quantas você dispara — não houve flood wait em
  nenhum nível, o Telegram só enfileira. N=8 chegou a piorar. Ficamos em N=4 porque foi o melhor medido e
  não custa nada; não espere ganho grande dele.
  - **O que realmente acelerou** foi cortar requisição: `_get_topic_stats()` chamava `get_dialogs()`
    (a lista INTEIRA de conversas, ~0,3s) a cada tópico — ~1400 downloads da mesma lista por revisão.
    Agora `_resolve_entity()` resolve e cacheia o chat uma vez por processo, com cache negativo para
    chat morto. Ganho medido: 78,7s → 65,7s nos mesmos 25 tópicos (**~17%**), e menos risco de flood.
  - **Modelo de custo:** `tempo ≈ nº de requisições × ~0,9s`. Cada tópico custa `teto(capítulos/100)`
    páginas de `iter_messages` (medido: ~1,1s para ≤100 mensagens, ~2,2s para ~145). Uma revisão completa
    dos 1395 manhwas dá **~55–60 min** — e nenhum ajuste de semáforo muda isso.
  - **Próximo lever real (não implementado):** `get_messages(..., filter=InputMessagesFilterDocument,
    limit=0).total` devolve a contagem exata em **1** requisição (~0,18s) em vez de paginar o tópico todo.
    Dá para usar isso como detector de "mudou?" e só reler o tópico inteiro (para recalcular
    `medium_reaction`) quando a contagem mudar — estimado ~55min → ~20min em regime. Não foi feito porque
    **muda a semântica**: a média de reações deixaria de ser atualizada em tópicos sem capítulo novo.
    Decisão do dono do projeto, não do agente.
  - Em flood wait, o freio é **compartilhado** (`_wait_flood_gate` / `_open_flood_gate_in`): todas as
    leituras concorrentes recuam pelo tempo que o Telegram pediu, em vez de cada corrotina levar o seu.
    Por isso subir `REVIEW_PARALLELISM` degrada suave em vez de virar uma cascata de 429.
  - O log final imprime tempo, tópicos/s e o speedup **medido** (soma dos tempos ÷ tempo de parede), e a
    resposta traz o mesmo em `performance`. É medição, não estimativa fixa no código.
  - `limit=N` (query param) revisa só os N primeiros — serve para validar a rota sem esperar a revisão
    inteira. Depende do `ORDER BY id` explícito no `select()`: **sem ele o Postgres devolve ordem
    arbitrária**, que muda a cada UPDATE, e o subconjunto revisado variava entre execuções.
  - `backend/e2e_review_real.py [N]` faz o teste manual de ponta a ponta (Telegram + Neon reais):
    snapshot antes, roda o endpoint, `SELECT` depois e confere se o nº de linhas alteradas bate com o
    `total_updated` reportado. Escreve no banco real — é a função normal do endpoint.
  - `get_db()` engole o erro do commit final **apenas** quando a sessão não tem alterações pendentes
    (só houve leitura, ou o endpoint já persistiu por conta própria) — nesse caso não há nada a perder e
    deixar o erro subir viraria um 500 confuso. Se houver escrita pendente, o erro sobe normalmente.
- **Respostas HTTP consistentes (endpoints tipo "sync"):** qualquer endpoint que um client (frontend/mobile)
  lê como `{ success, message, ... }` deve retornar **sempre** esse shape — nunca deixar um caminho de
  erro cair no `{ detail: "..." }` padrão do FastAPI (`raise HTTPException`), pois o client não sabe ler
  esse formato. Padrão usado em `/api/manhwas/download-all`:
  - Um `response_model` Pydantic (`SyncResponse`) documenta e valida o shape único usado em todo caminho
    de retorno (sucesso, falha parcial revertida, falha crítica).
  - Erros esperados (ex.: `ImportError` do scraper) retornam `JSONResponse(status_code=..., content={...})`
    diretamente com o mesmo shape, em vez de `raise HTTPException` — retornar um `Response`/`JSONResponse`
    faz o FastAPI pular a validação do `response_model` e usar o status/body exatos que você montou.
  - Um `@app.exception_handler(Exception)` global (perto da criação do `app`, em `main.py`) captura
    qualquer exceção não tratada (inclusive uma que escape do commit automático do `get_db()` DEPOIS que
    o endpoint já retornou) e converte pra `{ success: False, message: ... }` — sem isso, o client recebe
    o texto puro "Internal Server Error" do Starlette, que quebra o `response.json()` e aparenta erro de
    conexão mesmo quando os dados já foram salvos com sucesso. Não interfere no tratamento de
    `HTTPException` dos demais endpoints (o FastAPI já registra um handler mais específico pra ela).
- **Variáveis de ambiente (`backend/.env`):**
  - `DATABASE_URL` — string `postgresql+asyncpg://...` (default: `postgres:postgres@localhost:5432/manhwa_tracker`).
  - `DOWNLOAD_DIR` — pasta onde os `.cbz` baixados ficam (default: `D:\Manhwas`). Altere aqui para mover a biblioteca.
  - `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_PHONE` — credenciais Telegram (obrigatórias para importar/baixar).
- **Rodando o backend:** Acesse o diretório, ative o `venv` (`venv\Scripts\activate`) e execute `python main.py` na porta 8000. Ou use `iniciaBack.bat` na raiz.

### 2. Frontend (Next.js / React Web)
- **Diretório:** `/frontend`
- **Descrição:** Aplicação web para consumo da API utilizando **Next.js 14**, **TypeScript** e **Tailwind CSS**.
- **Estrutura:** 
  - `/frontend/app`: Utiliza o App Router do Next.js.
  - `/frontend/components`: Componentes visuais reusáveis (ex: `ManhwaCard`, `AddManhwaModal`).
  - `/frontend/types`: Tipagens TypeScript, como `manhwa.ts`.
- **Rodando o frontend:** Acesse o diretório e execute `npm run dev` na porta 3000.

### 3. Mobile (Expo / React Native)
- **Diretório:** `/mobile`
- **Descrição:** Aplicativo mobile cross-platform construído com **Expo SDK 54**, **React Native** e **NativeWind**. Consome a mesma API do backend via Tailscale.
- **API base:** `src/lib/api.ts` lê `EXPO_PUBLIC_API_BASE` do ambiente (com fallback para o IP Tailscale `http://100.78.119.19:8000`). Para usar em outra rede, defina `EXPO_PUBLIC_API_BASE` num `.env` na raiz de `/mobile`.
- **Rodando o mobile:** Acesse o diretório e execute `npx expo start`.

#### 📁 Estrutura Interna (`/mobile`)
```
mobile/
├── app.json                  # Configuração do Expo: ícones, splash screen, plugins, orientation
├── babel.config.js           # Configuração do Babel (necessário para NativeWind/expo-router)
├── tailwind.config.js        # Configuração do Tailwind/NativeWind
├── package.json              # Dependências do projeto mobile
└── src/
    ├── app/
    │   ├── _layout.tsx       # Layout raiz: configura Stack, StatusBar e modo imersivo
    │   └── index.tsx         # Tela principal: lista de manhwas, filtros e modais
    ├── components/
    │   ├── ManhwaCard.tsx    # Card visual de cada manhwa na lista
    │   ├── AddManhwaModal.tsx# Modal de criação/edição de manhwa
    │   └── CbzReader.tsx     # Leitor nativo de arquivos CBZ (capítulos)
    ├── lib/
    │   ├── api.ts            # BASE_URL da API (Tailscale: http://100.78.119.19:8000)
    │   └── cache.ts          # Cache local de capítulos (AsyncStorage + FileSystem)
    ├── constants/
    │   └── theme.ts          # Paleta de cores (dark/light), fontes e espaçamentos
    ├── hooks/
    │   ├── use-color-scheme.ts      # Hook de detecção de tema (nativo)
    │   ├── use-color-scheme.web.ts  # Hook de detecção de tema (web)
    │   └── use-theme.ts             # Hook que retorna as cores do tema ativo
    └── types/
        └── manhwa.ts         # Interfaces TypeScript: Manhwa e CreateManhwaDto
```

#### ⚙️ Configurações Importantes
- **API Base:** `src/lib/api.ts` lê `EXPO_PUBLIC_API_BASE` com fallback para o IP Tailscale `http://100.78.119.19:8000`. Para sobrescrever, crie `mobile/.env` com `EXPO_PUBLIC_API_BASE=http://...`.
- **Tema:** cores centralizadas em `src/constants/theme.ts` — altere lá para mudar a paleta do app.
- **Tipagens:** `src/types/manhwa.ts` deve estar sincronizado com `backend/models.py` e `frontend/types/manhwa.ts` (sincronização manual, por enquanto sem pacote compartilhado).

#### 🖥️ Modo Tela Cheia (Imersivo) — apenas no leitor CBZ
O modo imersivo (sem barra de status e sem barra de navegação) é ativado **somente ao abrir o `CbzReader`** e restaurado ao fechar. O restante do app exibe as barras normalmente.
- Implementado em `src/components/CbzReader.tsx` + `src/components/ReaderHost.tsx` + `src/lib/reader-store.ts`:
  - O leitor é renderizado **UMA vez na raiz** via `<ReaderHost/>` no `_layout.tsx`, **não** em `<Modal>` — no Android o `Modal` é janela separada e ignora os comandos de esconder barras. Telas abrem o leitor via `openReader(...)` do store; `navigateReader`/`closeReader` controlam.
  - `setStatusBarHidden(true, 'fade')` + `<StatusBar hidden={true} />` — oculta a barra de status.
  - `NavigationBar.setVisibilityAsync('hidden')` + `setBehaviorAsync('overlay-swipe')` no `useEffect` de montagem — oculta a barra inferior; o `return` restaura ao fechar.
  - Botão voltar do Android tratado via `BackHandler` (não há mais `onRequestClose`).
  - O header e o botão "voltar ao topo" usam `useSafeAreaInsets()` para não ficarem embaixo do notch/gesture bar quando visíveis.
- Usa o pacote `expo-navigation-bar` (já instalado).
- **Para alterar:** edite o `useEffect` de imersivo e o `<StatusBar>` dentro de `src/components/CbzReader.tsx`.
- **Atenção:** se criar novas telas em tela cheia, **NÃO** use `<Modal>` no Android pro modo imersivo — replique o padrão de "View na raiz" do `ReaderHost`.

#### 📌 Persistência de progresso de leitura (scroll por capítulo)
A posição de scroll dentro de um capítulo é salva tanto **local** (`AsyncStorage` via `saveLocalScroll`) quanto **no servidor** (`PUT /api/manhwas/{id}/read/{filename}/scroll`).
- **Ao abrir um capítulo**, o `CbzReader` lê os DOIS valores (local + servidor) e usa o **MAIOR**:
  - Se `local > servidor` → vai pra posição local **e empurra** ela pro servidor (enfileira via `sync-queue` se falhar).
  - Se `servidor > local` → vai pra posição do servidor e atualiza o local com esse valor.
  - **Offline** → usa só o local; o `drainQueue` envia depois (chamado no app start, foreground e sync).
- **Ao sair / trocar de capítulo**, o cleanup do `useEffect` flusha o último offset pendente (debounce de 500ms é engolido senão).
- Implementado em `src/components/CbzReader.tsx`; fila offline em `src/lib/sync-queue.ts`.

- **❗ AVISO CRÍTICO PARA O MOBILE:** O Expo mudou. Verifique sempre o arquivo `/mobile/AGENTS.md` (e a documentação oficial da versão correta da SDK) antes de alterar rotas ou configurações.

### 4. Automação Trello ↔ Claude Code
- **Diretório:** `/automation`
- **Descrição:** Script Python (`watcher.py`) que faz polling de um board do Trello e
  orquestra o ciclo completo de uma task:
  1. Card entra em "Em Andamento" → Claude Code leve (`claude_prompt.py`, modelo
     `CLAUDE_PROMPT_MODEL`/haiku, só leitura) escolhe modelo (`sonnet`/`opus`) e
     effort (`low`-`max`) pra execução numa chamada curta e dedicada, e escreve o
     prompt final numa chamada separada (explora o repo com Read/Glob/Grep) → comenta
     no card e move pra "Em Desenvolvimento".
  2. Claude Code principal (`--permission-mode acceptEdits`, modelo/effort escolhidos
     acima) executa sozinho numa branch git própria do card (sempre nova na rodada
     inicial) → commita, sobe a branch pro remoto, move o card pra "Teste" e avisa no
     Telegram a cada etapa (gerando prompt / executando / pronto).
  3. Em "Teste": comentar no card (sem arrastar nada) reinicia o ciclo sozinho -
     manda de volta pra "Em Andamento", redesenha o prompt considerando o comentário,
     executa de novo retomando a mesma sessão do Claude Code. Arrastar direto pra "Em
     Desenvolvimento" também funciona (pula o redesenho, manda o comentário como
     feedback cru).
  4. Card aprovado ("Concluído") → branch é mergeada na `BASE_BRANCH`. Quando não
     sobra task ativa e algum card mergeado mexeu em `mobile/`, dispara `eas build` e
     manda o link de download (cards que não tocaram mobile não disparam build).
  5. Se a conta bater no limite de uso do Claude Code, a automação não fica tentando
     de novo a cada poll - espera até o horário de reset (extraído da própria mensagem
     de erro) e retoma sozinha, com aviso no Telegram nos dois momentos.
- **Ambas as chamadas ao Claude Code que exploram o repositório (rascunho do prompt e
  execução) recebem um lembrete explícito (via `--append-system-prompt`) pra usar o
  graphify em vez de grep/Read cru quando `graphify-out/graph.json` existir - mesma
  regra deste arquivo, seção "graphify" no topo. Ao adicionar uma nova chamada ao
  Claude Code nesse fluxo que tenha acesso a Read/Glob/Bash, inclua o mesmo lembrete
  (`GRAPHIFY_REMINDER`, exportado de `claude_runner.py`).
- **Arquivos principais:** `watcher.py` (loop principal), `trello_client.py` (API do
  Trello, com retry automático), `claude_prompt.py`, `claude_runner.py` (chama o CLI
  `claude`, com retry/espera automática em limite de uso), `git_ops.py`,
  `telegram_notify.py`, `mobile_build.py`, `state.py` (estado local em `state.json`,
  não versionado - por card: branch, session_id, model/effort escolhidos, áreas
  alteradas), `proc_utils.py` (resolve o caminho completo de `claude`/`eas`/`git`
  antes de chamar subprocess).
- **Configuração:** `automation/.env` (não versionado — copie de `.env.example`).
  Passo a passo completo em `automation/SETUP.md`.
- **Roda local**, disparado manualmente via `iniciaAutomation.bat` (não sobe pra
  produção nem é iniciado automaticamente com o Windows). O processo não recarrega
  código sozinho - se você fizer merge/checkout de outra branch com ele já rodando,
  precisa reiniciar pra pegar o código novo (a versão rodando aparece no log/Telegram
  de início, como `branch@commit`).
- Se for mexer nesse fluxo (novos estágios, outro board, outra forma de build),
  atualize `automation/SETUP.md` junto.

---

## 🔍 Como se Orientar (Instruções para Agentes)

Sempre que você for iniciar uma nova tarefa neste projeto, siga este fluxo:

1. **Nunca trabalhe direto em cima da `main`.** Antes de qualquer alteração, rode
   `git branch --show-current`:
   - Se estiver em `main`, crie e faça checkout numa branch nova com **nome
     genérico, sem relação com a task** (ex: `agent-work`) antes de tocar em
     qualquer arquivo - evita commitar direto em `main` e ter que resolver
     conflito depois com outra branch em andamento (ex: uma branch de card da
     automação Trello, seção 4 abaixo).
   - Se já estiver em outra branch (de card da automação, ou uma branch genérica
     de uma sessão anterior como `agent-work`), **não crie outra** - continue
     trabalhando nela.
2. **Leia este arquivo** (`AGENT_INSTRUCTIONS.md`) para entender o panorama do projeto.
3. **Leia o `README.md` principal** na raiz do repositório para detalhes de instalação e endpoints.
4. **Leia os `README.md` e `AGENTS.md` locais:**
   - Se for trabalhar no mobile, **LEIA obrigatoriamente** o `/mobile/AGENTS.md` e o `/mobile/README.md`.
5. **Respeite a comunicação:** Modificações no modelo de dados do Backend (`/backend/models.py`) devem ser refletidas nos tipos do Frontend (`/frontend/types/manhwa.ts`) e do Mobile.
6. **Utilize o Terminal com Sabedoria:** Para iniciar os serviços, utilize os arquivos `.bat` na raiz (ex: `iniciaBack.bat` e `iniciaFront.bat`) caso já estejam configurados.

## 🎯 Próximos Passos (Para a IA)
Ao receber um prompt do usuário pedindo uma alteração, analise se a alteração afeta:
- Apenas a interface de uma plataforma (modifique apenas a respectiva pasta).
- A lógica de negócios (modifique o backend e garanta que os clientes `frontend` e `mobile` não quebrem com novos campos ou retornos diferentes).
- Se a task chegou via automação do Trello (`/automation`), o prompt já foi escrito por outra sessão do Claude Code a partir do card — ainda assim, siga as mesmas convenções abaixo e sempre feche com um commit.

**Boas práticas de código neste repositório:**
- Frontend e Mobile compartilham a mesma paleta de cores e estilo visual (Tailwind/NativeWind).
- Respeite as tipagens estritas em TypeScript.
- No Backend, documente novos endpoints via tipagem do Pydantic/FastAPI, que gera o Swagger em `/docs`.

---

## 📝 Manutenção deste Arquivo (Obrigatório para Agentes)

**Sempre que você realizar uma alteração significativa no projeto, você DEVE atualizar este arquivo** (`AGENT_INSTRUCTIONS.md`) para refletir o que mudou.

### Como editar este arquivo corretamente

1. **Localize o trecho correspondente:** Identifique qual seção do arquivo descreve a parte do projeto que você alterou (ex: seção `### 1. Backend` se mexeu no backend).
2. **Edite apenas o bloco relevante:** Não reescreva o arquivo inteiro. Altere somente o parágrafo, bullet point ou subseção que ficou desatualizado.
3. **Siga o padrão existente:** Use o mesmo estilo de formatação Markdown (bullets com `-`, negrito para termos-chave, emojis de aviso para alertas críticos como `❗`).
4. **Se criar algo novo** (novo módulo, novo script, nova pasta importante), **adicione uma subseção** nova seguindo o modelo das seções existentes.
5. **Documente o que mudou no final**, adicionando um bullet na seção `🎯 Próximos Passos` se a mudança introduzir um novo padrão ou responsabilidade.

### Exemplo de fluxo

> Você adicionou um novo endpoint no backend e criou um novo arquivo `auth.py`.  
> → Vá até a seção `### 1. Backend > Arquivos principais` e adicione `auth.py` na lista com uma descrição.  
> → Se isso quebrar alguma convenção antiga, atualize a seção `🎯 Próximos Passos`.

---

Bom trabalho! 🚀
