# Changelog (mobile)

Versões entregues via `eas update` (branch `preview`). Bumpar `APP_VERSION` em
`src/lib/version.ts` a cada entrega (NÃO mexer no `expo.version` do `app.json`
— ver `AGENTS.md`).

## 1.5.13

- **Excluir um manhwa apaga também o que estava baixado dele.** Antes o `DELETE` só apagava no
  servidor: capítulos, capa e entrada do índice ficavam no aparelho para sempre, e invisíveis, porque a
  tela de Downloads lista a partir do servidor. Manhwas excluídos por fora (web) e sem capítulo baixado
  também têm capa e dados locais esquecidos quando a home carrega a lista. Os que ainda têm capítulos
  baixados são mantidos.
- **Sobras de download são limpas na inicialização.** Quando o app morria baixando, ficavam pastas de
  capítulo fora do índice (`.cbz` parcial + páginas). Antes só saíam ao abrir a tela de Downloads. Agora
  saem no startup, sem nunca tocar em capítulo que o índice lista como baixado. Também saem as sobras da
  medição de páginas remotas do leitor em `cacheDir`.
- **Capítulo baixado entra no índice na hora**, não só no fim do manhwa: se o app morrer no meio de
  "Baixar tudo", o que já baixou fica salvo em vez de virar sobra no disco.
- **Download para antes de encher o aparelho:** reserva de 500MB livres.
- **Teto no cache de imagens** (páginas remotas e capas): o Glide já limita a 250MB; o app mede no
  startup e ao fechar o leitor e limpa tudo se passar de 300MB.
- Apagar downloads e limpar expirados agora roda fora da thread JS (antes podia travar a UI). Falha ao
  ler o índice não grava mais um índice vazio por cima do real nem faz uma limpeza apagar tudo.

## 1.5.12

- **Leitor devolve a memória de imagem ao trocar de capítulo, ao fechar e ao fim da abertura.** O
  Glide só solta o bitmap de uma página quando a view nativa dela é destruída, e o Fabric aplica essa
  remoção no frame seguinte. O `Image.clearMemoryCache()` que rodava no unmount (e de novo no mount do
  capítulo seguinte) passava na frente, então limpava o cache antes de as páginas saírem, e o que elas
  devolviam ao bitmap pool ficava retido. Agora toda liberação passa por `releaseImageMemory`, que
  limpa na hora e de novo 1s depois, com as views já destruídas. Ela roda no unmount (fechar, trocar de
  capítulo, saída externa) e no fim do boost do restore/"ir pro fim", quando a janela volta de 18 pra 3
  telas. O cache em disco dos capítulos baixados não é tocado.
- **Nada do scroll automático sobrevive ao unmount.** Os sleeps do `stepScrollTo` e o
  `runAfterInteractions` do "ir pro fim" agora morrem na hora com o token (antes o loop seguia até
  360ms e o callback ainda rodava depois de fechar). Os timers do toast são limpos no unmount, e o
  `RemoteImageSizeProbe` encerra as medições pendentes ao ser descartado (antes um worker ficava até
  15s preso no timeout). O unmount também zera tamanhos, ids e alturas das páginas.
- **Boost e overlay sempre voltam ao normal.** Todo fim de scroll automático passa por
  `stopAutoScroll`/`finishAutoScroll`. Corrige o overlay do "ir pro fim" sumindo quando um toque
  anterior no botão terminava por cima do novo.
- **Logs `[reader]` com memória:** a saída (`fechar`, `trocar capítulo #id/atual → próximo`,
  `desmontar`) e o boost mostram páginas montadas, decodificadas e o tamanho estimado dos bitmaps
  (~MB), além do heap JS. A liberação loga `memória de imagem liberada (motivo)`.

## 1.5.11

- **Capítulos anteriores aparecem como lidos ao avançar, inclusive offline.** Terminar o capítulo N
  agora marca 1..N-1 no cache local na hora (`markChapterReadLocal` usa o snapshot da lista). Antes,
  só o próprio N entrava, e os anteriores dependiam de abrir a lista online de novo. O card também
  conta como lido tudo até o `current_chapter` da home, e o drain da fila offline alinha o local
  quando o servidor aceita a leitura.
- **O servidor decide o que está lido.** O `GET /files` passou a mandar `read` em cada capítulo
  (inclui os marcados automaticamente pelo backend). A reconciliação online usa esse campo em vez de
  reescrever o set pra `1..current_chapter`. Assim, voltar pra reler um capítulo antigo não apaga
  mais da lista os capítulos já lidos depois dele. O capítulo em andamento continua não lido e
  continua sendo baixado.

## 1.5.10

- **Corrige a RAM subindo até estourar ao abrir capítulos (principalmente baixados).** O pré-cálculo
  de alturas do leitor usava `RNImage.getSize`, que no Android decodifica a página inteira no Fresco
  (800×10000 ≈ 32MB por página), 6 por vez e mais quando o timeout de 2s soltava o worker com o
  decode ainda rodando no nativo. O resultado ficava num cache de memória que nada liberava: nem o
  `Image.clearMemoryCache()` do expo-image (que só limpa o Glide), nem fechar o leitor. Agora as
  dimensões são lidas só do **cabeçalho** de cada imagem (`src/lib/image-size.ts`: JPEG, PNG, GIF,
  WebP e BMP), sem decodificar nada. Capítulo baixado lê alguns KB do disco por página; capítulo
  remoto baixa cada página pra um temporário, mede e apaga (o mesmo tráfego de antes, sem decode,
  com timeout de 15s e concorrência 3).
- **Páginas baixadas sem disk cache do Glide.** Com `cachePolicy="disk"`, cada página local
  decodificada era re-encodada em JPEG q100 no cache do Glide (CPU, I/O e buffers nativos a cada
  página montada). Páginas `file://` agora usam `cachePolicy="none"`; as remotas continuam em `disk`.
- **"Ir pro fim" tocado duas vezes não derruba mais o boost do scroll novo.** O scroll antigo,
  cancelado, desligava a janela de renderização ampliada do scroll que o substituiu.
- **Logs `[reader]` pro logcat:** abrir, pré-cálculo, boost ligado/desligado, trocar capítulo e
  fechar, com páginas montadas e decodificadas.

## 1.5.9

- **Home ordena pelos manhwas lidos mais recentemente.** Antes a ordenação usava
  `max(leitura local, m.updated_at)`, e o `updated_at` do manhwa muda com qualquer alteração (sync de
  capítulos, `total_chapters`), então um manhwa sincronizado depois passava na frente de um recém-lido.
  Agora o servidor expõe `last_read_at` (`MAX(ChapterProgress.updated_at)`) em `GET /api/manhwas` e a
  home usa `max(lastReadMap local, last_read_at)`. Nunca lidos vão pro fim, com desempate por `id`
  decrescente. A ordenação do filtro "Top 30" não mudou. Requer o backend atualizado (sem ele,
  `last_read_at` não vem e a ordem cai só na leitura local).

## 1.5.8

- **Card da home volta a mostrar o total de capítulos ("Cap: 10 / 300").** O `total_chapters` ficava
  `null` no banco pra manhwas cuja criação/importação não preencheu o campo, então o card só exibia o
  capítulo atual. Agora `GET /api/manhwas/{id}/files` devolve `total_chapters` (contagem dos `.cbz`
  listados) e, ao abrir a lista de capítulos, o `ManhwaCard` dispara um `PUT /api/manhwas/{id}` em
  background quando esse número difere do que está no banco — sem bloquear a abertura da lista e sem
  alarme se falhar. Só online (offline a lista é só a dos baixados, não o total). O PUT manda o
  `current_chapter` pelo maior entre o snapshot da home e o valor fresco do servidor, pra sincronizar o
  total nunca regredir progresso de leitura.

## 1.5.7

- **Remove o delete de capítulo do leitor.** O botão de lixeira adicionado na toolbar do
  `CbzReader.tsx` (introduzido na 1.5.6) foi removido por completo — junto com o handler
  `handleDeleteChapter`, o estado `isLocalChapter` (usado só pra controlar a visibilidade desse
  botão) e os imports `Trash2` e `deleteChapterLocal` que só serviam a essa função. Deletar
  capítulos baixados continua existindo apenas na tela de Downloads (lixeira por capítulo na lista
  expandida de cada manhwa), que já cobria esse fluxo corretamente.

## 1.5.6

- **Deletar capítulo individual direto no leitor.** Toolbar do leitor (`CbzReader.tsx`) ganhou um
  botão de lixeira ao lado do X de fechar, visível só quando o capítulo aberto está baixado
  localmente. Confirma com `Alert` destrutivo ("Deletar capítulo X?"), chama `deleteChapterLocal`
  (mesmo caminho usado pela lixeira individual em Downloads) e fecha o leitor em seguida — igual ao
  botão voltar do Android. Erros (ex.: arquivo já removido) só logam, não quebram o fluxo.
- **Aviso de capítulo possivelmente corrompido em Downloads.** `getLocalChaptersDetailed` (`cache.ts`)
  agora expõe `possiblyCorrupted` (tamanho em disco abaixo de 100KB, mesmo limiar usado pra barrar
  `.cbz` quebrados no download). A lista expandida de capítulos na tela de Downloads mostra um badge
  "possivelmente corrompido" ao lado do número do capítulo nesses casos — só informativo, não apaga
  nada sozinho; sugere ao usuário deletar (lixeira já existente) e re-baixar.

## 1.5.5

- **Corrige teleporte pro final ao abrir capítulos baixados.** Às vezes, ao entrar num capítulo
  baixado pela primeira vez, o leitor "pulava" pro fim sem renderizar as páginas do meio — sair e
  reabrir resolvia. Causa: o restore progressivo (`stepScrollTo`) podia desistir (estagnação/limite de
  tentativas) SEM ter alcançado o offset salvo, mas mesmo assim fazia o pouso final nesse offset —
  como a FlatList não tem `getItemLayout`, ela clampava o scroll na borda do pouco conteúdo já
  renderizado, dando a impressão de "foi pro final" pulando o meio. Mais comum em capítulos baixados
  porque o pré-cálculo de altura (`RNImage.getSize` em `file://`) resolve quase instantâneo (disco, sem
  rede) — as páginas montam direto na altura real (geralmente bem maior que o fallback), consumindo
  mais rápido o orçamento de renderização da FlatList e aumentando a chance de estagnar antes da hora.
  Agora o pouso final trava no que foi PROVADAMENTE renderizado (`Math.min(alvo, altura medida)`) em
  vez de saltar pro offset salvo às cegas. Também: `savedScrollOffset` é sanitizado (valores
  inválidos/negativos viram 0) e `RNImage.getSize` valida `Number.isFinite` antes de usar o resultado.

## 1.5.4

- **Detecta e remove capítulos `.cbz` quebrados/incompletos.** Downloads interrompidos no meio
  (conexão caiu, disco cheio) deixavam um `.cbz` minúsculo que aparecia normalmente na lista e
  quebrava a leitura. Agora `downloadChapter` (`cache.ts`) checa o tamanho do `.cbz` baixado ANTES de
  extrair — abaixo de 100KB é tratado como quebrado, cai no cleanup que já existia (apaga
  `_chapter.cbz` + pasta do capítulo) e conta como erro no sync. O backend também para de listar
  esses arquivos em `/api/manhwas/{id}/files` (mesmo limiar de 100KB em `_scan_cbz_files`), então a
  home e a tela de Downloads nem chegam a oferecer esses capítulos pra baixar.

## 1.5.3

- **Deletar capítulos baixados individualmente na tela de Downloads.** Antes só dava pra apagar TODOS
  os capítulos de um manhwa de uma vez (botão de lixeira no topo). Agora, tocando no título/linha de
  um manhwa com capítulos baixados, a linha expande e mostra a lista de capítulos locais (número,
  nome do arquivo e tamanho), cada um com seu próprio botão de apagar — útil pra remover um capítulo
  específico corrompido/bugado sem perder o resto do download.
- Novas funções em `cache.ts`: `getLocalChaptersDetailed` (lista capítulos + tamanho em disco de um
  manhwa) e `deleteChapterLocal` (apaga um capítulo específico do índice E do disco — diferente do
  `deleteChapterDirAsync` interno usado pelo trim/eviction, que só mexia no disco).
- O botão de apagar tudo (lixeira no topo de cada manhwa) continua funcionando como antes.

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
