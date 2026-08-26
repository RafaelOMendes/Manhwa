# Expo HAS CHANGED

This project uses **Expo SDK 54**. Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

When bumping the SDK, update both `mobile/package.json` (`"expo": "~XX.0.0"`) and this file at the same time.

## ⚠️ Versão do app + OTA (LER antes de bumpar versão)
A versão exibida na home vem de **`mobile/src/lib/version.ts` (`APP_VERSION`)** — uma constante no
**bundle JS**. Bumpe ELA a cada mudança; o `eas update` (OTA) a atualiza. NÃO usar
`Constants.expoConfig.version` (é gravada no build nativo e não muda via OTA).

🚨 **`app.json` `expo.version` FAZ PARTE do fingerprint** (`runtimeVersion: fingerprint`). Mudar ele
muda o `runtimeVersion` → o `eas update` passa a publicar pra um runtime que o APK instalado NÃO tem
→ o update **não chega**. Regras:
- Em update **só-JS** (`eas update`): **NÃO** toque no `expo.version` do `app.json`. Bumpe só o `version.ts`.
- `app.json` `expo.version` só muda junto com um **`eas build`**, e deve ficar **igual à build instalada**.
- Outras mudanças que também alteram o fingerprint e exigem rebuild: plugins, permissões, splash
  (`imageWidth` etc.), dependências nativas, qualquer coisa em `android`/`ios` do `app.json`.

Pra conferir se um update vai chegar: compare `eas update:list --branch preview` (runtimeVersion) com
o runtimeVersion da build em `eas build:list`. Se diferirem, ou rebuilda, ou reverte a mudança nativa
pra casar o fingerprint da build instalada.

---

# Arquitetura do app (mobile)

App de leitura de manhwa (Expo Router, NativeWind). Foco em **leitura offline**: capítulos são
baixados (.cbz extraído em páginas) e podem ser lidos sem internet. O backend (FastAPI em `../backend`)
serve a lista, os arquivos `.cbz` e o progresso (`current_chapter`).

## Telas / rotas (`src/app`)
- `index.tsx` — home (grid de manhwas, filtros). FAB de download abre menu **Sincronizar** / **Ver downloads** (animação só no submenu, via `Animated` nativo). FAB de adicionar.
- `downloads.tsx` — gerência de downloads: armazenamento usado, "falta baixar" (toque alterna caps/MB), Baixar tudo, download individual, barra de progresso ao vivo, remover (apaga só arquivos locais). Carrega pesado via `InteractionManager.runAfterInteractions` (abre instantâneo).
- `_layout.tsx` — Stack + `<ReaderHost/>` na raiz + side-effect import do `background-download`.

## Leitor (`src/components/CbzReader.tsx` + `src/lib/reader-store.ts` + `ReaderHost.tsx`)
- O leitor é renderizado **UMA vez na raiz** (`ReaderHost` no `_layout`), **NÃO** em `Modal`.
  Motivo: no Android o `Modal` é janela separada e ignora os comandos de esconder barras. Como View
  na raiz, o modo imersivo (`setStatusBarHidden` + `NavigationBar.setVisibilityAsync('hidden')`) vale
  pra activity. Telas abrem via `openReader(...)` do store; `navigateReader`/`closeReader` controlam.
- Botão voltar do Android fechado via `BackHandler` (não há mais `onRequestClose`).
- Páginas locais carregam 100% offline (file://); **nunca** toca no backend se o capítulo está baixado.
- Marca como lido quando o usuário chega ao fim **e o conteúdo já tem a altura final** — evita marcar
  lido cedo enquanto as imagens ainda carregam (o conteúdo fica curto e o "fim" dispara antes da hora).
  Duas formas de saber que a altura é a final: (a) todas as páginas decodificaram (`loadedIdsRef.size
  >= totalPages`) — leitura normal; (b) o pré-cálculo já sabe a altura total (`totalContentHeightRef`)
  e a FlatList alcançou ≥98% dela — necessário depois do botão "ir pro fim", que pula páginas e
  portanto **nunca** decodifica todas.
- `removeClippedSubviews={false}` no FlatList (senão Android mostra "tela preta" em imagens altas).
- **Scroll automático (`stepScrollTo`) — restore E botão "ir pro fim" usam o MESMO motor.** A FlatList
  só mantém `windowSize` viewports montadas, então **um `scrollToOffset` único pra um offset muito à
  frente não funciona**: o conteúdo à frente ainda não existe/não foi medido, o scroll morre no meio
  ou engasga enquanto as páginas decodificam. `stepScrollTo(token, getTarget, opts)` empurra em
  etapas — a cada tick vai até a borda do conteúdo já montado, o que força a FlatList a montar a
  próxima leva, o `onContentSizeChange` atualiza `contentHeightRef`, e repete até
  `contentHeight >= alvo + viewport`. Só então o salto/pouso final. Detalhes:
  - `getTarget()` pode devolver `null` = "alvo desconhecido ainda" (pré-cálculo não terminou): aí
    empurra até o conteúdo **parar de crescer** (fim real) e resolve pelo `resolveTarget()` de
    fallback (`contentHeightRef`). Não trava nem faz scroll cego.
  - `animatedFinal` salta sem animação pra ~1 viewport antes do alvo (conteúdo já montado) e faz só
    o último trecho animado → pouso suave sem depender de conteúdo não-renderizado.
  - Roda dentro de `InteractionManager.runAfterInteractions` pra não competir com o mount da FlatList.
- **`renderBoost`: janela de renderização temporária.** Durante scroll automático, `windowSize` 3→9,
  `maxToRenderPerBatch` 1→3 e `updateCellsBatchingPeriod` 100→30, pra as levas montarem rápido.
  **É revertido assim que o scroll termina** (e o offset é reafirmado depois, já que desmontar itens
  pode deslocar) — durante a leitura manual a janela apertada continua valendo, que é o que segura a
  memória com páginas de 800×10000.
- **Cancelamento por token.** `autoScrollTokenRef` guarda o scroll automático em andamento.
  `onScrollBeginDrag` (toque do usuário), `scrollToTop`, troca de capítulo e unmount cancelam.
  Enquanto o token existe, `handleEndReached` fica **suspenso** — senão os pulos intermediários (que
  encostam na borda do conteúdo montado, não no fim do capítulo) marcariam o capítulo como lido no meio.
- O botão "ir pro fim" para em `END_SAFE_GAP` (220px) **de propósito**: o `onScroll` marca como lido
  em `contentSize - 120`, então o botão te leva pra perto do fim sem marcar; o último trocinho de
  scroll é do usuário (e aí sim marca, via critério (b) acima).
- ⚠️ `pages` (useMemo) tem que ficar declarado **antes** do efeito de pré-cálculo — ele usa `pages` na
  dep array, que é avaliada durante o render (declarar depois = TDZ/`ReferenceError` a cada render).
- **Restaurar scroll = max(local, servidor).** Ao abrir um capítulo, lê o scroll local (AsyncStorage) E
  o do servidor (`GET .../scroll`) e usa o MAIOR. Se o local está mais adiantado, faz `PUT` (enfileira
  via `sync-queue` se falhar). Se o servidor está mais adiantado, atualiza o local. Offline → usa o local
  direto; o push pro servidor sai depois via `drainQueue`. Vale também pra capítulos baixados — eles
  CONSULTAM o servidor pra essa comparação (mas as páginas continuam 100% locais).
- **Flush de scroll no unmount.** `saveScrollPosition` tem debounce de 500ms; ao fechar o leitor ou
  trocar de capítulo, o cleanup do `useEffect` força o flush do último offset visto (local + servidor /
  fila) — antes o `setTimeout` pendente era engolido pela desmontagem e perdia o final do scroll.

## Cache local / leitura (`src/lib/cache.ts`)
- Índice em AsyncStorage por manhwa: `pending`/`cached` (entradas baixadas) + `read` (set de filenames lidos).
- **`withIndexLock()` serializa todo load→mutate→save do índice.** Como "Baixar tudo" roda vários
  manhwas em paralelo (`MANHWA_CONCURRENCY`), cada `syncManhwaLocal` faz DOIS ciclos curtos de
  load/save (reconciliação no início, commit no fim) em vez de segurar o índice inteiro carregado
  durante todo o download — sem isso, quem salvasse por último sobrescrevia o índice inteiro e
  apagava os `pending`/`cached` que outros manhwas tinham acabado de gravar (perda silenciosa,
  files no disco mas fora do índice). Os downloads de capítulo em si continuam 100% paralelos; só o
  load/save do índice é atômico. Qualquer nova função que faça load→mutate→save do índice deve
  passar pelo `withIndexLock`.
- Páginas extraídas em disco: `Paths.document/manhwas/{id}/{filename}/page_N.jpg` (+ `cover.jpg`).
- **Modelo de leitura é cumulativo, alinhado ao servidor** (`current_chapter` = posição na lista ordenada
  completa, 1-based — mesma convenção da web). `reconcileReadsWithServer()` reescreve o set `read` para
  `1..current_chapter` ao sincronizar e ao abrir online (drena a fila antes pra não regredir leitura
  offline ainda não enviada). Ler um cap anterior faz o progresso regredir (igual ao back).
- **Número do capítulo = POSIÇÃO na lista completa**, nunca o índice da lista filtrada (offline só tem
  os baixados). Offline a posição vem do índice no snapshot completo (`saveManhwaFiles`/`loadManhwaFiles`).
- `getStorageUsage()`/`getManhwaStorage()` varrem o disco (síncrono); evite chamar em excesso.

## Download (`src/lib/download-manager.ts` + `background-download.ts`)
- `download-manager`: store observável (`useDownloadProgress`) de progresso por manhwa (caps + MB).
  `downloadManhwa`/`downloadAll` chamam `syncManhwaLocal`. Só baixa capítulos **não lidos**.
- `background-download`: foreground service (Android) via **@notifee/react-native** com notificação de
  barra de progresso; download continua com o app fechado. Fila **dinâmica** (`startBackgroundDownload`):
  vários downloads individuais em paralelo, novos itens entram na fila durante a execução.
  notifee é carregado de forma **lazy/protegida** (try/catch) — sem o módulo nativo (Expo Go / build
  antigo), cai no download in-app sem quebrar.
- **Baixar é só pela tela de Downloads** (Baixar tudo / individual). O botão **Sincronizar** (home) faz
  APENAS o sync do servidor (`drainQueue` + `POST /download-all`), igual à web — NÃO baixa no celular.
- **Parar** (`stopBackgroundDownload` / `requestCancel`): esvazia a fila e cancela; o capítulo em
  andamento termina e é salvo, o resto é abortado (`syncManhwaLocal` checa `shouldCancel` entre caps).
  Status `cancelled` no store. Botão "Parar" aparece na tela de Downloads enquanto baixa.
- **Limpeza** (`cleanupCorrupted`): remove do disco o que está órfão/corrompido (pastas de manhwa/cap
  fora do índice, capítulos sem `page_0.jpg`, `_chapter.cbz` residual). Roda na tela de Downloads
  quando NÃO há download ativo — resolve o caso "X GB usado mas 0 baixado" de downloads interrompidos.
- Tela de Downloads carrega **progressivamente** (linhas aparecem conforme prontas) e lê o índice uma
  única vez (`getManhwasWithLocalData`) pra abrir rápido.
- ⚠️ **NÃO mexer no botão "Baixar tudo" (`downloads.tsx`) sem pedir permissão ao usuário.** O usuário
  ajustou manualmente as classes desse botão (ex.: `pb-2 ml-1`) pra centralização correta — alterar
  className/layout dele desalinha e empurra o texto. Pergunte antes de tocar nesse botão.

## Fila offline (`src/lib/sync-queue.ts`)
- Leituras/scroll feitos offline são enfileirados e drenados (`drainQueue`) ao reconectar / foreground /
  sincronizar. Dedupe por manhwa mantendo o MAIOR `chapNum`.

## Nativo / build
- **@notifee/react-native** é dependência nativa → exige **`eas build`** (não basta `eas update`).
- O notifee declara o foreground service como `shortService` (limite ~3 min no Android 14+). O config
  plugin `plugins/withNotifeeForegroundServiceType.js` sobrescreve para `dataSync` (downloads longos).
  Permissões em `app.json`: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `POST_NOTIFICATIONS`, `WAKE_LOCK`.
- Perfil que gera **APK**: `preview` (`eas build -p android --profile preview`). `production` gera `.aab`.
- **Regra prática:** mudou só JS/TS → `eas update --branch preview` (abrir/fechar/reabrir o app aplica).
  Mudou dependência nativa, `app.json` ou plugins → `eas build`.
- `runtimeVersion` é `fingerprint`: um update OTA só chega num build com o mesmo fingerprint.

## Performance
- `ManhwaCard` e `Checkbox` são `React.memo`; callbacks passados (ex.: `fetchManhwas`) usam `useCallback`
  pra não re-renderizar a grade inteira a cada toque.

## Entregar via `eas update` (autorizado pro Claude)
O usuário liberou rodar `eas update` automaticamente para mudanças **só-JS/TS**. Procedimento por entrega:

1. Bumpar `APP_VERSION` em `mobile/src/lib/version.ts` (ex.: `1.1.10` → `1.1.11`).
   - Patch (`x.y.Z`) pra fix/ajuste; minor (`x.Y.0`) pra feature.
   - NÃO mexer no `expo.version` do `app.json` (fingerprint — quebra o update).
2. Documentar a mudança no topo do `mobile/CHANGELOG.md`, na nova versão.
3. Rodar do diretório `mobile/`:

   ```bash
   eas update --branch preview --message "vX.Y.Z: <resumo curto>"
   ```

4. Reportar a URL/ID do update no fim.

Quando NÃO rodar automaticamente (pedir antes):
- Mudou dependência nativa, plugin, `app.json` (qualquer campo), permissões, splash, ícones, ou
  qualquer arquivo em `android/` ou `ios/` → exige `eas build`, não `eas update`. Sempre confirmar.
- Branch diferente de `preview` (ex.: `production`) → confirmar.
- Rollback / republish / mudanças em segredos do EAS → confirmar.
