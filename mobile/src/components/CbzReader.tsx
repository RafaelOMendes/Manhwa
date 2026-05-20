import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, Modal, ActivityIndicator,
    FlatList, Dimensions, StyleSheet, Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { X, ChevronUp, ChevronLeft, ChevronRight, CheckCircle, SkipForward } from 'lucide-react-native';
import { StatusBar, setStatusBarHidden } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { API_BASE } from '../lib/api';
import { getLocalChapter, markChapterReadLocal, saveLocalScroll, getLocalScroll } from '../lib/cache';
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

export default function CbzReader({ manhwaId, filename, chapterNumber, files, onClose, onChapterRead, onNavigate }: CbzReaderProps) {
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showUI, setShowUI] = useState(true);
    const [reachedEnd, setReachedEnd] = useState(false);
    const [markedAsRead, setMarkedAsRead] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});
    const [savedScrollOffset, setSavedScrollOffset] = useState(0);
    const [localPageUri, setLocalPageUri] = useState<((page: number) => string) | null>(null);

    const insets = useSafeAreaInsets();
    const flatListRef = useRef<FlatList>(null);
    const hasMarkedRef = useRef(false);
    const userHasInteracted = useRef(false);
    const scrollSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Modo imersivo: oculta status bar + barra de navegação ao abrir o reader
    // (tela limpa) e restaura ao fechar.
    useEffect(() => {
        setStatusBarHidden(true, 'fade');
        NavigationBar.setVisibilityAsync('hidden');
        NavigationBar.setBehaviorAsync('overlay-swipe');
        return () => {
            setStatusBarHidden(false, 'fade');
            NavigationBar.setVisibilityAsync('visible');
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
    const chapNum = files && currentIndex >= 0 ? currentIndex + 1 : (chapterNumber ?? extractChapterNumber(filename));

    // Load chapter info + saved scroll position
    useEffect(() => {
        setLoading(true);
        setReachedEnd(false);
        setMarkedAsRead(false);
        hasMarkedRef.current = false;
        userHasInteracted.current = false;
        setSavedScrollOffset(0);
        setLocalPageUri(null);

        const fetchInfo = async () => {
            try {
                // 1. Info do chapter: local first, server apenas se não-baixado
                const local = await getLocalChapter(manhwaId, filename);
                const isLocal = local.available && !!local.totalPages && !!local.getPageUri;

                if (isLocal) {
                    // Capítulo baixado: carrega 100% local, NUNCA toca no backend
                    // (nem pra páginas nem pra scroll) — funciona offline na hora.
                    setTotalPages(local.totalPages!);
                    setLocalPageUri(() => local.getPageUri!);

                    const localScroll = await getLocalScroll(manhwaId, filename);
                    if (localScroll !== null && localScroll > 0) {
                        setSavedScrollOffset(localScroll);
                    }
                    return;
                }

                // Não-baixado: precisa do servidor pras páginas
                const res = await fetch(`${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}`);
                const data = await res.json();
                setTotalPages(data.total_pages);

                // Scroll: local primeiro (instant, offline); senão tenta servidor
                const localScroll = await getLocalScroll(manhwaId, filename);
                if (localScroll !== null && localScroll > 0) {
                    setSavedScrollOffset(localScroll);
                } else {
                    try {
                        const scrollRes = await fetch(`${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}/scroll`);
                        const scrollData = await scrollRes.json();
                        if (scrollData.scroll_position > 0) {
                            setSavedScrollOffset(scrollData.scroll_position);
                            saveLocalScroll(manhwaId, filename, scrollData.scroll_position).catch(() => {});
                        }
                    } catch {
                        // Offline ou erro — começa do topo
                    }
                }
            } catch (error) {
                console.error('Erro ao carregar CBZ:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchInfo();
    }, [manhwaId, filename]);

    // Restore scroll after loading
    useEffect(() => {
        if (!loading && totalPages > 0 && savedScrollOffset > 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToOffset({ offset: savedScrollOffset, animated: false });
            }, 100);
        }
    }, [loading, totalPages]);

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

    const handleEndReached = () => {
        if (totalPages > 0 && !loading && !reachedEnd) {
            setReachedEnd(true);
            markChapterAsRead();
        }
    };

    const saveScrollPosition = useCallback((offset: number) => {
        if (!userHasInteracted.current) return;
        if (scrollSaveTimeout.current) clearTimeout(scrollSaveTimeout.current);
        scrollSaveTimeout.current = setTimeout(async () => {
            const position = Math.floor(offset);

            // 1. Sempre persiste local (instantâneo, funciona offline)
            saveLocalScroll(manhwaId, filename, position).catch(() => {});

            // 2. Tenta servidor; se falhar, enfileira pra eventual sync
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
            } catch (err) {
                enqueueScroll(manhwaId, filename, position).catch(e =>
                    console.warn('[sync] enqueueScroll:', e)
                );
            }
        }, 500);
    }, [manhwaId, filename]);

    const toggleUI = () => {
        const nextVisible = !showUI;
        setShowUI(nextVisible);
        animateHeader(nextVisible);
    };

    const scrollToTop = () => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    };

    const goToChapter = (file: ChapterFile) => {
        onNavigate?.(file.name, file.chapter_number);
    };

    const pages = Array.from({ length: totalPages }, (_, i) => ({
        id: i.toString(),
        url: localPageUri
            ? localPageUri(i)
            : `${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}/page/${i}`,
    }));

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
        <Modal
            visible={true}
            transparent={false}
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent={true}
            navigationBarTranslucent={true}
        >
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
                            const offset = e.nativeEvent.contentOffset.y;
                            saveScrollPosition(offset);
                        }}
                        scrollEventThrottle={250}
                        // Evita a "tela preta" do Android: por padrão o FlatList
                        // clipa itens fora da tela e eles voltam em branco/preto.
                        removeClippedSubviews={false}
                        windowSize={5}
                        initialNumToRender={3}
                        maxToRenderPerBatch={4}
                        renderItem={({ item }) => {
                            const ratio = aspectRatios[item.id] || 0.7;
                            const height = SCREEN_WIDTH / ratio;
                            return (
                                <TouchableOpacity activeOpacity={1} onPress={toggleUI}>
                                    <Image
                                        source={{ uri: item.url }}
                                        style={{ width: SCREEN_WIDTH, height }}
                                        contentFit="contain"
                                        cachePolicy="memory-disk"
                                        recyclingKey={item.id}
                                        transition={200}
                                        onLoad={(e) => {
                                            const { width, height } = e.source;
                                            if (width && height) {
                                                setAspectRatios(prev => ({ ...prev, [item.id]: width / height }));
                                            }
                                        }}
                                    />
                                </TouchableOpacity>
                            );
                        }}
                    />
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
        </Modal>
    );
}

const styles = StyleSheet.create({
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
});
