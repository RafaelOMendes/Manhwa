# 🤖 Automação Trello ↔ Claude Code

Pipeline local que liga o Trello, o Gemini e o Claude Code para tocar as tasks do
Manhwa Tracker praticamente sozinho, do jeito que foi combinado:

```
[A Fazer]
   │  (você arrasta o card)
   ▼
[Em Andamento] ──────────────► Gemini escreve um prompt detalhado a partir do
   │                            título/descrição do card e comenta no próprio card
   ▼
[Em Desenvolvimento] ────────► Claude Code roda sozinho (sem pedir permissão),
   │                            numa branch git só do card, e commita o resultado
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
internet nem mexer em webhook — é só polling simples.

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
qual branch vai ser a `BASE_BRANCH` da automação (ver passo 6) e garanta que ela
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

Os nomes exatos vão no `.env` (passo 6) — se preferir outros nomes, é só usar os
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

## 3. Chave de API do Gemini

A automação usa a API do Gemini (não o app/assinatura Gemini que você já tem — são
produtos separados) pra transformar o card num prompt bem estruturado.

1. Acesse **https://aistudio.google.com/apikey**.
2. Crie uma chave (o tier gratuito tem uma cota generosa, suficiente pra esse uso).
3. Copie a chave para `GEMINI_API_KEY` no `.env`.

O modelo padrão configurado é `gemini-2.5-pro`. Se quiser usar um modelo mais novo,
troque `GEMINI_MODEL` no `.env` — a lista atual de modelos fica em
**https://ai.google.dev/gemini-api/docs/models**.

---

## 4. Bot do Telegram (avisos)

1. No Telegram, procure **@BotFather**, mande `/newbot`, escolha um nome e um
   username (precisa terminar em "bot"). Ele devolve um **token** — isso vai em
   `TELEGRAM_BOT_TOKEN`.
2. Mande **/start** para o bot que você acabou de criar (senão ele não pode te
   mandar mensagem).
3. Para descobrir seu `TELEGRAM_CHAT_ID`, fale com **@userinfobot** — ele responde
   na hora com seu ID numérico.

---

## 5. Configurar o `.env`

```powershell
cd automation
copy .env.example .env
notepad .env
```

Preencha tudo que ficou pendente nos passos 2–4. Confira principalmente:

- `TRELLO_LIST_DOING`, `TRELLO_LIST_DEV`, `TRELLO_LIST_TEST`, `TRELLO_LIST_DONE` —
  têm que bater exatamente com os nomes das colunas no seu board (o watcher avisa
  claramente no log se algum nome não for encontrado).
- `BASE_BRANCH` — a branch a partir da qual cada card vai criar sua branch, e pra
  onde ela volta quando aprovada. Hoje seu repo está em `fix_mobile`; se quiser usar
  ela como base por enquanto, mude `BASE_BRANCH=fix_mobile`.
- `PUSH_TO_REMOTE=false` — deixe assim no início. Os merges ficam só localmente até
  você se sentir confortável, aí muda pra `true` pra também dar `git push` depois de
  cada merge.

---

## 6. Rodar

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

## 7. Uso no dia a dia

1. Crie o card no Trello com um título e descrição razoavelmente claros (quanto
   melhor a descrição, melhor o prompt que o Gemini gera — mas não precisa ser
   perfeito, o Gemini foi instruído a tomar decisões razoáveis sozinho quando faltar
   detalhe, já que ninguém vai responder perguntas de esclarecimento no meio do
   processo).
2. Arraste para **Em Andamento**.
3. Espere (até ~30s de poll + o tempo do Gemini) até ele aparecer em
   **Em Desenvolvimento**, com o prompt gerado comentado no card.
4. O Claude Code roda sozinho. Isso pode levar de minutos a bem mais, dependendo da
   task (timeout padrão: 45 min, ajustável em `CLAUDE_RUN_TIMEOUT_SECONDS`).
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

## 8. Limitações conhecidas (v1)

- **Uma task de cada vez funciona melhor.** Cada card ganha sua própria branch a
  partir da `BASE_BRANCH`, mas branches de cards diferentes não se enxergam entre si
  até serem mergeadas. Se duas tasks mexerem no mesmo arquivo ao mesmo tempo, pode
  dar conflito no merge (o watcher aborta o merge automaticamente e te avisa — nunca
  força um merge quebrado).
- **Conflito de merge não é resolvido sozinho** — o watcher avisa no Telegram e no
  card, e você resolve na mão (`git checkout <BASE_BRANCH>`, `git merge <branch>`,
  resolve, commit).
- **Custo:** cada card consome uma chamada ao Gemini e uma sessão do Claude Code
  (cobrada pela sua assinatura/API normalmente). Builds do EAS também consomem sua
  cota de builds do plano Expo.
- **Sem retomar builds em paralelo** — só um build mobile por vez.
- Os nomes de campo do JSON do `eas build --json` podem variar entre versões do
  `eas-cli`; se o watcher não achar o link automaticamente, ele te manda o `build id`
  pra você achar em https://expo.dev.

---

## 9. Troubleshooting rápido

| Sintoma | O que checar |
|---|---|
| Script encerra na hora com "Faltam variáveis" | Confira se `automation/.env` existe e tem todas as chaves preenchidas |
| Erro "Essas listas não foram encontradas no board" | Nome da lista no `.env` tem que ser idêntico ao nome no Trello (o log mostra as listas disponíveis) |
| Card fica travado em "Em Desenvolvimento" e não sai | Olhe a janela do terminal / o log; provavelmente `git status` não está limpo na `BASE_BRANCH`, ou o Claude Code deu timeout |
| Não chega aviso no Telegram | Confira se você mandou `/start` pro bot e se `TELEGRAM_CHAT_ID` está certo |
| `eas build` falha | Rode `eas build --platform android --profile preview` manualmente uma vez pra ver o erro completo (login, credenciais Android etc) |

---

Qualquer ajuste de fluxo (outro nome de lista, outro perfil de build, mais de uma
plataforma no build, etc.) é só mexer nas variáveis do `.env` ou pedir pra eu ajustar
os scripts em `automation/`.
