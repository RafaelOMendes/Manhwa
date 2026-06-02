import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, TouchableOpacity, ActivityIndicator,
    FlatList, Dimensions, StyleSheet, Animated, BackHandler,
} from 'react-native';
import { Image } from 'expo-image';
import { X, ChevronUp, ChevronLeft, ChevronRight, CheckCircle, SkipForward } from 'lucide-react-native';
import { StatusBar, setStatusBarHidden } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { API_BASE } from '../lib/api';
import { getLocalChapter, markChapterReadLocal, saveLocalScroll, getLocalScroll, markManhwaRead } from '../lib/cache';
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
    onLoaded: (id: string, ratio: number) => void;
}
const ReaderPage = React.memo(function ReaderPage({ id, url, initialRatio, onToggleUI, onLoaded }: ReaderPageProps) {
    const [ratio, setRatio] = useState(initialRatio);
    const height = SCREEN_WIDTH / ratio;
    return (
        <TouchableOpacity activeOpacity={1} onPress={onToggleUI}>
            <Image
                source={{ uri: url }}
                style={{ width: SCREEN_WIDTH, height }}
                contentFit="contain"
                // cachePolicy="disk": SEM cache de memória. Reduz bitmap retention.
                // O disco já garante leitura instantânea em re-mount.
                cachePolicy="disk"
                recyclingKey={id}
                transition={0}
                allowDownscaling
                // priority baixa: imagens decodificam serializadas em vez de
                // todas concorrendo pela CPU — menos pico de GC.
                priority="low"
                onLoad={(e) => {
                    const { width, height } = e.source;
                    if (width && height) {
                        const r = width / height;
                        setRatio(r);
                        onLoaded(id, r);
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
    // Caches mutáveis fora do render: alterar não re-renderiza.
    const aspectRatiosRef = useRef<Record<string, number>>({});
    const loadedIdsRef = useRef<Set<string>>(new Set());

    // Modo imersivo: oculta status bar + barra de navegação ao abrir o reader
    // (tela limpa) e restaura ao fechar. Como o reader agora é renderizado na
    // raiz (sem Modal), isso vale pra janela única da activity.
    useEffect(() => {
        setStatusBarHidden(true, 'fade');
        NavigationBar.setVisibilityAsync('hidden');
        NavigationBar.setBehaviorAsync('overlay-swipe');
        // Botão voltar do Android fecha o leitor (antes era o onRequestClose do Modal).
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            onClose();
            return true;
        });
        return () => {
            setStatusBarHidden(false, 'fade');
            NavigationBar.setVisibilityAsync('visible');
            sub.remove();
            // Reader fechado → libera bitmaps grandes pra Home/Downloads não
            // herdarem a pressão de memória do último capítulo lido.
            Image.clearMemoryCache().catch(() => {});
        };
    }, []);

    // Animated value for header show/hide
    const headerOpacity = useRef(new Animated.Value(1)).current;
    const headerTranslateY = useRef(new Animated.Value(0)).current;
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

    // Load chapter info + saved scroll position
    useEffect(() => {
        setLoading(true);
        setRestoring(false);
        setReachedEnd(false);
        setMarkedAsRead(false);
        setAllPagesLoaded(false);
        hasMarkedRef.current = false;
        userHasInteracted.current = false;
        setSavedScrollOffset(0);
        setLocalPageUri(null);
        aspectRatiosRef.current = {};
        loadedIdsRef.current = new Set();
        // Libera os bitmaps decodificados do capítulo anterior: chapters de
        // manhwa têm páginas gigantes e a memory cache do expo-image segura
        // referências mesmo após o ReaderHost remontar. Sem isso, fps cai
        // progressivamente conforme você troca de cap.
        Image.clearMemoryCache().catch(() => {});

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
                } else {
                    // Não-baixado: precisa do servidor pras páginas
                    const res = await fetch(`${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}`);
                    const data = await res.json();
                    setTotalPages(data.total_pages);
                }

                // Scroll: merge local + server. Vence quem está MAIS adiantado.
                // - Server > Local: vai pro server, atualiza local.
                // - Local > Server: vai pro local, empurra pro server (enfileira se falhar).
                // - Offline: usa local; a fila já cuida do push ao reconectar.
                const localScroll = (await getLocalScroll(manhwaId, filename)) ?? 0;
                let serverScroll: number | null = null;
                try {
                    const scrollRes = await fetch(
                        `${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}/scroll`
                    );
                    if (scrollRes.ok) {
                        const scrollData = await scrollRes.json();
                        serverScroll = scrollData.scroll_position ?? 0;
                    }
                } catch {
                    serverScroll = null;
                }

                if (serverScroll === null) {
                    if (localScroll > 0) setSavedScrollOffset(localScroll);
                } else if (serverScroll > localScroll) {
                    setSavedScrollOffset(serverScroll);
                    saveLocalScroll(manhwaId, filename, serverScroll).catch(() => {});
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
    }, [manhwaId, filename]);

    // Restore scroll progressivo guiado por `contentHeightRef`. A FlatList só
    // renderiza itens dentro da janela atual de scroll; pra cobrir um offset
    // alto sem inflar `initialNumToRender` (= memória), empurramos o scroll
    // pro fim do conteúdo renderizado a cada tick — isso força a FlatList a
    // mountar a próxima leva, o `onContentSizeChange` atualiza a altura, e o
    // ciclo se repete até `contentHeight >= savedScrollOffset + viewport`.
    // SÓ ENTÃO fazemos o salto final pro offset exato (senão o scroll clampa
    // antes do alvo e a posição fica errada — bug que vinha quebrando o
    // "voltar pro ponto certo").
    useEffect(() => {
        if (loading || totalPages === 0) return;
        if (savedScrollOffset <= 0) return;

        let cancelled = false;
        setRestoring(true);
        contentHeightRef.current = 0;

        (async () => {
            const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
            // FlatList monta sua primeira batch + dispara o 1º onContentSizeChange.
            await sleep(80);

            const TARGET_WITH_MARGIN = savedScrollOffset + SCREEN_WIDTH * 0.6;
            let stagnant = 0;
            let attempts = 0;
            const MAX_ATTEMPTS = 80; // ~8s no pior caso

            while (
                !cancelled &&
                !userHasInteracted.current &&
                contentHeightRef.current < TARGET_WITH_MARGIN &&
                attempts < MAX_ATTEMPTS
            ) {
                const prevHeight = contentHeightRef.current;
                // Empurra o scroll pro fim do conteúdo atual — força a janela
                // de virtualização a descer e a próxima leva de itens montar.
                const pushTo = Math.min(
                    Math.max(prevHeight - SCREEN_WIDTH * 0.5, 0),
                    savedScrollOffset
                );
                flatListRef.current?.scrollToOffset({ offset: pushTo, animated: false });

                await sleep(100);
                attempts++;

                // Detecta capítulo mais curto que o offset salvo (fim atingido):
                // se o conteúdo parou de crescer por várias tentativas, sai.
                if (contentHeightRef.current <= prevHeight + 4) {
                    stagnant++;
                    if (stagnant > 6) break;
                } else {
                    stagnant = 0;
                }
            }

            // Salto final, agora que há conteúdo suficiente.
            if (!cancelled && !userHasInteracted.current) {
                await sleep(40);
                flatListRef.current?.scrollToOffset({ offset: savedScrollOffset, animated: false });
                // Segunda passada pra absorver últimas mudanças de altura
                // (imagens grandes ainda decodificando) — a FlatList re-layouta
                // e o offset pode "deslizar" um pouco; reaplicar fixa.
                await sleep(120);
                if (!cancelled && !userHasInteracted.current) {
                    flatListRef.current?.scrollToOffset({ offset: savedScrollOffset, animated: false });
                }
            }

            if (!cancelled) setRestoring(false);
        })();

        return () => {
            cancelled = true;
            setRestoring(false);
        };
    }, [loading, totalPages, savedScrollOffset]);

    // Auto-hide header after 3s
    useEffect(() => {
        if (!showUI) return;
        const timer = setTimeout(() => animateHeader(false), 3000);
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
        ]).start();
    };

    const showToastAnimation = () => {
        toastOpacity.setValue(0);
        toastTranslateY.setValue(-16);
        Animated.parallel([
            Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(toastTranslateY, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => {
            setTimeout(() => {
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
        setTimeout(() => setShowToast(false), 3500);

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
    }, [manhwaId, chapNum, filename, onChapterRead]);

    // Cada Page chama isto ao decodificar. Mantemos contagem num ref (não força
    // re-render) e só damos UM setState quando bate o total — antes era uma
    // re-render por imagem, que freezava chapters com páginas gigantes.
    const handlePageLoaded = useCallback((id: string, ratio: number) => {
        aspectRatiosRef.current[id] = ratio;
        if (loadedIdsRef.current.has(id)) return;
        loadedIdsRef.current.add(id);
        if (totalPages > 0 && loadedIdsRef.current.size >= totalPages) {
            setAllPagesLoaded(true);
        }
    }, [totalPages]);

    const handleEndReached = useCallback(() => {
        // Só marca como lido quando TODAS as páginas já carregaram (altura final
        // do conteúdo). Senão, enquanto as imagens carregam, o conteúdo fica curto
        // e o "fim" dispara antes de você ler de verdade.
        if (totalPages > 0 && !loading && !reachedEnd && allPagesLoaded) {
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
    }, [manhwaId, filename, flushScrollPosition]);

    const toggleUI = useCallback(() => {
        setShowUI(prev => {
            const next = !prev;
            animateHeader(next);
            return next;
        });
    }, []);

    const scrollToTop = () => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    };

    const goToChapter = (file: ChapterFile) => {
        onNavigate?.(file.name, file.chapter_number);
    };

    // Memoiza a lista de páginas: evita recriar um array de N itens a cada
    // render (ex.: a cada imagem que carrega) e mantém a referência estável
    // pro FlatList não reprocessar tudo.
    const pages = useMemo(
        () => Array.from({ length: totalPages }, (_, i) => ({
            id: i.toString(),
            url: localPageUri
                ? localPageUri(i)
                : `${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}/page/${i}`,
        })),
        [totalPages, localPageUri, manhwaId, filename]
    );


    // renderItem ESTÁVEL: depende só de toggleUI/handlePageLoaded (memoizados).
    // Assim, quando o reader re-renderiza (toast, reachedEnd, header), o FlatList
    // não reprocessa os itens.
    const renderPage = useCallback(({ item }: { item: { id: string; url: string } }) => (
        <ReaderPage
            id={item.id}
            url={item.url}
            initialRatio={aspectRatiosRef.current[item.id] ?? 0.7}
            onToggleUI={toggleUI}
            onLoaded={handlePageLoaded}
        />
    ), [toggleUI, handlePageLoaded]);

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
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
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
                        onScrollBeginDrag={() => { userHasInteracted.current = true; }}
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
                        // Evita a "tela preta" do Android: por padrão o FlatList
                        // clipa itens fora da tela e eles voltam em branco/preto.
                        removeClippedSubviews={false}
                        // Janela apertada: páginas de manhwa podem ser MUITO altas
                        // (800×10000 → 5x a viewport). Manter várias mounted ao
                        // mesmo tempo enche memória, GC roda em loop e o fps
                        // despenca. Com 3 só mantém ~3 viewport-heights de itens.
                        windowSize={3}
                        initialNumToRender={2}
                        maxToRenderPerBatch={1}
                        updateCellsBatchingPeriod={100}
                        renderItem={renderPage}
                    />
                    {/* Overlay durante restore progressivo: esconde o "flicker"
                        das páginas passando rápido até o offset alvo. */}
                    {restoring && (
                        <View style={styles.restoringOverlay} pointerEvents="none">
                            <ActivityIndicator size="large" color="#ffffff" />
                        </View>
                    )}
                    </>
                )}

                {/* Scroll-to-top FAB */}
                {showUI && !reachedEnd && (
                    <TouchableOpacity
                        onPress={scrollToTop}
                        style={[styles.scrollTopBtn, { bottom: (insets.bottom || 0) + 24 }]}
                    >
                        <ChevronUp size={22} color="white" />
                    </TouchableOpacity>
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
        backgroundColor: 'rgba(255,255,255,0.15)',
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
