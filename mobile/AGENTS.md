# Expo HAS CHANGED

This project uses **Expo SDK 54**. Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

When bumping the SDK, update both `mobile/package.json` (`"expo": "~XX.0.0"`) and this file at the same time.

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
- Marca como lido **só quando todas as páginas carregaram** (`aspectRatios.length >= totalPages`) e
  o usuário chega ao fim — evita marcar lido cedo enquanto as imagens ainda carregam.
- `removeClippedSubviews={false}` no FlatList (senão Android mostra "tela preta" em imagens altas).

## Cache local / leitura (`src/lib/cache.ts`)
- Índice em AsyncStorage por manhwa: `pending`/`cached` (entradas baixadas) + `read` (set de filenames lidos).
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
