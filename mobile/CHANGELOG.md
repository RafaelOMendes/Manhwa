# Changelog (mobile)

Versões entregues via `eas update` (branch `preview`). Bumpar `APP_VERSION` em
`src/lib/version.ts` a cada entrega (NÃO mexer no `expo.version` do `app.json`
— ver `AGENTS.md`).

## 1.2.3

- Corrige perda silenciosa de downloads ao usar "Baixar tudo" com vários
  manhwas em paralelo (`MANHWA_CONCURRENCY = 4`). Cada `syncManhwaLocal`
  carregava o índice inteiro no início e só salvava no fim (depois de baixar
  todos os capítulos) — quando 2+ manhwas terminavam perto um do outro, quem
  salvasse por último sobrescrevia o índice inteiro e apagava os
  `pending`/`cached` que os outros tinham acabado de gravar (arquivos ficavam
  no disco mas fora do índice — provável causa do caso "X GB usado mas 0
  baixado"). Agora o load→mutate→save do índice passa por `withIndexLock()`,
  que serializa só essa parte (os downloads de capítulo continuam 100%
  paralelos). Aplica ao `cache.ts` inteiro, não só ao sync.

## 1.2.2

- Reverte estratégia da 1.2.0/1.2.1 (pré-cálculo bloqueando o mount da
  FlatList + getItemLayout). Tinha duas falhas:
  1. O `useEffect` de restore acionava `scrollToOffset` com `flatListRef`
     ainda null (React não tinha commitado o native view).
  2. Mover pra `onLayout` resolveria o (1), mas se o `RNImage.getSize`
     travasse ou demorasse em algum arquivo, o usuário ficava preso na
     tela "Preparando capítulo…" indefinidamente, sem FlatList — daí
     parecer que "nem scroll está acontecendo".
- Agora: restore voltou pra estratégia **progressiva** da v1.1.12 (que
  funcionava). O pré-cálculo de alturas continua, mas em **background**
  (não bloqueia o mount da FlatList) e só serve pra dar mais precisão ao
  botão "ir pro fim" via `totalContentHeightRef`. Falhas no `getSize`
  agora têm timeout de 2s por chamada — não trancam mais nada.
- Se o precompute não completar a tempo, o "ir pro fim" cai no
  `contentHeightRef` (estimado pela FlatList), igual à 1.1.11/1.1.12.

## 1.2.1

- Fix: scroll restore ao abrir capítulo não estava acontecendo na 1.2.0.
  Causa: o restore rodava num `useEffect` com `requestAnimationFrame` logo
  que `preparing` virava false, mas o `flatListRef.current` ainda estava
  null porque o React não tinha commitado a FlatList nativamente. Agora o
  restore roda dentro do `onLayout` da própria FlatList — sinal confiável
  de "mounted + laid out". O botão de ir-pro-fim já usava o ref depois do
  primeiro toque do usuário, então não estava afetado.

## 1.2.0

- **Leitor: pré-cálculo de layout antes de abrir o capítulo.** Substitui o
  hack do "restore progressivo" (que empurrava o scroll em ticks pra inflar
  a contentHeight da FlatList). Agora, antes da FlatList montar, medimos
  cada página via `RNImage.getSize` (concorrência 6) e construímos um array
  de alturas + offsets cumulativos. Pra capítulos baixados (file://) é
  praticamente instantâneo.
- Com isso, `getItemLayout` da FlatList passa a retornar offset **exato** por
  índice → o restore do scroll vira um único `scrollToOffset(savedOffset)`
  que cai no pixel certo de primeira (antes deslizava por causa de re-layouts
  de imagens decodificando).
- O botão "ir pro fim" também usa `totalContentHeightRef` (exato), então
  aterrissa sempre 220px antes do gatilho de marca-como-lido,
  independentemente de quantas páginas já tinham sido virtualizadas.
- UI: durante o pré-cálculo aparece "Preparando capítulo… (N/total)" no
  lugar do spinner — em vez do antigo overlay sobre a FlatList.
- Imagens já carregam na altura final (sem flicker de aspect ratio), porque
  o `aspectRatiosRef` é populado antes da FlatList montar.

## 1.1.12

- Leitor: FABs de subir/descer agora aparecem/desaparecem com animação
  (fade + slide pra baixo), em paralelo com o header. Antes eles
  montavam/desmontavam instantaneamente. Usam o mesmo `headerOpacity` da
  barra de cima + um `fabTranslateY` próprio (slide pra baixo, ao contrário
  do header que sobe). Toques bloqueados via `pointerEvents` quando
  invisíveis pra não captarem clique no fantasma.

## 1.1.11

- Leitor: novo FAB "ir pro fim" (seta ↓), empilhado abaixo do "voltar ao topo".
  Pula pra perto do fim do capítulo SEM marcar como lido — o alvo do scroll
  fica 220px antes do gatilho de marca-como-lido (`contentSize - 120` no
  onScroll), com folga pro overshoot da animação. Útil pra pular partes que
  você não quer ler sem que o capítulo conte como lido.
- Mesmo estilo do FAB de voltar ao topo (fundo escuro + borda translúcida,
  bom contraste em fundo claro/escuro). Some junto com o header no auto-hide.

## 1.1.10

- Leitor: corrigido FAB de "voltar ao topo" que continuava visível após o
  header sumir pelo auto-hide de 3s. Agora `setShowUI(false)` é chamado junto
  com `animateHeader(false)`, então o FAB some junto. Bônus: o primeiro toque
  na tela depois do auto-hide volta a reabrir o header (antes o estado ficava
  dessincronizado e precisava de dois toques).
- Leitor: melhorado contraste do FAB. Fundo passou de `rgba(255,255,255,0.15)`
  (invisível em páginas claras) para `rgba(0,0,0,0.6)` com borda branca
  translúcida — fica nítido em fundo claro e escuro.
- `version.ts`: comentário corrigido para refletir a regra do `AGENTS.md`
  (bumpar SÓ a constante em updates OTA, nunca o `app.json`).
