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

---

## 🔍 Como se Orientar (Instruções para Agentes)

Sempre que você for iniciar uma nova tarefa neste projeto, siga este fluxo:

1. **Leia este arquivo** (`AGENT_INSTRUCTIONS.md`) para entender o panorama do projeto.
2. **Leia o `README.md` principal** na raiz do repositório para detalhes de instalação e endpoints.
3. **Leia os `README.md` e `AGENTS.md` locais:**
   - Se for trabalhar no mobile, **LEIA obrigatoriamente** o `/mobile/AGENTS.md` e o `/mobile/README.md`.
4. **Respeite a comunicação:** Modificações no modelo de dados do Backend (`/backend/models.py`) devem ser refletidas nos tipos do Frontend (`/frontend/types/manhwa.ts`) e do Mobile.
5. **Utilize o Terminal com Sabedoria:** Para iniciar os serviços, utilize os arquivos `.bat` na raiz (ex: `iniciaBack.bat` e `iniciaFront.bat`) caso já estejam configurados.

## 🎯 Próximos Passos (Para a IA)
Ao receber um prompt do usuário pedindo uma alteração, analise se a alteração afeta:
- Apenas a interface de uma plataforma (modifique apenas a respectiva pasta).
- A lógica de negócios (modifique o backend e garanta que os clientes `frontend` e `mobile` não quebrem com novos campos ou retornos diferentes).

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
