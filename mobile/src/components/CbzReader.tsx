import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, TouchableOpacity, ActivityIndicator,
    FlatList, Dimensions, StyleSheet, Animated, BackHandler, Alert,
    InteractionManager,
} from 'react-native';
import { Image } from 'expo-image';
import { X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, CheckCircle, SkipForward } from 'lucide-react-native';
import { StatusBar, setStatusBarHidden } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { API_BASE } from '../lib/api';
import { getLocalChapter, markChapterReadLocal, saveLocalScroll, getLocalScroll, markManhwaRead } from '../lib/cache';
import { readImageSize, RemoteImageSizeProbe } from '../lib/image-size';
import { enqueueChapterRead, enqueueScroll } from '../lib/sync-queue';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ChapterFile {
    name: string;
    chapter_number: number;
}

interface CbzReaderProps {
    manhwaId: number;
    filename: string;
    chapterNumber?: number;
    files?: ChapterFile[];
    onClose: () => void;
    onChapterRead?: (chapterNumber: number, filename: string) => void;
    onNavigate?: (filename: string, chapterNumber: number) => void;
}

function extractChapterNumber(filename: string): number {
    const m = filename.match(/(?:cap(?:[ií]tulo)?\.?\s*|chapter\s*|ch\.?\s*|ep\.?\s*|#)(\d+(?:\.\d+)?)/i);
    if (m) return Math.floor(parseFloat(m[1]));
    const nums = filename.match(/(\d+(?:\.\d+)?)/g);
    if (nums && nums.length > 0) return Math.floor(parseFloat(nums[nums.length - 1]));
    return 0;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Distância em que o "ir pro fim" para ANTES do fim real. O `onScroll` dispara
// `handleEndReached` em `contentSize - 120`, então 220 deixa ~100 de folga pro
// overshoot do scroll animado — o botão aproxima do fim SEM marcar como lido.
const END_SAFE_GAP = 220;

// Parâmetros de renderização da FlatList.
// - Normal: janela apertada. Páginas de manhwa podem ser MUITO altas
//   (800×10000 → 5x a viewport); manter várias montadas enche a memória, o GC
//   roda em loop e o fps despenca.
// - Boost: usado SÓ durante scroll automático (restore / ir pro fim), enquanto
//   precisamos que a FlatList monte as próximas levas o mais rápido possível.
//   É revertido assim que o scroll termina, pra memória voltar ao normal.
//   9 (v1.2.4) não bastava pro "ir pro fim": o `stepScrollTo` desistia
//   (stagnant) com a lista ainda tendo dezenas de páginas não-montadas —
//   janela pequena demais pra acompanhar o empurrão. 18 é um trade-off:
//   custa mais memória ENQUANTO o boost dura (curto, alguns segundos, com
//   overlay cobrindo a tela), mas garante decodificar quase tudo antes de
//   parar. Nunca fica assim durante leitura normal.
const WINDOW_NORMAL = 3;
const WINDOW_BOOST = 18;
const BATCH_NORMAL = 1;
const BATCH_BOOST = 5;
const BATCH_PERIOD_NORMAL = 100;
const BATCH_PERIOD_BOOST = 20;

// Fração da altura total pré-calculada (`totalContentHeightRef`) que conta
// como "praticamente tudo renderizado". Critério de saída EXTRA do
// `stepScrollTo`, além de "alcançou o offset alvo" — sem ele, o loop podia
// sair só por ter empurrado o offset até o alvo (que já é ANTES do fim real,
// por causa do `END_SAFE_GAP`), com muitas páginas seguintes ainda não
// montadas pela FlatList.
const RENDER_COMPLETE_RATIO = 0.95;

// Tolerância de "conteúdo parou de crescer" (ticks sem crescimento) antes do
// `stepScrollTo` desistir. Quando o alvo é um valor CONHECIDO (não-null —
// tipicamente `totalContentHeightRef` pré-calculado), damos mais fôlego: a
// FlatList pode só estar decodificando imagens grandes, não necessariamente
// travada, e sabemos exatamente aonde queremos chegar. Quando o alvo é
// desconhecido (fallback: espera o conteúdo parar de crescer pra DEFINIR o
// alvo), o próprio stagnation JÁ é o sinal de "chegou" — esperar mais não
// ajuda, só atrasa.
const STAGNANT_LIMIT_KNOWN_TARGET = 15;
const STAGNANT_LIMIT_FALLBACK = 8;

/**
 * Token de cancelamento de um scroll automático em andamento (restore ou "ir
 * pro fim"). `onCancel` junta o que tem que morrer junto com ele (sleeps
 * pendentes e o handle do `InteractionManager`), e `cancelScrollToken` dispara
 * tudo NA HORA: o loop do `stepScrollTo` acorda, vê o cancelamento e sai, em
 * vez de deixar `setTimeout`s vivos depois do unmount segurando o closure do
 * capítulo fechado.
 */
type ScrollToken = { cancelled: boolean; onCancel: Set<() => void> };

function newScrollToken(): ScrollToken {
    return { cancelled: false, onCancel: new Set() };
}

function cancelScrollToken(token: ScrollToken): void {
    if (token.cancelled) return;
    token.cancelled = true;
    token.onCancel.forEach(fn => fn());
    token.onCancel.clear();
}

/** Espera `ms`, mas resolve na hora (e limpa o timer) se o token for cancelado. */
function tokenSleep(token: ScrollToken, ms: number): Promise<void> {
    if (token.cancelled) return Promise.resolve();
    return new Promise(resolve => {
        const wake = () => {
            clearTimeout(timer);
            token.onCancel.delete(wake);
            resolve();
        };
        const timer = setTimeout(wake, ms);
        token.onCancel.add(wake);
    });
}

const toMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(0);

/** Heap JS do Hermes pros logs `[reader]` (`''` se a VM não expõe). */
function jsHeapSuffix(): string {
    const hermes = (globalThis as {
        HermesInternal?: { getInstrumentedStats?: () => Record<string, number | string> };
    }).HermesInternal;
    const allocated = hermes?.getInstrumentedStats?.().js_allocatedBytes;
    return typeof allocated === 'number' ? `, js ${toMB(allocated)} MB` : '';
}

// Liberação da memória de imagem do leitor (fechar, trocar de capítulo, fim do
// boost). O Glide do expo-image só solta o bitmap de uma página quando a view
// nativa dela é destruída (`OnViewDestroys` → `requestManager.clear`), e o que
// cabe no bitmap pool vai pra lá em vez de ser reciclado. Ao desmontar, o
// Fabric só ENFILEIRA a remoção das views (aplicada no próximo frame do
// Choreographer), enquanto `Image.clearMemoryCache()` vira um Runnable na fila
// MAIN que costuma rodar ANTES: limpava o pool antes de as páginas saírem, e o
// que elas soltavam em seguida ficava retido. Por isso limpa de novo depois que
// as views já foram destruídas. O timer é de módulo de propósito: sobrevive ao
// unmount, mas não referencia nada do leitor.
const RELEASE_SETTLE_MS = 1000;
let pendingRelease: ReturnType<typeof setTimeout> | null = null;

function releaseImageMemory(reason: string, detail = ''): void {
    Image.clearMemoryCache().catch(() => {});
    if (pendingRelease) clearTimeout(pendingRelease);
    pendingRelease = setTimeout(() => {
        pendingRelease = null;
        Image.clearMemoryCache()
            .then(ok => console.log(
                `[reader] memória de imagem liberada (${reason})${detail ? ` — ${detail}` : ''}` +
                (ok ? '' : ' [sem activity: cache não limpo]')
            ))
            .catch(() => {});
    }, RELEASE_SETTLE_MS);
}

/**
 * Página única do leitor — componente isolado e memoizado pra que o `onLoad` de
 * UMA imagem NÃO re-renderize a lista inteira. Antes, `aspectRatios` ficava no
 * estado do CbzReader: cada imagem decodificada disparava `setState` → o pai
 * re-renderizava → `renderItem` virava nova função → o FlatList recriava todos
 * os itens visíveis. Em chapters com páginas muito altas (tipo 800×10000),
 * várias `onLoad` enfileiradas no fim do scroll viravam freeze. Agora cada
 * Page tem o próprio estado; o pai só sabe "carregou" via ref + callback.
 */
interface ReaderPageProps {
    id: string;
    url: string;
    initialRatio: number;
    onToggleUI: () => void;
    /** Tamanho do bitmap DECODIFICADO (intrinsic do drawable do Glide). */
    onLoaded: (id: string, width: number, height: number) => void;
    onMountChange: (id: string, mounted: boolean) => void;
}
const ReaderPage = React.memo(function ReaderPage({ id, url, initialRatio, onToggleUI, onLoaded, onMountChange }: ReaderPageProps) {
    const [ratio, setRatio] = useState(initialRatio);
    const height = SCREEN_WIDTH / ratio;
    // Contagem de páginas montadas pros logs `[reader]`: a memória de bitmap do
    // leitor é proporcional a quantas estão montadas ao mesmo tempo.
    useEffect(() => {
        onMountChange(id, true);
        return () => onMountChange(id, false);
    }, [id, onMountChange]);
    return (
        <TouchableOpacity activeOpacity={1} onPress={onToggleUI}>
            <Image
                source={{ uri: url }}
                style={{ width: SCREEN_WIDTH, height }}
                contentFit="contain"
                // Nunca cache de MEMÓRIA (bitmap retention). Disco só pra remota:
                // evita baixar de novo ao remontar. Página baixada (`file://`) já
                // ESTÁ no disco — com "disk" o Glide (DiskCacheStrategy.AUTOMATIC,
                // que pra dado local cacheia o resource transformado) re-encodava
                // cada página decodificada em JPEG q100 no cache dele: CPU, I/O e
                // buffers nativos a cada página montada, pra gerar uma cópia maior
                // que o original.
                cachePolicy={url.startsWith('file://') ? 'none' : 'disk'}
                recyclingKey={id}
                transition={0}
                allowDownscaling
                // priority baixa: imagens decodificam serializadas em vez de
                // todas concorrendo pela CPU — menos pico de GC.
                priority="low"
                onLoad={(e) => {
                    const { width, height } = e.source;
                    if (width && height) {
                        setRatio(width / height);
                        onLoaded(id, width, height);
                    }
                }}
            />
        </TouchableOpacity>
    );
});

export default function CbzReader({ manhwaId, filename, chapterNumber, files, onClose, onChapterRead, onNavigate }: CbzReaderProps) {
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showUI, setShowUI] = useState(true);
    const [reachedEnd, setReachedEnd] = useState(false);
    const [markedAsRead, setMarkedAsRead] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [allPagesLoaded, setAllPagesLoaded] = useState(false);
    const [savedScrollOffset, setSavedScrollOffset] = useState(0);
    const [localPageUri, setLocalPageUri] = useState<((page: number) => string) | null>(null);
    // `restoring`: roda o scroll progressivo até atingir `savedScrollOffset`.
    // Durante essa fase a UI fica coberta pelo spinner (pra esconder as
    // páginas "passando rápido") e a `FlatList` renderiza só uns poucos itens
    // por vez (memória baixa). Ao terminar, libera a UI no offset correto.
    const [restoring, setRestoring] = useState(false);
    // `autoScrolling`: scroll automático do botão "ir pro fim" em andamento.
    // Compartilha o overlay com `restoring` (esconde as páginas passando).
    const [autoScrolling, setAutoScrolling] = useState(false);
    // `renderBoost`: sobe temporariamente a janela de renderização da FlatList
    // durante scroll automático. Ver WINDOW_BOOST.
    const [renderBoost, setRenderBoost] = useState(false);

    const insets = useSafeAreaInsets();
    const flatListRef = useRef<FlatList>(null);
    const hasMarkedRef = useRef(false);
    const userHasInteracted = useRef(false);
    const scrollSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingScrollOffset = useRef<number | null>(null);
    // Altura atual do conteúdo renderizado pela FlatList. Atualizada pelo
    // onContentSizeChange. Usada pelo restore progressivo pra saber quando
    // já há conteúdo suficiente pra atingir o offset salvo.
    const contentHeightRef = useRef(0);
    // Altura da viewport da FlatList (capturada pelo onLayout). Usada pelo
    // botão "ir pro fim" pra calcular um offset que pare ANTES do gatilho
    // de marca-como-lido (`contentSize - 120` no onScroll).
    const viewportHeightRef = useRef(0);
    // Pré-cálculo em background: mede TODAS as páginas lendo só o cabeçalho
    // (`image-size.ts`, sem decodificar). Quando termina, alimenta o `totalContentHeightRef`
    // → o botão "ir pro fim" passa a usar o total exato em vez do estimado
    // pela FlatList. Não interfere no mount da FlatList nem no restore
    // (esses seguem o caminho da v1.1.12 — progressivo).
    const totalContentHeightRef = useRef(0);
    // Espelha `totalPages` num ref pra `stepScrollTo` (useCallback com deps
    // vazias, refeito só quando muda de identidade) ler o valor atual sem
    // precisar recriar a função a cada carregamento de capítulo.
    const totalPagesRef = useRef(0);
    // Token do scroll automático em andamento (restore OU "ir pro fim").
    // Enquanto não-null, o `handleEndReached` fica suspenso — senão os pulos
    // intermediários (que encostam na borda do conteúdo já montado) marcariam
    // o capítulo como lido no meio do caminho.
    const autoScrollTokenRef = useRef<ScrollToken | null>(null);
    // Caches mutáveis fora do render: alterar não re-renderiza.
    const aspectRatiosRef = useRef<Record<string, number>>({});
    const loadedIdsRef = useRef<Set<string>>(new Set());
    // Só pros logs `[reader]`: páginas montadas AGORA e, entre elas, os bytes
    // do bitmap das que já decodificaram (≈ memória de imagem em uso pelo
    // leitor, liberada quando a página desmonta). `loadedIdsRef` é outra coisa:
    // todas que já decodificaram neste capítulo.
    const mountedIdsRef = useRef<Set<string>>(new Set());
    const decodedBytesRef = useRef<Map<string, number>>(new Map());
    const prevRenderBoostRef = useRef(false);
    // Retrato da memória tirado NA AÇÃO de sair (fechar/trocar). O log em si
    // sai no unmount, que cobre também saídas externas (`closeReader`).
    const exitRef = useRef<{ reason: string; to: string; stats: string; detail: string } | null>(null);
    // Timers de UI (toast): limpos no unmount; `later()` vira no-op depois dele
    // (o callback de um `Animated` pode chegar com o leitor já desmontado).
    const uiTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
    const unmountedRef = useRef(false);

    const memStats = useCallback(() => {
        let bytes = 0;
        decodedBytesRef.current.forEach(b => { bytes += b; });
        return `montadas ${mountedIdsRef.current.size}, decodificadas ${decodedBytesRef.current.size} ` +
            `(~${toMB(bytes)} MB de bitmap), já decodificadas ${loadedIdsRef.current.size}/${totalPagesRef.current}` +
            jsHeapSuffix();
    }, []);

    const snapshotExit = useCallback((reason: string, to = '') => {
        let bytes = 0;
        decodedBytesRef.current.forEach(b => { bytes += b; });
        exitRef.current = {
            reason,
            to: to ? ` → ${to}` : '',
            stats: memStats(),
            detail: `~${toMB(bytes)} MB de bitmap em ${decodedBytesRef.current.size} páginas`,
        };
    }, [memStats]);

    const later = useCallback((fn: () => void, ms: number) => {
        if (unmountedRef.current) return;
        const t = setTimeout(() => {
            uiTimersRef.current.delete(t);
            fn();
        }, ms);
        uiTimersRef.current.add(t);
    }, []);

    const handlePageMount = useCallback((id: string, mounted: boolean) => {
        if (mounted) {
            mountedIdsRef.current.add(id);
        } else {
            mountedIdsRef.current.delete(id);
            decodedBytesRef.current.delete(id);
        }
    }, []);

    // Scroll automático: TODO caminho de saída passa por um destes três, e é o
    // que garante que o `renderBoost` (janela 18) volta pra `WINDOW_NORMAL`.
    // Declarados aqui em cima porque entram na dep array de hooks abaixo
    // (avaliada no render — declarar depois = TDZ).
    /** Cancela o scroll automático em andamento (se houver), sem mexer na UI. */
    const cancelAutoScroll = useCallback(() => {
        const token = autoScrollTokenRef.current;
        autoScrollTokenRef.current = null;
        if (token) cancelScrollToken(token);
    }, []);

    /** Para tudo: toque do usuário, topo, fechar, trocar de capítulo. */
    const stopAutoScroll = useCallback(() => {
        cancelAutoScroll();
        setRestoring(false);
        setAutoScrolling(false);
        setRenderBoost(false);
    }, [cancelAutoScroll]);

    /**
     * Fim natural de um scroll automático (o `finally` dele). Só mexe na UI se
     * ninguém assumiu depois: um "ir pro fim" tocado de novo põe outro token no
     * ref, e o overlay/boost passam a ser dele. Antes o `finally` do scroll
     * substituído escondia o overlay do novo.
     */
    const finishAutoScroll = useCallback((token: ScrollToken) => {
        if (autoScrollTokenRef.current === token) autoScrollTokenRef.current = null;
        if (autoScrollTokenRef.current) return;
        setRestoring(false);
        setAutoScrolling(false);
        setRenderBoost(false);
    }, []);

    // Fechar pelo X ou pelo voltar do Android — mesmo caminho, mesmo log.
    const handleClose = useCallback(() => {
        snapshotExit('fechar');
        stopAutoScroll();
        onClose();
    }, [snapshotExit, stopAutoScroll, onClose]);

    // Modo imersivo: oculta status bar + barra de navegação ao abrir o reader
    // (tela limpa) e restaura ao fechar. Como o reader agora é renderizado na
    // raiz (sem Modal), isso vale pra janela única da activity.
    useEffect(() => {
        // Reset pro caso de o StrictMode (dev) simular unmount + mount.
        unmountedRef.current = false;
        exitRef.current = null;
        // O Set só é mutado, nunca trocado: a cópia é o mesmo objeto do ref.
        const uiTimers = uiTimersRef.current;
        setStatusBarHidden(true, 'fade');
        NavigationBar.setVisibilityAsync('hidden');
        NavigationBar.setBehaviorAsync('overlay-swipe');
        // Botão voltar do Android fecha o leitor (antes era o onRequestClose do Modal).
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            handleClose();
            return true;
        });
        // Unmount = fechar, trocar de capítulo (o `ReaderHost` remonta por key)
        // ou saída externa. Único ponto de saída do leitor.
        return () => {
            setStatusBarHidden(false, 'fade');
            NavigationBar.setVisibilityAsync('visible');
            sub.remove();
            unmountedRef.current = true;
            uiTimers.forEach(clearTimeout);
            uiTimers.clear();
            if (!exitRef.current) snapshotExit('desmontar');
            const exit = exitRef.current!;
            console.log(`[reader] ${exit.reason} #${manhwaId}/${filename}${exit.to} — ${exit.stats}`);
            // Zera o estado do capítulo: se algum closure ainda pendente (fetch
            // de scroll, flush do último offset) segurar estes refs, segura
            // containers vazios em vez de tamanhos/ids de todas as páginas.
            aspectRatiosRef.current = {};
            loadedIdsRef.current = new Set();
            mountedIdsRef.current = new Set();
            decodedBytesRef.current = new Map();
            totalContentHeightRef.current = 0;
            contentHeightRef.current = 0;
            // As views das páginas morrem no próximo frame (Fabric); a liberação
            // limpa agora e de novo depois disso (ver `releaseImageMemory`).
            releaseImageMemory(exit.reason, exit.detail);
        };
    }, []);

    // Animated value for header show/hide
    const headerOpacity = useRef(new Animated.Value(1)).current;
    const headerTranslateY = useRef(new Animated.Value(0)).current;
    // FABs (subir/descer) compartilham `headerOpacity` mas têm translate
    // próprio: o header desliza pra cima ao sumir, os FABs (no rodapé)
    // deslizam pra baixo.
    const fabTranslateY = useRef(new Animated.Value(0)).current;
    const toastOpacity = useRef(new Animated.Value(0)).current;
    const toastTranslateY = useRef(new Animated.Value(-16)).current;

    const currentIndex = files?.findIndex(f => f.name === filename) ?? -1;
    const prevChapter = files && currentIndex > 0 ? files[currentIndex - 1] : null;
    const nextChapter = files && currentIndex >= 0 && currentIndex < files.length - 1 ? files[currentIndex + 1] : null;
    // chapNum = POSIÇÃO real do capítulo na lista completa (chapter_number),
    // não o índice na lista (que offline contém só os baixados). É esse valor
    // que vai pro servidor como current_chapter.
    const currentFile = files && currentIndex >= 0 ? files[currentIndex] : undefined;
    const chapNum = currentFile?.chapter_number ?? chapterNumber ?? extractChapterNumber(filename);

    useEffect(() => { totalPagesRef.current = totalPages; }, [totalPages]);

    // Load chapter info + saved scroll position
    useEffect(() => {
        setLoading(true);
        // Cancela qualquer scroll automático do capítulo anterior e devolve a
        // FlatList aos parâmetros normais de renderização.
        stopAutoScroll();
        setReachedEnd(false);
        setMarkedAsRead(false);
        setAllPagesLoaded(false);
        hasMarkedRef.current = false;
        userHasInteracted.current = false;
        setSavedScrollOffset(0);
        setLocalPageUri(null);
        aspectRatiosRef.current = {};
        loadedIdsRef.current = new Set();
        totalContentHeightRef.current = 0;
        // A memória de imagem do capítulo anterior é liberada pelo unmount
        // dele (`releaseImageMemory`). Um `clearMemoryCache()` aqui rodava no
        // mesmo instante, antes de o Fabric destruir as views antigas, e não
        // soltava nada.

        // "Último lido" = abrir o capítulo (mesmo sem terminar) → manhwa vai pro
        // topo da home na hora, inclusive offline.
        markManhwaRead(manhwaId).catch(() => {});

        const fetchInfo = async () => {
            try {
                // 1. Info do chapter: local first, server apenas se não-baixado
                const local = await getLocalChapter(manhwaId, filename);
                const isLocal = local.available && !!local.totalPages && !!local.getPageUri;

                if (isLocal) {
                    setTotalPages(local.totalPages!);
                    setLocalPageUri(() => local.getPageUri!);
                    console.log(`[reader] abrir #${manhwaId}/${filename} — ${local.totalPages} páginas (baixado)${jsHeapSuffix()}`);
                } else {
                    // Não-baixado: precisa do servidor pras páginas
                    const res = await fetch(`${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}`);
                    const data = await res.json();
                    setTotalPages(data.total_pages);
                    console.log(`[reader] abrir #${manhwaId}/${filename} — ${data.total_pages} páginas (remoto)${jsHeapSuffix()}`);
                }

                // Scroll: merge local + server. Vence quem está MAIS adiantado.
                // - Server > Local: vai pro server, atualiza local.
                // - Local > Server: vai pro local, empurra pro server (enfileira se falhar).
                // - Offline: usa local; a fila já cuida do push ao reconectar.
                // Sanitiza: um valor corrompido/negativo/não-finito (storage
                // pisado, resposta malformada) viraria o `target` do restore
                // progressivo e o levaria pra uma posição sem sentido.
                const sanitizeOffset = (v: unknown): number =>
                    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;

                const localScroll = sanitizeOffset(await getLocalScroll(manhwaId, filename));
                let serverScroll: number | null = null;
                // `updated_at` do banco: usado pra carimbar o valor local quando
                // adotamos o do servidor (ver saveLocalScroll).
                let serverScrollAt: string | null = null;
                try {
                    const scrollRes = await fetch(
                        `${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}/scroll`
                    );
                    if (scrollRes.ok) {
                        const scrollData = await scrollRes.json();
                        serverScroll = sanitizeOffset(scrollData.scroll_position);
                        serverScrollAt = scrollData.updated_at ?? null;
                    }
                } catch {
                    serverScroll = null;
                }

                if (serverScroll === null) {
                    if (localScroll > 0) setSavedScrollOffset(localScroll);
                } else if (serverScroll > localScroll) {
                    setSavedScrollOffset(serverScroll);
                    // Carimba com a data do SERVIDOR: o valor é dele, e datar com
                    // `now` faria o local vencer comparações futuras sem merecer.
                    saveLocalScroll(manhwaId, filename, serverScroll, serverScrollAt ?? undefined).catch(() => {});
                } else if (localScroll > serverScroll) {
                    setSavedScrollOffset(localScroll);
                    try {
                        const res = await fetch(
                            `${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}/scroll`,
                            {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ scroll_position: localScroll }),
                            }
                        );
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    } catch {
                        enqueueScroll(manhwaId, filename, localScroll).catch(() => {});
                    }
                } else if (localScroll > 0) {
                    setSavedScrollOffset(localScroll);
                }
            } catch (error) {
                console.error('Erro ao carregar CBZ:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchInfo();
    }, [manhwaId, filename, stopAutoScroll]);

    // Memoiza a lista de páginas: evita recriar um array de N itens a cada
    // render (ex.: a cada imagem que carrega) e mantém a referência estável
    // pro FlatList não reprocessar tudo.
    // ⚠️ Precisa ficar ANTES do efeito de pré-cálculo: `pages` entra na dep
    // array dele, que é avaliada durante o render (TDZ se declarado depois).
    const pages = useMemo(
        () => Array.from({ length: totalPages }, (_, i) => ({
            id: i.toString(),
            url: localPageUri
                ? localPageUri(i)
                : `${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}/page/${i}`,
        })),
        [totalPages, localPageUri, manhwaId, filename]
    );

    // Pré-cálculo em BACKGROUND: mede TODAS as páginas lendo só o CABEÇALHO
    // de cada imagem (`image-size.ts`) — nenhum pixel é decodificado. Quando
    // termina, popula `totalContentHeightRef` (usado pelo botão "ir pro fim")
    // e `aspectRatiosRef` (cada ReaderPage já monta na altura final). Falhas
    // são silenciosas: o leitor continua funcionando com estimativas.
    // 🚨 NÃO voltar pro `RNImage.getSize`: no Android ele decodifica a página
    // INTEIRA no Fresco e segura o bitmap num cache que nada libera — era a
    // causa da RAM subindo a cada capítulo aberto (ver `image-size.ts`).
    useEffect(() => {
        if (loading || totalPages === 0 || pages.length === 0) return;

        let cancelled = false;
        const isLocal = localPageUri !== null;
        // Remoto: o backend não serve só o cabeçalho, então cada medição baixa a
        // página pra um temporário (ver `RemoteImageSizeProbe`).
        const probe = isLocal ? null : new RemoteImageSizeProbe();
        const measure = (url: string) => (probe ? probe.measure(url) : readImageSize(url));

        (async () => {
            const t0 = Date.now();
            const FALLBACK_RATIO = 0.7;
            const heights: number[] = new Array(pages.length).fill(SCREEN_WIDTH / FALLBACK_RATIO);
            let measured = 0;

            // Local = alguns KB lidos do disco, barato. Remoto = página inteira
            // baixada por medição: menos concorrência pra não disputar banda com
            // as páginas que o usuário está vendo.
            const CONCURRENCY = isLocal ? 6 : 3;
            let next = 0;

            const worker = async () => {
                while (!cancelled) {
                    const i = next++;
                    if (i >= pages.length) return;
                    try {
                        const size = await measure(pages[i].url);
                        if (cancelled) return;
                        // Arquivo `file://` ainda sendo escrito/indexado já foi
                        // observado devolvendo 0/NaN — mantém o fallback em vez de
                        // contaminar `totalContentHeightRef`.
                        if (size && Number.isFinite(size.w) && Number.isFinite(size.h) && size.w > 0 && size.h > 0) {
                            heights[i] = (SCREEN_WIDTH * size.h) / size.w;
                            aspectRatiosRef.current[i.toString()] = size.w / size.h;
                            measured++;
                        }
                    } catch {
                        // mantém fallback
                    }
                }
            };

            try {
                await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
            } finally {
                probe?.dispose();
            }
            if (cancelled) return;

            totalContentHeightRef.current = heights.reduce((s, v) => s + v, 0);
            console.log(
                `[reader] pré-cálculo #${manhwaId}/${filename}: ${measured}/${pages.length} páginas medidas ` +
                `em ${Date.now() - t0}ms (${isLocal ? 'cabeçalho local' : 'remoto'})`
            );
        })();

        return () => {
            cancelled = true;
            probe?.dispose();
        };
    }, [loading, totalPages, pages, localPageUri, manhwaId, filename]);

    /**
     * Scroll progressivo tolerante à virtualização — base do restore E do
     * botão "ir pro fim".
     *
     * A FlatList só mantém `windowSize` viewports montadas, então um
     * `scrollToOffset` ÚNICO pra um offset muito à frente é CLAMPADO na altura
     * já renderizada: o scroll morre no meio do caminho (e, animado, ainda dá a
     * sensação de travo). A saída é empurrar em etapas: a cada passo vamos até
     * a borda do conteúdo já montado, o que força a FlatList a montar a próxima
     * leva; o `onContentSizeChange` atualiza `contentHeightRef` e repetimos até
     * haver conteúdo suficiente pro salto final.
     *
     * `getTarget()` pode devolver `null` = "alvo ainda desconhecido": nesse caso
     * empurramos até o conteúdo parar de crescer (fim real) e só então
     * resolvemos o alvo por `resolveTarget()`.
     */
    const stepScrollTo = useCallback(async (
        token: ScrollToken,
        getTarget: () => number | null,
        opts: {
            /** Alvo final quando `getTarget()` nunca resolveu. */
            resolveTarget?: () => number;
            /** Última etapa animada (pouso suave). */
            animatedFinal?: boolean;
            /** Aborta se o usuário tocar/arrastar (usado pelo restore). */
            abortOnUserScroll?: boolean;
            /**
             * Exige RENDER_COMPLETE_RATIO da altura total pré-calculada antes
             * de aceitar "alcancei o alvo" — usado pelo "ir pro fim", que
             * precisa da lista quase inteira montada/decodificada ao parar.
             * O restore NÃO usa isso: ele só precisa cobrir o offset salvo
             * (que pode ser bem menor que o capítulo inteiro), não o fim.
             */
            requireNearFullRender?: boolean;
        } = {},
    ): Promise<number | null> => {
        // Cancelar o token acorda o sleep na hora (sem timer pendente).
        const sleep = (ms: number) => tokenSleep(token, ms);
        const aborted = () => token.cancelled || (opts.abortOnUserScroll === true && userHasInteracted.current);

        let stagnant = 0;
        let attempts = 0;
        const MAX_ATTEMPTS = 160;

        while (!aborted() && attempts < MAX_ATTEMPTS) {
            const target = getTarget();
            const prevHeight = contentHeightRef.current;
            const knownTotal = totalContentHeightRef.current;

            // Critério de saída duplo: (a) já empurramos o offset até o alvo
            // (+ 1 viewport de folga, senão o scroll clampa antes de chegar) E
            // (b), quando pedido, a FlatList já tem RENDER_COMPLETE_RATIO da
            // altura total pré-calculada montada. Sem (b), o loop podia sair só
            // por ter alcançado o alvo do "ir pro fim" — que já é ANTES do fim
            // real por causa do `END_SAFE_GAP` — com dezenas de páginas
            // seguintes ainda não montadas pela FlatList.
            const reachedTarget = target !== null && prevHeight >= target + viewportHeightRef.current;
            const nearFullyRendered =
                !opts.requireNearFullRender || knownTotal <= 0 || prevHeight >= knownTotal * RENDER_COMPLETE_RATIO;
            if (reachedTarget && nearFullyRendered) break;

            const edge = Math.max(prevHeight - SCREEN_WIDTH * 0.5, 0);
            const pushTo = target === null ? edge : Math.min(edge, target);
            flatListRef.current?.scrollToOffset({ offset: pushTo, animated: false });
            attempts++;

            // A cada poucos ticks, força a FlatList a montar um índice BEM à
            // frente do viewport atual: `scrollToOffset` sozinho só empurra a
            // borda do que já foi renderizado (avança devagar, meia tela por
            // tick); `scrollToIndex` faz a lista computar/montar um índice
            // específico mesmo fora da janela atual (estimativa por altura
            // média — sem `getItemLayout` pode não acertar o pixel exato, mas
            // já força a montagem). Só faz sentido quando queremos a lista
            // inteira renderizada (requireNearFullRender) e já sabemos o total
            // de páginas + altura média (pré-cálculo pronto).
            if (
                opts.requireNearFullRender &&
                attempts % 3 === 0 &&
                knownTotal > 0 &&
                totalPagesRef.current > 0
            ) {
                const avgPageHeight = knownTotal / totalPagesRef.current;
                const approxIndex = Math.min(Math.floor(prevHeight / avgPageHeight), totalPagesRef.current - 1);
                const nudgeIndex = Math.min(approxIndex + 10, totalPagesRef.current - 1);
                try {
                    flatListRef.current?.scrollToIndex({ index: nudgeIndex, animated: false, viewPosition: 0 });
                } catch {
                    // Índice fora do alcance estimado (sem getItemLayout) —
                    // ignora, o próximo scrollToOffset progressivo já cobre.
                }
                await sleep(60);
                if (aborted()) return null;
                // Volta pro offset progressivo: o nudge foi só pra forçar a
                // montagem de itens à frente, não pra mudar a posição visível.
                flatListRef.current?.scrollToOffset({ offset: pushTo, animated: false });
            }

            await sleep(90);

            if (contentHeightRef.current <= prevHeight + 4) {
                // Conteúdo parou de crescer: ou chegamos ao fim real, ou a
                // decodificação empacou. Com alvo CONHECIDO (não-null) damos
                // mais fôlego — pode só estar decodificando imagens grandes, e
                // sabemos exatamente aonde queremos chegar; sem alvo (fallback,
                // esperando o conteúdo estabilizar pra definir o alvo) a
                // estagnação em si já É o sinal de "chegou", esperar mais só
                // atrasa.
                stagnant++;
                const stagnantLimit = target !== null ? STAGNANT_LIMIT_KNOWN_TARGET : STAGNANT_LIMIT_FALLBACK;
                if (stagnant > stagnantLimit) break;
            } else {
                stagnant = 0;
            }
        }

        if (aborted()) return null;

        const target = getTarget() ?? opts.resolveTarget?.() ?? null;
        if (target === null) return null;

        // O loop pode ter saído SEM alcançar `target` (estagnação ou
        // MAX_ATTEMPTS) — o conteúdo montado (`contentHeightRef.current`) fica
        // aquém dele. Saltar pro `target` mesmo assim seria pedir um offset
        // ALÉM do que a FlatList já mediu: sem `getItemLayout`, ela clampa o
        // scroll na borda do contentSize atual — ou seja, aterrissa no fim do
        // POUCO que renderizou, dando a impressão de "foi pro final" enquanto
        // pula tudo que ficaria no meio (o bug fica mais visível em capítulos
        // baixados: o pré-cálculo em `file://` (cabeçalho lido do disco) resolve
        // quase instantâneo, então páginas montam já na altura REAL — muitas
        // vezes bem mais alta que o fallback — e cada `windowSize` cobre menos
        // páginas em contagem, aumentando a chance de estagnar antes de
        // alcançar o offset salvo). Trava o pouso no que está PROVADAMENTE
        // renderizado em vez do alvo aspiracional.
        const safeTarget = Math.min(target, Math.max(contentHeightRef.current, 0));

        if (opts.animatedFinal) {
            // Pouso suave: salta (sem animação) pra ~1 viewport antes do alvo —
            // já com o conteúdo montado — e faz só o último trecho animado.
            const runway = Math.max(safeTarget - viewportHeightRef.current * 0.8, 0);
            flatListRef.current?.scrollToOffset({ offset: runway, animated: false });
            await sleep(60);
            if (aborted()) return null;
            flatListRef.current?.scrollToOffset({ offset: safeTarget, animated: true });
            await sleep(360);
        } else {
            await sleep(40);
            flatListRef.current?.scrollToOffset({ offset: safeTarget, animated: false });
            await sleep(120);
            if (aborted()) return null;
            flatListRef.current?.scrollToOffset({ offset: safeTarget, animated: false });
        }

        return aborted() ? null : safeTarget;
    }, []);

    // Restore scroll progressivo até `savedScrollOffset`. Roda com o overlay
    // por cima (esconde as páginas passando) e com `renderBoost` ligado, pra as
    // levas da FlatList virem rápido; ambos são desligados ao terminar.
    useEffect(() => {
        if (loading || totalPages === 0) return;
        if (savedScrollOffset <= 0) return;

        const token = newScrollToken();
        autoScrollTokenRef.current = token;
        setRestoring(true);
        setRenderBoost(true);
        contentHeightRef.current = 0;

        // `runAfterInteractions` deixa o mount da FlatList terminar antes de
        // começarmos a empurrar o scroll — senão o primeiro tick é desperdiçado.
        const handle = InteractionManager.runAfterInteractions(() => {
            (async () => {
                await tokenSleep(token, 80);
                try {
                    await stepScrollTo(token, () => savedScrollOffset, { abortOnUserScroll: true });
                } finally {
                    // Só derruba overlay/boost se ninguém mais estiver
                    // auto-scrollando (ex.: usuário tocou no FAB "descer"
                    // durante o restore).
                    finishAutoScroll(token);
                }
            })();
        });
        // Cancelado antes de rodar (toque, "ir pro fim", unmount): o callback
        // nem chega a rodar. Quem cancelou já cuida da UI.
        token.onCancel.add(() => handle.cancel());

        return () => {
            cancelScrollToken(token);
            if (autoScrollTokenRef.current === token) autoScrollTokenRef.current = null;
            setRestoring(false);
            setRenderBoost(false);
        };
    }, [loading, totalPages, savedScrollOffset, stepScrollTo, finishAutoScroll]);

    // Log de cada transição do boost. O "desligado" sai ANTES da FlatList
    // encolher a janela, então mostra o pico de páginas montadas do scroll
    // automático; um boost que nunca desliga aparece como "ligado" sem par.
    useEffect(() => {
        if (prevRenderBoostRef.current === renderBoost) return;
        prevRenderBoostRef.current = renderBoost;
        console.log(`[reader] boost ${renderBoost ? 'ligado' : 'desligado'} — ${memStats()}`);
        // Fim do scroll automático (o "fim da abertura", no caso do restore): a
        // janela volta de 18 pra 3 viewports e as páginas de fora desmontam —
        // limpa o que elas devolverem pro pool do Glide.
        if (!renderBoost) releaseImageMemory('fim do boost');
    }, [renderBoost, memStats]);

    // Auto-hide header after 3s
    useEffect(() => {
        if (!showUI) return;
        const timer = setTimeout(() => {
            setShowUI(false);
            animateHeader(false);
        }, 3000);
        return () => clearTimeout(timer);
    }, [showUI]);

    const animateHeader = (visible: boolean) => {
        Animated.parallel([
            Animated.timing(headerOpacity, {
                toValue: visible ? 1 : 0,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.timing(headerTranslateY, {
                toValue: visible ? 0 : -60,
                duration: 250,
                useNativeDriver: true,
            }),
            Animated.timing(fabTranslateY, {
                toValue: visible ? 0 : 24,
                duration: 250,
                useNativeDriver: true,
            }),
        ]).start();
    };

    const showToastAnimation = () => {
        toastOpacity.setValue(0);
        toastTranslateY.setValue(-16);
        Animated.parallel([
            Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(toastTranslateY, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => {
            later(() => {
                Animated.parallel([
                    Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
                    Animated.timing(toastTranslateY, { toValue: -16, duration: 400, useNativeDriver: true }),
                ]).start();
            }, 2500);
        });
    };

    const markChapterAsRead = useCallback(async () => {
        if (hasMarkedRef.current || chapNum <= 0) return;
        hasMarkedRef.current = true;
        setMarkedAsRead(true);

        // 1. Move local pending → cached (sempre, mesmo offline)
        markChapterReadLocal(manhwaId, filename).catch(err =>
            console.warn('[cache] markChapterReadLocal:', err)
        );

        // 2. UI feedback imediato (filename também, pra rastreamento per-chapter no card)
        onChapterRead?.(chapNum, filename);
        setShowToast(true);
        showToastAnimation();
        later(() => setShowToast(false), 3500);

        // 3. Sincroniza com servidor; enfileira se offline/falhar
        try {
            const res = await fetch(`${API_BASE}/api/manhwas/${manhwaId}/current-chapter`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_chapter: chapNum }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (error) {
            console.warn('[sync] PATCH current-chapter falhou, enfileirando:', error);
            enqueueChapterRead(manhwaId, chapNum).catch(err =>
                console.warn('[sync] enqueueChapterRead:', err)
            );
        }
    }, [manhwaId, chapNum, filename, onChapterRead, later]);

    // Cada Page chama isto ao decodificar. Mantemos contagem num ref (não força
    // re-render) e só damos UM setState quando bate o total — antes era uma
    // re-render por imagem, que freezava chapters com páginas gigantes.
    const handlePageLoaded = useCallback((id: string, width: number, height: number) => {
        aspectRatiosRef.current[id] = width / height;
        // `onLoad` pode chegar depois do unmount da página — não conta essa.
        // ARGB_8888: 4 bytes/pixel (bitmap de hardware ocupa o mesmo na GPU).
        if (mountedIdsRef.current.has(id)) decodedBytesRef.current.set(id, width * height * 4);
        if (loadedIdsRef.current.has(id)) return;
        loadedIdsRef.current.add(id);
        if (totalPages > 0 && loadedIdsRef.current.size >= totalPages) {
            setAllPagesLoaded(true);
        }
    }, [totalPages]);

    const handleEndReached = useCallback(() => {
        // Durante scroll automático os pulos intermediários encostam na borda do
        // conteúdo já montado — que NÃO é o fim do capítulo. Ignora.
        if (autoScrollTokenRef.current) return;
        // Só marca como lido quando o conteúdo já tem a altura FINAL. Senão,
        // enquanto as imagens carregam, o conteúdo fica curto e o "fim" dispara
        // antes de você ler de verdade. Duas formas de saber que chegou lá:
        //  a) todas as páginas decodificaram (`allPagesLoaded`) — leitura normal;
        //  b) o pré-cálculo (cabeçalho das imagens) já sabe a altura total e a
        //     FlatList alcançou ela. Necessário depois do botão "ir pro fim",
        //     que pula páginas e portanto nunca decodifica todas — sem isso o
        //     capítulo nunca era marcado como lido por esse caminho.
        const knownTotal = totalContentHeightRef.current;
        const heightSettled = knownTotal > 0 && contentHeightRef.current >= knownTotal * 0.98;
        if (totalPages > 0 && !loading && !reachedEnd && (allPagesLoaded || heightSettled)) {
            setReachedEnd(true);
            markChapterAsRead();
        }
    }, [totalPages, loading, reachedEnd, allPagesLoaded, markChapterAsRead]);

    const flushScrollPosition = useCallback((offset: number) => {
        const position = Math.floor(offset);
        // 1. Sempre persiste local (instantâneo, funciona offline)
        saveLocalScroll(manhwaId, filename, position).catch(() => {});
        // 2. Tenta servidor; se falhar, enfileira pra eventual sync
        (async () => {
            try {
                const res = await fetch(
                    `${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}/scroll`,
                    {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scroll_position: position }),
                    }
                );
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
            } catch {
                enqueueScroll(manhwaId, filename, position).catch(e =>
                    console.warn('[sync] enqueueScroll:', e)
                );
            }
        })();
    }, [manhwaId, filename]);

    const saveScrollPosition = useCallback((offset: number) => {
        if (!userHasInteracted.current) return;
        pendingScrollOffset.current = offset;
        if (scrollSaveTimeout.current) clearTimeout(scrollSaveTimeout.current);
        scrollSaveTimeout.current = setTimeout(() => {
            pendingScrollOffset.current = null;
            flushScrollPosition(offset);
        }, 500);
    }, [flushScrollPosition]);

    // Garante que o ÚLTIMO offset visto seja persistido (local + push pro servidor
    // / fila offline) ao fechar o leitor ou trocar de capítulo — antes o debounce
    // de 500ms podia ser engolido pela desmontagem, perdendo o final do scroll.
    useEffect(() => {
        return () => {
            // Nada de scroll automático sobrevivendo à desmontagem: cancelar o
            // token acorda os sleeps e cancela o handle do InteractionManager.
            cancelAutoScroll();
            if (scrollSaveTimeout.current) {
                clearTimeout(scrollSaveTimeout.current);
                scrollSaveTimeout.current = null;
            }
            if (pendingScrollOffset.current !== null) {
                const offset = pendingScrollOffset.current;
                pendingScrollOffset.current = null;
                flushScrollPosition(offset);
            }
        };
    }, [manhwaId, filename, flushScrollPosition, cancelAutoScroll]);

    const toggleUI = useCallback(() => {
        setShowUI(prev => {
            const next = !prev;
            animateHeader(next);
            return next;
        });
    }, []);

    const scrollToTop = useCallback(() => {
        stopAutoScroll();
        userHasInteracted.current = true;
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, [stopAutoScroll]);

    /**
     * Pula pra perto do fim SEM marcar como lido (para em `END_SAFE_GAP`).
     *
     * Antes isto era UM `scrollToOffset` animado pro offset final — e não
     * funcionava: a FlatList só tem ~`windowSize` viewports montadas, então o
     * offset era clampado na altura renderizada e o scroll parava no meio (ou
     * engasgava enquanto as páginas seguintes decodificavam). Agora é o mesmo
     * scroll progressivo do restore, com `requireNearFullRender` — exige quase
     * toda a lista montada antes de parar — e a janela de renderização em
     * boost (revertida no fim, pra não segurar memória durante a leitura).
     *
     * Alvo: `totalContentHeightRef` (pré-calculado pelo cabeçalho das imagens,
     * exato). Se o pré-cálculo ainda não terminou/falhou, o alvo fica `null` e
     * empurramos até o conteúdo parar de crescer — aí `contentHeightRef` (da
     * própria FlatList) é o fim real e serve de fallback.
     */
    const scrollToBottomSafe = useCallback(() => {
        cancelAutoScroll();
        const token = newScrollToken();
        autoScrollTokenRef.current = token;

        userHasInteracted.current = true;
        setAutoScrolling(true);
        setRenderBoost(true);

        const targetFromTotal = () => {
            const total = totalContentHeightRef.current;
            if (total <= 0) return null;
            return Math.max(total - viewportHeightRef.current - END_SAFE_GAP, 0);
        };
        const targetFromContent = () =>
            Math.max(contentHeightRef.current - viewportHeightRef.current - END_SAFE_GAP, 0);

        const handle = InteractionManager.runAfterInteractions(() => {
            (async () => {
                let landed: number | null = null;
                try {
                    landed = await stepScrollTo(token, targetFromTotal, {
                        resolveTarget: targetFromContent,
                        animatedFinal: true,
                        requireNearFullRender: true,
                    });
                    // Desliga o boost ANTES do ajuste final (ainda dentro do
                    // try, com o token vivo — um toque do usuário nesse
                    // meio-tempo continua podendo cancelar via cancelAutoScroll,
                    // que não depende do renderBoost). Desmontar os itens fora
                    // da janela apertada pode fazer a altura medida oscilar
                    // (volta a depender de espaçador em vez de medição real);
                    // reafirmar o offset DEPOIS disso garante que o pouso final
                    // já considera essa possível oscilação, em vez de "pular
                    // pra cima" quando a janela encolhe de novo.
                    // Só desliga se este ainda é o scroll automático ativo: um
                    // toque novo no botão cancela este token e põe outro no ref,
                    // e aí o boost é do scroll novo — desligar aqui o deixava
                    // rodando com a janela apertada.
                    if (autoScrollTokenRef.current === token) setRenderBoost(false);
                    if (landed !== null && !token.cancelled) {
                        await tokenSleep(token, 150);
                        if (token.cancelled) {
                            landed = null;
                        } else {
                            flatListRef.current?.scrollToOffset({ offset: landed, animated: false });
                        }
                    }
                } finally {
                    // O token só sai do ref no fim de tudo: enquanto ele está lá,
                    // `cancelAutoScroll` (arrasto do usuário) consegue abortar o
                    // ajuste final, e o `handleEndReached` fica suspenso.
                    finishAutoScroll(token);
                }

                // Dispara a checagem de "fim" manualmente: depois do pouso
                // automático não sobra nenhum onScroll do usuário pra acionar o
                // onEndReached da FlatList — sem isso, o capítulo só marcava
                // como lido quando o usuário tocava a tela depois. Só dispara
                // se o pouso terminou de verdade (não abortado por um toque no
                // meio do caminho) — código síncrono a partir daqui, sem await,
                // então não corre risco de um toque intercalar entre o clear do
                // token acima e esta chamada.
                if (landed !== null && !token.cancelled) {
                    handleEndReached();
                }
            })();
        });
        // Cancelado antes de rodar (toque, outro "ir pro fim", unmount): o
        // callback nem chega a rodar. Quem cancelou já cuida da UI.
        token.onCancel.add(() => handle.cancel());
    }, [cancelAutoScroll, stepScrollTo, handleEndReached, finishAutoScroll]);

    // Troca de capítulo = o `ReaderHost` remonta o leitor (key nova): este
    // desmonta inteiro no mesmo commit, antes de qualquer página do próximo
    // existir (elas só montam depois do carregamento assíncrono dele).
    const goToChapter = (file: ChapterFile) => {
        snapshotExit('trocar capítulo', file.name);
        stopAutoScroll();
        onNavigate?.(file.name, file.chapter_number);
    };

    // renderItem ESTÁVEL: depende só de toggleUI/handlePageLoaded/handlePageMount
    // (memoizados). Assim, quando o reader re-renderiza (toast, reachedEnd,
    // header), o FlatList não reprocessa os itens.
    const renderPage = useCallback(({ item }: { item: { id: string; url: string } }) => (
        <ReaderPage
            id={item.id}
            url={item.url}
            initialRatio={aspectRatiosRef.current[item.id] ?? 0.7}
            onToggleUI={toggleUI}
            onLoaded={handlePageLoaded}
            onMountChange={handlePageMount}
        />
    ), [toggleUI, handlePageLoaded, handlePageMount]);


    const renderFooter = () => {
        if (loading || totalPages === 0) return null;
        return (
            <View style={{ paddingVertical: 56, paddingHorizontal: 24, alignItems: 'center' }}>
                {/* Divider — igual à web */}
                <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 28 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />
                    <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 2, marginHorizontal: 12, textTransform: 'uppercase' }}>
                        Fim do capítulo
                    </Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />
                </View>

                {/* Navigation buttons */}
                <View style={{ flexDirection: 'row', gap: 12, width: '100%', maxWidth: 400 }}>
                    {prevChapter && (
                        <TouchableOpacity
                            onPress={() => goToChapter(prevChapter)}
                            style={styles.navBtnSecondary}
                        >
                            <ChevronLeft size={18} color="rgba(255,255,255,0.7)" />
                            <Text style={styles.navBtnSecondaryText}>Anterior</Text>
                        </TouchableOpacity>
                    )}
                    {nextChapter ? (
                        <TouchableOpacity
                            onPress={() => goToChapter(nextChapter)}
                            style={styles.navBtnPrimary}
                        >
                            <SkipForward size={18} color="#fff" />
                            <Text style={styles.navBtnPrimaryText}>Próximo Capítulo</Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.navBtnDisabled}>
                            <CheckCircle size={18} color="rgba(255,255,255,0.3)" />
                            <Text style={styles.navBtnDisabledText}>Último disponível</Text>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    return (
        <View style={styles.fullscreen}>
            <StatusBar hidden={true} />
            <View style={{ flex: 1, backgroundColor: '#000' }}>

                {/* Animated header with gradient fade */}
                <Animated.View
                    style={[
                        styles.header,
                        {
                            paddingTop: insets.top || 16,
                            opacity: headerOpacity,
                            transform: [{ translateY: headerTranslateY }],
                        },
                    ]}
                >
                    {/* Prev chapter */}
                    <TouchableOpacity
                        onPress={() => prevChapter && goToChapter(prevChapter)}
                        disabled={!prevChapter}
                        style={[styles.headerBtn, !prevChapter && { opacity: 0.25 }]}
                    >
                        <ChevronLeft size={20} color="white" />
                        <Text style={styles.headerBtnText}>Anterior</Text>
                    </TouchableOpacity>

                    {/* Chapter title */}
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {filename.replace('.cbz', '')}
                        {files && files.length > 0 && (
                            <Text style={styles.headerTitleSub}> ({currentIndex + 1}/{files.length})</Text>
                        )}
                    </Text>

                    {/* Next + Close */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
                        <TouchableOpacity
                            onPress={() => nextChapter && goToChapter(nextChapter)}
                            disabled={!nextChapter}
                            style={[styles.headerBtn, !nextChapter && { opacity: 0.25 }]}
                        >
                            <Text style={styles.headerBtnText}>Próximo</Text>
                            <ChevronRight size={20} color="white" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                            <X size={22} color="white" />
                        </TouchableOpacity>
                    </View>
                </Animated.View>

                {/* Toast — capítulo marcado como lido */}
                <Animated.View
                    style={[
                        styles.toast,
                        { top: (insets.top || 16) + 56, opacity: toastOpacity, transform: [{ translateY: toastTranslateY }] },
                    ]}
                    pointerEvents="none"
                >
                    <CheckCircle size={16} color="white" />
                    <Text style={styles.toastText}>Capítulo {chapNum} marcado como lido!</Text>
                </Animated.View>

                {/* Pages */}
                {loading ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator size="large" color="#ffffff" />
                    </View>
                ) : totalPages === 0 ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#6b7280' }}>Nenhuma página encontrada.</Text>
                    </View>
                ) : (
                    <>
                    <FlatList
                        ref={flatListRef}
                        data={pages}
                        keyExtractor={(item) => item.id}
                        showsVerticalScrollIndicator={false}
                        onEndReached={handleEndReached}
                        onEndReachedThreshold={0.3}
                        ListFooterComponent={renderFooter}
                        onScrollBeginDrag={() => {
                            userHasInteracted.current = true;
                            // Toque do usuário sempre ganha do scroll automático.
                            stopAutoScroll();
                        }}
                        onScroll={(e) => {
                            const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
                            saveScrollPosition(contentOffset.y);
                            // Marca "lido" ao chegar no fim — só depois de ter rolado
                            // (offset > 0) e com conteúdo de fato rolável, pra não
                            // disparar ao entrar no capítulo (conteúdo ainda curto).
                            if (
                                contentOffset.y > 0 &&
                                contentSize.height > layoutMeasurement.height &&
                                contentOffset.y + layoutMeasurement.height >= contentSize.height - 120
                            ) {
                                handleEndReached();
                            }
                        }}
                        scrollEventThrottle={250}
                        // Mantém `contentHeightRef` atualizado pra o restore
                        // progressivo saber quando há conteúdo suficiente pra
                        // dar o salto final no offset salvo.
                        onContentSizeChange={(_w, h) => { contentHeightRef.current = h; }}
                        onLayout={(e) => { viewportHeightRef.current = e.nativeEvent.layout.height; }}
                        // Evita a "tela preta" do Android: por padrão o FlatList
                        // clipa itens fora da tela e eles voltam em branco/preto.
                        removeClippedSubviews={false}
                        // Janela apertada durante a leitura: páginas de manhwa
                        // podem ser MUITO altas (800×10000 → 5x a viewport).
                        // Manter várias mounted ao mesmo tempo enche memória, GC
                        // roda em loop e o fps despenca. Só sobe (WINDOW_BOOST)
                        // enquanto um scroll automático precisa que as próximas
                        // levas montem rápido — e volta ao normal ao terminar.
                        windowSize={renderBoost ? WINDOW_BOOST : WINDOW_NORMAL}
                        initialNumToRender={2}
                        maxToRenderPerBatch={renderBoost ? BATCH_BOOST : BATCH_NORMAL}
                        updateCellsBatchingPeriod={renderBoost ? BATCH_PERIOD_BOOST : BATCH_PERIOD_NORMAL}
                        renderItem={renderPage}
                    />
                    {/* Overlay durante scroll automático (restore ou "ir pro
                        fim"): esconde o "flicker" das páginas passando rápido
                        até o offset alvo. `pointerEvents="none"` de propósito —
                        um arrasto do usuário chega na FlatList e cancela. */}
                    {(restoring || autoScrolling) && (
                        <View style={styles.restoringOverlay} pointerEvents="none">
                            <ActivityIndicator size="large" color="#ffffff" />
                        </View>
                    )}
                    </>
                )}

                {/* Scroll-to-top FAB — fica em cima na pilha (seta ↑) */}
                {!reachedEnd && (
                    <Animated.View
                        style={[
                            styles.scrollTopBtn,
                            {
                                bottom: (insets.bottom || 0) + 24 + 56,
                                opacity: headerOpacity,
                                transform: [{ translateY: fabTranslateY }],
                            },
                        ]}
                        pointerEvents={showUI ? 'auto' : 'none'}
                    >
                        <TouchableOpacity onPress={scrollToTop} style={styles.fabInner}>
                            <ChevronUp size={22} color="white" />
                        </TouchableOpacity>
                    </Animated.View>
                )}

                {/* Scroll-to-bottom FAB — pula pra perto do fim sem marcar como lido (seta ↓ embaixo) */}
                {!reachedEnd && (
                    <Animated.View
                        style={[
                            styles.scrollBottomBtn,
                            {
                                bottom: (insets.bottom || 0) + 24,
                                opacity: headerOpacity,
                                transform: [{ translateY: fabTranslateY }],
                            },
                        ]}
                        pointerEvents={showUI ? 'auto' : 'none'}
                    >
                        <TouchableOpacity onPress={scrollToBottomSafe} style={styles.fabInner}>
                            <ChevronDown size={22} color="white" />
                        </TouchableOpacity>
                    </Animated.View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    fullscreen: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000',
        zIndex: 1000,
        elevation: 1000,
    },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingBottom: 12,
        // Gradient via shadow effect — actual gradient needs LinearGradient but this gives a dark overlay
        backgroundColor: 'rgba(0,0,0,0.75)',
        borderBottomWidth: 0,
    },
    headerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    headerBtnText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 13,
    },
    headerTitle: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 13,
        fontWeight: '500',
        flex: 1,
        textAlign: 'center',
        marginHorizontal: 6,
    },
    headerTitleSub: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
    },
    closeBtn: {
        padding: 6,
        borderRadius: 20,
        marginLeft: 4,
    },
    toast: {
        position: 'absolute',
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(22,163,74,0.92)',
        zIndex: 20,
    },
    toastText: {
        color: 'white',
        fontSize: 13,
        fontWeight: '600',
    },
    navBtnSecondary: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    navBtnSecondaryText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
    },
    navBtnPrimary: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        backgroundColor: '#2563eb',
    },
    navBtnPrimaryText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
    navBtnDisabled: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    navBtnDisabledText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 14,
    },
    scrollTopBtn: {
        position: 'absolute',
        right: 20,
    },
    scrollBottomBtn: {
        position: 'absolute',
        right: 20,
    },
    fabInner: {
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        padding: 12,
        borderRadius: 28,
    },
    restoringOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 5,
    },
});
