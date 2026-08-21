# 🤖 Automação Trello ↔ Claude Code

Pipeline local que liga o Trello e o Claude Code para tocar as tasks do Manhwa
Tracker praticamente sozinho, do jeito que foi combinado:

```
[A Fazer]
   │  (você arrasta o card)
   ▼
[Em Andamento] ──────────────► Claude Code (modelo leve, ex: haiku) escreve um
   │                            prompt detalhado a partir do título/descrição do
   │                            card e comenta no próprio card
   ▼
[Em Desenvolvimento] ────────► Claude Code (modelo principal) roda sozinho (sem
   │                            pedir permissão), numa branch git só do card, e
   │                            commita o resultado
   ▼
[Teste] ──────────────────────► avisa no Telegram "pode testar"
   │
   ├─ ruim → arraste de volta pra "Em Desenvolvimento" e comente o que corrigir
   │          (o Claude Code retoma a MESMA sessão, com esse feedback)
   │
   └─ bom → arraste pra "Concluído" → a branch do card é mergeada na branch
             principal automaticamente

Quando não sobra nada em Em Andamento / Em Desenvolvimento / Teste e existe pelo
menos uma task recém-concluída, o watcher builda o app mobile (EAS) e manda o
link de download no Telegram.
```

Tudo roda **local, no seu PC**, num script Python (`automation/watcher.py`) que fica
checando o board a cada 30 segundos (configurável). Não precisa expor nada pra
internet nem mexer em webhook — é só polling simples. As duas etapas de IA (rascunhar
o prompt e executar a tarefa) usam o **mesmo `claude` CLI local** que você já tem
autenticado nesse repositório, só que com modelos e permissões diferentes — não
depende de nenhuma outra API/chave de terceiros.

**Importante:** esse `automation/` inteiro foi escrito e colocado no seu repositório,
mas **ninguém rodou o script ainda** nem testou as chamadas de API de verdade (eu não
tenho suas chaves). Siga os passos abaixo com calma na primeira vez.

---

## 0. Antes de começar — checklist rápido no seu terminal

Abra um PowerShell na pasta do projeto e confira:

```powershell
git status
```

Enquanto eu explorava seu repositório pela ponte do Cowork, reparei que a árvore de
trabalho está com **~74 arquivos "modificados"**, mas o diff parece ser só troca de
fim de linha (CRLF ↔ LF) — por exemplo o `README.md` inteiro aparece como
"179 linhas removidas / 179 adicionadas" sem nenhuma mudança de conteúdo real. Isso
não tem nada a ver com a automação, mas **é importante resolver antes**, porque o
watcher se recusa de propósito a criar uma branch nova para um card se a árvore de
trabalho não estiver limpa (é a proteção contra misturar mudanças suas não commitadas
com o que o Claude Code vai gerar).

O jeito mais comum de resolver isso é padronizar o fim de linha do repositório:

```powershell
git config core.autocrlf true
```

E então decidir, arquivo por arquivo ou tudo de uma vez, se você quer commitar essa
renormalização ou descartar (`git checkout -- .` se as mudanças forem só isso e você
tiver certeza que não há conteúdo real ali — confira com `git diff <arquivo>` antes).
Também repare que o repositório está na branch `fix_mobile`, não em `main` — decida
qual branch vai ser a `BASE_BRANCH` da automação (ver passo 4) e garanta que ela
existe e está limpa.

Confira também se essas ferramentas já funcionam no seu terminal:

```powershell
claude --version
python --version
node --version
eas --version
```

Se `eas` não for reconhecido: `npm install -g eas-cli` e depois `eas login`.
Se `claude` não for reconhecido ou pedir login: rode `claude` uma vez interativo e
faça login normalmente (a automação usa a mesma sessão autenticada).

---

## 1. Ajustar as listas do Trello

Seu board já existe, só precisa ter (ou ganhar) estas colunas, com esses nomes
exatos — o watcher casa pelo nome, então pode renomear as que já existem em vez de
criar novas:

1. **A Fazer** — backlog, onde os cards nascem (nome livre, não é lido pela automação).
2. **Em Andamento** — você arrasta pra cá pra disparar a geração do prompt.
3. **Em Desenvolvimento** — automação move pra cá sozinha; é aqui que o Claude Code
   trabalha.
4. **Teste** — automação move pra cá quando termina; é aqui que você valida.
5. **Concluído** — você arrasta pra cá quando aprovar; dispara o merge da branch.

Os nomes exatos vão no `.env` (passo 3) — se preferir outros nomes, é só usar os
mesmos ali.

---

## 2. Credenciais do Trello

1. Acesse **https://trello.com/power-ups/admin**, clique em **"New"** para criar um
   Power-Up/App (pode chamar de "Manhwa Automation"), e gere uma **API Key**.
2. Na mesma página aparece um link **"Token"** — clique, autorize, e copie o token
   gerado (ele não expira a menos que você revogue).
3. Para o `TRELLO_BOARD_ID`: abra seu board no navegador e adicione `.json` no final
   da URL (ex: `https://trello.com/b/AbCd1234/meu-board.json`), abra o link, e
   procure pelo campo `"id"` bem no início do JSON.

---

## 3. Bot do Telegram (avisos)

1. No Telegram, procure **@BotFather**, mande `/newbot`, escolha um nome e um
   username (precisa terminar em "bot"). Ele devolve um **token** — isso vai em
   `TELEGRAM_BOT_TOKEN`.
2. Mande **/start** para o bot que você acabou de criar (senão ele não pode te
   mandar mensagem).
3. Para descobrir seu `TELEGRAM_CHAT_ID`, fale com **@userinfobot** — ele responde
   na hora com seu ID numérico.

---

## 4. Configurar o `.env`

```powershell
cd automation
copy .env.example .env
notepad .env
```

Preencha tudo que ficou pendente nos passos 1–3. Confira principalmente:

- `TRELLO_LIST_DOING`, `TRELLO_LIST_DEV`, `TRELLO_LIST_TEST`, `TRELLO_LIST_DONE` —
  têm que bater exatamente com os nomes das colunas no seu board (o watcher avisa
  claramente no log se algum nome não for encontrado).
- `BASE_BRANCH` — a branch a partir da qual cada card vai criar sua branch, e pra
  onde ela volta quando aprovada. Hoje seu repo está em `fix_mobile`; se quiser usar
  ela como base por enquanto, mude `BASE_BRANCH=fix_mobile`.
- `PUSH_TO_REMOTE=false` — deixe assim no início. Os merges ficam só localmente até
  você se sentir confortável, aí muda pra `true` pra também dar `git push` depois de
  cada merge.
- `CLAUDE_PROMPT_MODEL=haiku` — modelo usado só pra reescrever o card num prompt
  (etapa rápida/barata). Aceita alias (`sonnet`, `opus`, `haiku`, `fable`) ou nome
  completo de modelo.
- `CLAUDE_EXEC_MODEL` — deixe em branco pra usar o modelo padrão da sua conta na
  execução de verdade, ou defina um alias/nome se quiser forçar um modelo específico.

Não precisa de nenhuma chave de API extra (Trello e Telegram à parte) — as duas
etapas de IA usam o `claude` CLI já autenticado na sua máquina.

---

## 5. Rodar

Da raiz do repositório, dê duplo-clique em **`iniciaAutomation.bat`** (ele cria o
venv, instala as dependências de `automation/requirements.txt` e inicia o
`watcher.py`). Ou manualmente:

```powershell
cd automation
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python watcher.py
```

Se tudo estiver certo, ele imprime as listas resolvidas do Trello e manda uma
mensagem "🤖 Automação Trello ↔ Claude Code iniciada" no seu Telegram. Deixe essa
janela aberta enquanto estiver trabalhando — é ela que fica de olho no board.
Ctrl+C para parar.

**Dica:** na primeira execução, se já existir algum card em "Em Andamento" ou "Em
Desenvolvimento", o watcher vai processá-lo imediatamente (ele não sabe que aquele
card já estava lá antes de existir a automação) — normal, é só ele "descobrindo" o
estado atual do board.

---

## 6. Uso no dia a dia

1. Crie o card no Trello com um título e descrição razoavelmente claros (quanto
   melhor a descrição, melhor o prompt que sai da etapa de rascunho — mas não
   precisa ser perfeito, essa etapa foi instruída a tomar decisões razoáveis sozinha
   quando faltar detalhe, já que ninguém vai responder perguntas de esclarecimento no
   meio do processo).
2. Arraste para **Em Andamento**.
3. Espere (até ~30s de poll + o tempo dessa primeira chamada ao Claude Code - na
   prática ~30-90s, testado ao vivo em ~40s) até ele aparecer em **Em
   Desenvolvimento**, com o prompt gerado comentado no card.
4. Mais um poll (~30s) até o watcher notar que o card chegou em Em Desenvolvimento e
   começar a etapa de verdade: cria a branch e o Claude Code roda sozinho (modelo
   principal, liberado pra editar arquivos e rodar comandos). **Sem tempo fixo** -
   pode ser bem rápido pra uma task pequena ou levar bem mais pra algo grande (timeout
   máximo: 45 min, ajustável em `CLAUDE_RUN_TIMEOUT_SECONDS`). A janela do terminal
   fica muda enquanto isso roda (é uma chamada bloqueante), mas imprime um heartbeat a
   cada 1 minuto ("...Claude Code ainda rodando (Xmin decorridos...)") pra você
   distinguir "trabalhando" de "travado".
5. Quando terminar, o card vai pra **Teste** e você recebe o aviso no Telegram com o
   nome da branch (ex: `card-a1b2c3-adicionar-filtro`).
6. Teste localmente: `git checkout <branch>` nos serviços relevantes (ou já vai estar
   ali se você não trocou de branch no meio do caminho).
   - **Deu certo:** arraste o card pra **Concluído**. A branch é mergeada na
     `BASE_BRANCH` e apagada.
   - **Precisa ajustar:** comente no card o que está errado e arraste de volta pra
     **Em Desenvolvimento** — o Claude Code retoma o mesmo contexto (mesma sessão)
     com esse feedback, sem perder o que já fez.
7. Quando não sobrar nenhum card ativo (Em Andamento / Em Desenvolvimento / Teste
   vazios) e pelo menos um card tiver sido concluído desde o último build, o watcher
   dispara automaticamente `eas build` (perfil `preview`, gera `.apk`) e manda o link
   de download assim que terminar.

---

## 7. Limitações conhecidas (v1)

- **Uma task de cada vez funciona melhor.** Cada card ganha sua própria branch a
  partir da `BASE_BRANCH`, mas branches de cards diferentes não se enxergam entre si
  até serem mergeadas. Se duas tasks mexerem no mesmo arquivo ao mesmo tempo, pode
  dar conflito no merge (o watcher aborta o merge automaticamente e te avisa — nunca
  força um merge quebrado).
- **Conflito de merge não é resolvido sozinho** — o watcher avisa no Telegram e no
  card, e você resolve na mão (`git checkout <BASE_BRANCH>`, `git merge <branch>`,
  resolve, commit).
- **Custo:** cada card consome DUAS sessões do Claude Code — uma rápida/barata (modelo
  leve) pra rascunhar o prompt, e uma completa (modelo principal) pra executar —
  cobradas normalmente pela sua assinatura/API. Builds do EAS também consomem sua
  cota de builds do plano Expo.
- **Sem retomar builds em paralelo** — só um build mobile por vez.
- Os nomes de campo do JSON do `eas build --json` podem variar entre versões do
  `eas-cli`; se o watcher não achar o link automaticamente, ele te manda o `build id`
  pra você achar em https://expo.dev.

---

## 8. Troubleshooting rápido

| Sintoma | O que checar |
|---|---|
| Script encerra na hora com "Faltam variáveis" | Confira se `automation/.env` existe e tem `TRELLO_KEY`/`TRELLO_TOKEN`/`TRELLO_BOARD_ID` preenchidos |
| Erro "Essas listas não foram encontradas no board" | Nome da lista no `.env` tem que ser idêntico ao nome no Trello (o log mostra as listas disponíveis) |
| Card fica travado em "Em Andamento" sem mover pra "Em Desenvolvimento" | Rode `claude -p "oi" --model haiku` manualmente pra ver se o CLI/login/modelo estão OK |
| Card fica travado em "Em Desenvolvimento" e não sai | Olhe a janela do terminal / o log; provavelmente `git status` não está limpo na `BASE_BRANCH`, ou o Claude Code deu timeout |
| Não chega aviso no Telegram | Confira se você mandou `/start` pro bot e se `TELEGRAM_CHAT_ID` está certo |
| `eas build` falha | Rode `eas build --platform android --profile preview` manualmente uma vez pra ver o erro completo (login, credenciais Android etc) |
| `OSError: [WinError 87] O parâmetro está incorreto` ao chamar o Claude Code/EAS/git | **Causa real (confirmada):** não é o shim `.CMD`/`.PS1` do npm — `automation/proc_utils.py` já resolvia isso certinho. O bug era `os.environ.get("CLAUDE_CLI_PATH", "claude")` em `claude_runner.py`: como `CLAUDE_CLI_PATH=` fica **presente mas vazio** no `.env` (intencional, ver passo 4), `os.environ.get(chave, default)` devolve `""` em vez do default — o default só entra quando a chave não existe. `resolve_command("")` não acha nada e caía num fallback `[""]`; `subprocess.run([""...])` manda um argv[0] vazio pro `CreateProcess`, que devolve exatamente `WinError 87`. Corrigido: `claude_runner.py`/`mobile_build.py` agora usam `os.environ.get("X") or default` (trata string vazia como "não setado"), e `proc_utils.resolve_command()` levanta um `ValueError` claro se receber um nome vazio, em vez de deixar o erro aparecer disfarçado de `WinError 87` lá na frente. `git` nunca teve esse problema (`GIT_CMD` vem do literal `"git"`, não de env var), e `eas` só não quebrou porque `EAS_CLI_PATH=eas` já vinha preenchido no `.env.example`. Se reaparecer, rode `python -c "import proc_utils; print(proc_utils.resolve_command('claude'))"` de dentro de `automation/` (com o venv ativado) e confira se bate com `Get-Command claude` no PowerShell |

---

Qualquer ajuste de fluxo (outro nome de lista, outro perfil de build, mais de uma
plataforma no build, trocar os modelos usados, etc.) é só mexer nas variáveis do
`.env` ou pedir pra eu ajustar os scripts em `automation/`.
