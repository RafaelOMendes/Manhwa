# Changelog (mobile)

Versões entregues via `eas update` (branch `preview`). Bumpar `APP_VERSION` em
`src/lib/version.ts` a cada entrega (NÃO mexer no `expo.version` do `app.json`
— ver `AGENTS.md`).

## 1.5.2

- **Corrige o botão "ir pro fim" do leitor parando cedo demais.** Na v1.2.4 o `stepScrollTo` desistia
  (contador de estagnação) assim que a FlatList parava de crescer por alguns ticks — mas com
  `windowSize` em boost = 9, isso acontecia com a lista ainda tendo dezenas de páginas seguintes não
  montadas/decodificadas. O usuário tocava a tela depois e via mais conteúdo carregar (scroll "subia"
  visualmente, e "marcar como lido" só funcionava depois desse toque).
- **Critério de saída do loop agora é duplo.** Além de "alcançou o offset alvo", quando o alvo vem do
  `totalContentHeightRef` pré-calculado (`requireNearFullRender`), também exige que a altura renderizada
  chegue a 95% da altura total antes de aceitar que terminou — evita sair só por ter alcançado o alvo
  do botão (que já para ANTES do fim real, por causa do `END_SAFE_GAP`) com muita página não-montada.
- **`WINDOW_BOOST` 9→18, `BATCH_BOOST` 3→5, `BATCH_PERIOD_BOOST` 30→20** — janela de renderização
  bem mais larga durante o scroll automático, só assim dá pra cobrir capítulos inteiros antes do loop
  desistir. Custa mais memória, mas só dura poucos segundos com o overlay cobrindo a tela; revertido
  assim que o scroll termina (leitura manual continua com a janela apertada de sempre).
- **Tolerância de estagnação diferenciada**: 15 ticks quando o alvo é conhecido (podemos esperar mais,
  a FlatList pode só estar decodificando devagar), 8 quando é fallback (aí a estagnação em si é o sinal
  de "chegou ao fim" — esperar mais não ajuda).
- **Nudge por `scrollToIndex`** a cada 3 ticks (só no "ir pro fim"): pula pra ~10 páginas à frente da
  posição estimada e volta, forçando a FlatList a montar itens bem além do viewport atual — acelera a
  cobertura em vez de depender só do avanço gradual (meia tela por tick) do `scrollToOffset`.
- **`handleEndReached()` agora é chamado manualmente ao fim do "ir pro fim"** — antes dependia de um
  `onScroll`/`onEndReached` nativo da FlatList pra disparar a checagem de "fim do capítulo", que não
  acontecia depois de um pouso 100% programático. Corrige "marcar como lido só depois de tocar a tela".

## 1.5.1

- **O filtro do "Lendo" agora olha o celular, não o flag do servidor** — virou **"Apenas com capítulos
  baixados"**. Antes usava `manhwa.download`, que é só a opção de *download automático* no backend:
  marcava manhwa sem nenhum arquivo no aparelho e escondia manhwa que você tinha baixado à mão.
  Agora mostra só quem tem de fato pelo menos um capítulo em disco.
- Como saber isso é assíncrono (índice no AsyncStorage) e o filtro roda síncrono no render, os ids são
  pré-computados num `Set` e recalculados ao carregar a lista (online ou offline) e sempre que a home
  volta ao foco — então baixar na tela de Downloads e voltar já traz o manhwa de volta pra lista.
- A web (`frontend/`) continua filtrando por `download`: lá o flag é o significado certo, já que não
  existe arquivo local no navegador.

## 1.5.0

- **Novo filtro "Apenas com download" no menu "Lendo".** Mostra só os manhwas com download automático
  ativado (`download: true`). O checkbox aparece ao lado de "Apenas com capítulos novos" e os dois se
  combinam (só os que têm download E capítulo novo).
- O filtro é exclusivo do "Lendo": não aparece no Top 30 nem nos outros filtros, e não afeta a listagem
  deles mesmo se tiver sido marcado antes de trocar de aba — ao voltar pro "Lendo" ele continua valendo.
- Mesma mudança feita na web (`frontend/app/page.tsx`), pra as duas telas ficarem iguais.

## 1.4.2

- **Corrigido o reset do aparelho depois de ~1h com o app aberto** (VPN, Bluetooth e Wi-Fi caindo
  juntos = soft reboot do `system_server`, não um boot de verdade). Duas causas, ambas no foreground
  service de download:
  - **Enxurrada de notificações.** Cada capítulo concluído emitia no store e o handler postava um
    `displayNotification` por emit — com até 20 downloads em paralelo (4 manhwas × 5 capítulos), eram
    dezenas de chamadas binder por segundo no `NotificationManagerService`, sustentadas por horas.
    Agora as atualizações são coalescidas em no máximo uma a cada 2s (`NOTIF_THROTTLE_MS`), lendo o
    progresso mais fresco na hora de postar e deduplicando quando nada mudou.
  - **Serviço que nunca encerrava.** A promise do handler só resolvia se `drainQueue()` retornasse. Como
    nem o `fetch` do React Native nem o `File.downloadFileAsync` têm timeout, um socket travado (o host
    do backend some quando a VPN cai) deixava o download pendente pra sempre — e o Android segurando o
    processo em foreground com wake lock, indefinidamente.
- **Timeouts em toda operação de rede do download:** 30s pra listar os arquivos de um manhwa, 5min pra
  baixar um capítulo. Estourou, conta como erro e o worker segue pro próximo.
- **Dois watchdogs no serviço:** aborta após 10min sem nenhum progresso e após 5h de execução, em
  qualquer caso encerrando o serviço e mostrando "Download interrompido".
- **Encerramento à prova de falha:** `resolve()` agora acontece em TODOS os caminhos (sucesso, erro,
  timeout), as chamadas nativas do notifee têm teto de 10s, e se `stopForegroundService()` não
  responder o serviço é derrubado cancelando a notificação.
- **Vazamentos corrigidos:** guarda de reentrância impede uma segunda instância do handler (que
  duplicava o `drainQueue` e deixava um listener do store órfão) e as sessões passaram a ser versionadas,
  pra um worker preso não voltar a consumir a fila do download seguinte.
- **Logs `[fgs]`** do ciclo de vida do serviço (início, motivo do encerramento, se o
  `stopForegroundService` completou, resolução da promise).

## 1.4.1

- **Cache local reduzido pra apenas o último capítulo lido.** `MAX_CACHED` (`cache.ts`) passou de `5`
  para `1`: ao sincronizar ou marcar um capítulo como lido, só o de MAIOR `chapter_number` fica em
  disco — os demais são apagados (`trimCached`), continuando marcados em `read` (histórico permanente,
  não some da UI). A retenção por tempo (`cleanupExpired`, 7 dias desde a última leitura) não muda.

## 1.4.0

- **Sincronização por comparação de timestamps (app offline ↔ banco).** Cada operação da fila offline
  (`sync-queue.ts`) já carregava um `at` — o momento em que o dado nasceu no celular. Agora ele vai pro
  servidor como `updated_at`, e o backend compara com o `updated_at` da linha antes de gravar:
  **quem gerou o dado por último ganha**. Se o dado da fila já nasceu velho (o banco mudou depois, ex.:
  leitura pela web), o servidor responde `success: false` + o valor atual, o app **adota o valor do
  servidor** e tira o item da fila — antes ele sobrescrevia o banco às cegas, e um dado offline antigo
  podia regredir um progresso mais novo.
- **Item rejeitado sai da fila; só falha de rede é que faz retry.** Reenviar um dado que já perdeu a
  disputa o deixaria preso na fila pra sempre. O `DrainResult` ganhou `rejected` (aparece no log de
  sincronização, junto de `sent`/`remaining`).
- **O drain manda os scrolls ANTES das leituras de capítulo.** O `PATCH /current-chapter` faz o backend
  criar registros dos capítulos anteriores com `scroll_position=0` e data de *agora*; na ordem antiga,
  os scrolls da própria fila (gerados offline, portanto mais velhos) chegavam depois e perdiam a
  comparação pra essas linhas zeradas — o app adotaria 0 e jogaria fora a posição real lida offline.
  O backend também passou a nunca deixar um `scroll_position=0` vencer uma comparação, como rede de
  segurança pro mesmo caso.
- **Valor vindo do servidor é carimbado com a data DELE.** `saveLocalScroll` aceita o `at` do servidor
  (o `GET .../scroll` agora devolve `updated_at`); datar com `now` faria o local vencer a próxima
  comparação sem merecer.
- **Escritas ao vivo do leitor continuam incondicionais.** Com o usuário lendo e online, o dado acabou
  de nascer e é sempre o mais novo — mandar timestamp ali só exporia essas escritas a diferença de
  relógio entre celular e servidor. E restaurar o scroll ao abrir um capítulo continua sendo
  **max(local, servidor)**, que é a regra que garante nunca perder posição de leitura.
- Retrocompatível: sem `updated_at` no corpo (web, builds antigas do app) o backend aplica a escrita
  direto, exatamente como antes.

## 1.3.1

- **Corrige o travamento ao terminar um download.** Quando um download acabava, a tela de Downloads
  recalculava a linha (`buildRow`) e chamava `getManhwaStorage()`, que varria o diretório do manhwa
  **em JS e de forma síncrona** (`dir.list()` recursivo + `entry.size`). Com dezenas de capítulos ×
  dezenas de páginas isso vira milhares de chamadas JSI seguidas e segura a thread principal por
  segundos — o app inteiro congelava. A soma recursiva passou a sair do
  `LegacyFS.getInfoAsync(uri)`, que faz o `walk` no nativo dentro de um `AsyncFunction`: uma única
  chamada, fora da thread JS, e a UI continua respondendo. Mesma abordagem já usada no
  `deleteChapterDirAsync`.
- **Tamanho por manhwa agora é memorizado em memória** (`storageCache`). Guarda a *Promise*, então
  chamadas concorrentes pro mesmo manhwa compartilham uma única varredura. O valor é descartado por
  `invalidateStorageCache(manhwaId?)` em tudo que mexe no disco (`downloadChapter`, `downloadCover`,
  `deleteChapterDirAsync`, `removeManhwaLocal`, `cleanupCorrupted`, `cleanupExpired`), então os
  números continuam corretos sem re-varrer o disco a cada refresh de linha.
- **Cover da linha resolvida no `buildRow`, não no render.** `getLocalCoverUri()` é uma checagem de
  disco síncrona e rodava uma vez por linha a **cada** render — e as linhas re-renderizam a cada tick
  de progresso do download. Agora vem pronta no `RowInfo`.

## 1.3.0

- **Detecção de conectividade no startup (`src/lib/connectivity.ts`).** A home agora faz um ping curto
  em `GET /api/ping` (rota nova no backend, responde `{"status":"ok"}` sem banco e sem token) com
  **timeout explícito de 10s** via `AbortController`. Antes, sem servidor alcançável, a home ficava
  presa no spinner até o fetch da lista estourar o timeout padrão do RN (~1min) pra só então cair pro
  cache; agora decide em no máximo 10s e mostra os manhwas baixados direto.
- **Offline virou estado explícito.** O aviso "Offline" só some quando o usuário toca nele
  (`tryReconnect`, que drena a fila e refaz a lista) ou quando o app é fechado e reaberto — nesse caso
  a home refaz o `checkConnectivity()` no startup. Enquanto o app está em modo offline, os refreshes
  automáticos da lista (ex.: ao voltar do leitor) servem o cache local sem tentar o servidor, em vez de
  ficarem pendurados num fetch que vai falhar e fazerem o botão piscar.

## 1.2.4

- **Corrige crash de render do leitor.** O `useEffect` de pré-cálculo (1.2.2) usava `pages` na dep
  array, mas o `useMemo` que cria `pages` estava declarado DEPOIS dele no corpo do componente — a dep
  array é avaliada durante o render, então batia TDZ (`ReferenceError`) toda vez que o `CbzReader`
  renderizava. O `useMemo` foi movido pra antes do efeito.
- **Corrige o botão de descer (↓) do leitor.** Era um `scrollToOffset` animado único pro offset final,
  o que não funciona com a FlatList virtualizada: ela só mantém ~3 viewports montadas, o conteúdo à
  frente ainda não existe/não foi medido, e o scroll morria no meio ou engasgava enquanto as páginas
  decodificavam. Agora o botão usa o MESMO motor de scroll progressivo do restore (`stepScrollTo`):
  empurra em etapas até a borda do conteúdo já montado, o que força a FlatList a montar a próxima
  leva, e repete até haver conteúdo suficiente pro pouso final — que é animado (salta pra ~1 viewport
  antes do alvo e anima só o último trecho), então o resultado é suave. Vale online e offline.
- **Fallback quando o pré-cálculo não terminou.** Se `totalContentHeightRef` ainda é 0 (ou o
  `RNImage.getSize` falhou), o alvo fica indefinido e o scroll empurra até o conteúdo **parar de
  crescer** (fim real), aí resolve pelo `contentHeightRef` da própria FlatList — em vez de fazer um
  scroll cego pra um offset errado.
- **Renderização em boost temporário.** Durante scroll automático, `windowSize` 3→9,
  `maxToRenderPerBatch` 1→3 e `updateCellsBatchingPeriod` 100→30 pras levas virem rápido; revertido
  assim que o scroll termina (com reafirmação do offset), então a leitura manual continua com a
  janela apertada e o consumo de memória não sobe.
- **Capítulo volta a ser marcado como lido depois do botão de descer.** O gate era "todas as páginas
  decodificaram", que nunca acontece quando você pula páginas. Agora também aceita "a FlatList
  alcançou ≥98% da altura total pré-calculada".
- Scroll automático agora roda em `InteractionManager.runAfterInteractions` (não compete com o mount
  da FlatList) e é cancelável por token — arrasto do usuário, botão de subir, troca de capítulo e
  fechar o leitor abortam na hora. Enquanto ele roda, a marcação de "lido" fica suspensa, pra os
  pulos intermediários não marcarem o capítulo no meio do caminho.
- O restore de scroll ao abrir um capítulo passou a usar o mesmo motor (mesma correção de suavidade).

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
