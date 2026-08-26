import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, ScrollView, StyleSheet, Pressable, Animated, Easing, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { BookOpen, Plus, Download, CheckCircle, XCircle, WifiOff, RefreshCw, RotateCw, FolderDown } from 'lucide-react-native';
import ManhwaCard from '../components/ManhwaCard';
import AddManhwaModal from '../components/AddManhwaModal';
import { Manhwa } from '../types/manhwa';
import { API_BASE } from '../lib/api';
import {
    saveManhwaList,
    loadManhwaList,
    getLocalChaptersSet,
    getLastReadMap,
} from '../lib/cache';
import { drainQueue } from '../lib/sync-queue';
import { checkConnectivity } from '../lib/connectivity';
import { APP_VERSION } from '../lib/version';

const FILTERS = [
    { id: 'all', label: 'Todos' },
    { id: 'reading', label: 'Lendo' },
    { id: 'top30', label: '🔥 Top 30' },
    { id: 'completed', label: 'Completos' },
    { id: 'plan_to_read', label: 'Planejo Ler' },
] as const;

type FilterId = typeof FILTERS[number]['id'];

// Largura fixa de 1 coluna (grid de 2): padding 12+12 nas bordas, gap 10 no meio.
// Garante que o último card (linha ímpar) não estique pra largura toda.
const CARD_WIDTH = (Dimensions.get('window').width - 34) / 2;

const Checkbox = React.memo(({
    value,
    onChange,
    label,
    accentClass = 'bg-blue-500 border-blue-500',
}: {
    value: boolean;
    onChange: (v: boolean) => void;
    label: string;
    accentClass?: string;
}) => (
    <TouchableOpacity
        onPress={() => onChange(!value)}
        className="flex-row items-center px-3 py-2 rounded-lg bg-[#1f1c1c]/50 border border-gray-800/50"
    >
        <View className={`w-4 h-4 rounded mr-2 items-center justify-center border ${value ? accentClass : 'border-gray-600 bg-[#262525]'}`}>
            {value && <View className="w-2 h-2 rounded-sm bg-white" />}
        </View>
        <Text className="text-sm text-gray-300">{label}</Text>
    </TouchableOpacity>
));

export default function Home() {
    const router = useRouter();
    const [manhwas, setManhwas] = useState<Manhwa[]>([]);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuMounted, setMenuMounted] = useState(false);
    const menuAnim = useRef(new Animated.Value(0)).current;
    // Mapa id→ISO da última leitura local (ordena a home na hora, mesmo offline).
    const [lastReadMap, setLastReadMap] = useState<Record<string, string>>({});
    const [filter, setFilter] = useState<FilterId>('all');
    const [showOnlyNew, setShowOnlyNew] = useState(false);
    const [showOnlyUnreadTop30, setShowOnlyUnreadTop30] = useState(false);
    const [showOnlyMoreThan80Chapters, setShowOnlyMoreThan80Chapters] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOffline, setIsOffline] = useState(false);
    const [isReconnecting, setIsReconnecting] = useState(false);

    // Espelho do isOffline pra ler o valor atual dentro de callbacks estáveis
    // (o useCallback captura o state do render em que foi criado).
    const isOfflineRef = useRef(false);
    const setOffline = useCallback((value: boolean) => {
        isOfflineRef.current = value;
        setIsOffline(value);
    }, []);

    const refreshLastRead = useCallback(() => {
        getLastReadMap().then(setLastReadMap).catch(() => {});
    }, []);

    // Lista offline: snapshot do AsyncStorage filtrado pra quem tem capítulos baixados.
    const loadCachedManhwas = useCallback(async () => {
        const cached = await loadManhwaList<Manhwa>();
        if (!cached || cached.length === 0) {
            setManhwas([]);
            return;
        }
        const filtered: Manhwa[] = [];
        for (const m of cached) {
            const local = await getLocalChaptersSet(m.id);
            if (local.size > 0) filtered.push(m);
        }
        setManhwas(filtered);
    }, []);

    // Ao voltar pra home (ex.: depois de ler um capítulo), reavalia a última leitura local.
    useFocusEffect(refreshLastRead);

    // Anima abertura/fechamento do menu de download (fade + slide).
    useEffect(() => {
        if (menuOpen) {
            setMenuMounted(true);
            Animated.timing(menuAnim, {
                toValue: 1,
                duration: 130,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(menuAnim, {
                toValue: 0,
                duration: 110,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
            }).start(({ finished }) => {
                if (finished) setMenuMounted(false);
            });
        }
    }, [menuOpen, menuAnim]);

    /**
     * `force` = tentativa explícita do usuário (botão "Offline/Reconectando") ou
     * checagem de startup. Sem ele, estando offline nem chega a bater no servidor:
     * offline é um estado explícito, só sai dele por ação do usuário ou reabrindo
     * o app — assim o botão não pisca sozinho a cada refresh de tela.
     */
    const fetchManhwas = useCallback(async (opts?: { force?: boolean }) => {
        if (isOfflineRef.current && !opts?.force) {
            await loadCachedManhwas().catch(() => setManhwas([]));
            setIsLoading(false);
            return;
        }
        try {
            const response = await fetch(`${API_BASE}/api/manhwas`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data: Manhwa[] = await response.json();
            setManhwas(data);
            setOffline(false);
            saveManhwaList(data).catch(() => {});
        } catch (error) {
            console.warn('[fetch] manhwas falhou, tentando cache local:', error);
            await loadCachedManhwas().catch(() => setManhwas([]));
            setOffline(true);
        } finally {
            setIsLoading(false);
        }
    }, [loadCachedManhwas, setOffline]);

    // Startup: um ping curto (10s) decide se a home entra em modo offline. Se o
    // servidor não responde, mostra direto o cache local sem esperar o timeout
    // (bem mais longo) do fetch da lista.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const online = await checkConnectivity();
            if (cancelled) return;
            if (!online) {
                setOffline(true);
                await loadCachedManhwas().catch(() => setManhwas([]));
                setIsLoading(false);
                return;
            }
            setOffline(false);
            await fetchManhwas({ force: true });
        })();
        refreshLastRead();
        return () => { cancelled = true; };
    }, [fetchManhwas, loadCachedManhwas, refreshLastRead, setOffline]);

    // Passado pros cards: ao fechar o leitor, recarrega lista + "último lido"
    // (re-ordena a home na hora, mesmo offline).
    const handleCardUpdate = useCallback(() => {
        fetchManhwas();
        refreshLastRead();
    }, [fetchManhwas, refreshLastRead]);

    const tryReconnect = async () => {
        if (isReconnecting) return;
        setIsReconnecting(true);
        try {
            // Drena fila de leituras offline e depois tenta refazer a lista
            await drainQueue().catch(() => {});
            await fetchManhwas({ force: true });
        } finally {
            setIsReconnecting(false);
        }
    };

    const syncDownloads = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        setSyncResult(null);

        const tFull = Date.now();
        console.log('[sync] ═══════════════════════════════════════');
        console.log('[sync] 🚀 Sincronização iniciada');

        try {
            // 0. Drena a fila offline (leituras feitas sem internet) antes de qualquer coisa
            console.log('[sync] 📨 Drenando fila offline...');
            const drain = await drainQueue();
            console.log(`[sync]   ↪ enviadas ${drain.sent}, ${drain.remaining} pendentes`);

            // 1. Sincroniza APENAS no servidor (baixa do Telegram pro D:\Manhwas),
            //    igual à web. NÃO baixa nada no celular — isso é feito na tela de
            //    Downloads (Baixar tudo / individual).
            console.log('[sync] ☁️  POST /download-all (servidor sincroniza com Telegram)...');
            const tServer = Date.now();
            const response = await fetch(`${API_BASE}/api/manhwas/download-all`, { method: 'POST' });
            const data = await response.json();
            console.log(`[sync]   ↪ servidor concluiu em ${Date.now() - tServer}ms: ${data.message}`);

            const fullMs = Date.now() - tFull;
            console.log(`[sync] 🏁 Servidor concluído em ${fullMs}ms — ${drain.sent} leituras offline enviadas`);
            console.log('[sync] ═══════════════════════════════════════');

            const drainMsg = drain.sent > 0 ? ` · ${drain.sent} leitura(s) offline enviada(s)` : '';
            setSyncResult({ success: data.success, message: `${data.message}${drainMsg}` });
            setTimeout(() => setSyncResult(null), 10000);
            // Atualiza a lista pra refletir total_chapters/medium_reaction atualizados
            fetchManhwas();
        } catch (error) {
            console.error('Erro na sincronização:', error);
            setSyncResult({ success: false, message: 'Erro de conexão com o servidor' });
            setTimeout(() => setSyncResult(null), 8000);
        } finally {
            setIsSyncing(false);
        }
    };

    const filteredManhwas = (() => {
        let result = [...manhwas];

        if (filter === 'top30') {
            if (showOnlyUnreadTop30) {
                result = result.filter(m => m.status !== 'reading' && m.status !== 'completed');
            }
            if (showOnlyMoreThan80Chapters) {
                result = result.filter(m => (m.total_chapters ?? 0) > 80);
            }
            return result
                .sort((a, b) => (b.medium_reaction ?? 0) - (a.medium_reaction ?? 0))
                .slice(0, 30);
        }

        // Mais recém-lido primeiro. Usa o maior entre a leitura local (instantânea,
        // funciona offline) e o updated_at do servidor.
        const recencyOf = (m: Manhwa) => {
            const local = lastReadMap[String(m.id)] ? Date.parse(lastReadMap[String(m.id)]) : 0;
            const server = m.updated_at ? Date.parse(m.updated_at) : 0;
            return Math.max(local, server);
        };
        const byRecent = (a: Manhwa, b: Manhwa) => {
            const diff = recencyOf(b) - recencyOf(a);
            return diff !== 0 ? diff : b.id - a.id;
        };

        return result
            .filter(manhwa => {
                if (filter === 'all') return true;
                if (filter === 'reading') {
                    if (showOnlyNew) {
                        return manhwa.status === 'reading' &&
                            manhwa.total_chapters !== undefined &&
                            manhwa.total_chapters !== null &&
                            manhwa.current_chapter !== undefined &&
                            manhwa.total_chapters > manhwa.current_chapter;
                    }
                    return manhwa.status === 'reading';
                }
                return manhwa.status === filter;
            })
            .sort(byRecent);
    })();

    const renderHeader = () => (
        <View className="mb-4 mt-4 px-4">
            {/* App title */}
            <View className="flex-row items-center justify-between mb-6">
                <View className="flex-row items-end gap-2">
                    <BookOpen size={28} color="#ed4545" />
                    <Text className="text-2xl font-bold text-white">Manhwa Tracker</Text>
                    <Text className="text-[11px] text-gray-500 mb-1">v{APP_VERSION}</Text>
                </View>
                {isOffline && (
                    <TouchableOpacity
                        onPress={tryReconnect}
                        disabled={isReconnecting}
                        activeOpacity={0.7}
                        className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-900/40 border border-amber-700/50"
                    >
                        {isReconnecting ? (
                            <ActivityIndicator size={12} color="#fbbf24" />
                        ) : (
                            <WifiOff size={12} color="#fbbf24" />
                        )}
                        <Text className="text-[11px] text-amber-400 font-medium">
                            {isReconnecting ? 'Reconectando...' : 'Offline'}
                        </Text>
                        {!isReconnecting && <RefreshCw size={11} color="#fbbf24" />}
                    </TouchableOpacity>
                )}
            </View>

            {/* Sync result feedback */}
            {syncResult && (
                <View className={`flex-row items-center gap-2 mb-4 px-4 py-3 rounded-xl ${syncResult.success ? 'bg-green-900/40 border border-green-800/50' : 'bg-red-900/40 border border-red-800/50'}`}>
                    {syncResult.success
                        ? <CheckCircle size={18} color="#4ade80" />
                        : <XCircle size={18} color="#f87171" />}
                    <Text className={`text-sm flex-1 ${syncResult.success ? 'text-green-400' : 'text-red-400'}`}>
                        {syncResult.message}
                    </Text>
                </View>
            )}

            {/* Horizontal filter tabs — igual à web */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingRight: 4 }}
                className="mb-4"
            >
                {FILTERS.map(f => (
                    <TouchableOpacity
                        key={f.id}
                        onPress={() => setFilter(f.id)}
                        className={`px-4 py-2 rounded-lg ${filter === f.id
                            ? (f.id === 'top30' ? 'bg-rose-600' : 'bg-primary-500')
                            : 'bg-[#1f1c1c]'
                            }`}
                    >
                        <Text className={`font-medium text-sm ${filter === f.id ? 'text-white' : 'text-gray-300'}`}>
                            {f.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Checkboxes */}
            <View className="flex-row flex-wrap gap-2 mb-2">
                {filter === 'reading' && (
                    <Checkbox
                        value={showOnlyNew}
                        onChange={setShowOnlyNew}
                        label="Apenas com capítulos novos"
                    />
                )}
                {filter === 'top30' && (
                    <>
                        <Checkbox
                            value={showOnlyUnreadTop30}
                            onChange={setShowOnlyUnreadTop30}
                            label="Apenas os que não li nenhum capítulo"
                            accentClass="bg-rose-500 border-rose-500"
                        />
                        <Checkbox
                            value={showOnlyMoreThan80Chapters}
                            onChange={setShowOnlyMoreThan80Chapters}
                            label="Mais de 80 capítulos"
                            accentClass="bg-rose-500 border-rose-500"
                        />
                    </>
                )}
            </View>
        </View>
    );

    return (
        <SafeAreaView className="flex-1 bg-[#262525]">
            {/* Card grid — 2 colunas igual à web */}
            <FlatList
                data={filteredManhwas}
                keyExtractor={(item) => item.id.toString()}
                numColumns={2}
                ListHeaderComponent={renderHeader}
                contentContainerStyle={{ paddingBottom: 100 }}
                columnWrapperStyle={{ paddingHorizontal: 12, gap: 10, justifyContent: 'flex-start' }}
                ListEmptyComponent={() =>
                    !isLoading ? (
                        <View className="items-center py-16 px-4">
                            <BookOpen size={48} color="#4b5563" style={{ marginBottom: 16 }} />
                            <Text className="text-gray-400 text-lg text-center">
                                Nenhum manhwa encontrado. Adicione seu primeiro manhwa!
                            </Text>
                        </View>
                    ) : (
                        <View className="py-16 items-center">
                            <ActivityIndicator size="large" color="#ed4545" />
                        </View>
                    )
                }
                renderItem={({ item }) => (
                    <View style={{ width: CARD_WIDTH }}>
                        <ManhwaCard manhwa={item} onUpdate={handleCardUpdate} />
                    </View>
                )}
            />

            {/* Backdrop do menu de download */}
            {menuMounted && (
                <Animated.View
                    pointerEvents="auto"
                    style={[styles.menuBackdrop, { opacity: menuAnim }]}
                >
                    <Pressable style={{ flex: 1 }} onPress={() => setMenuOpen(false)} />
                </Animated.View>
            )}

            {/* FABs — Download (menu) + Adicionar */}
            <View style={styles.fabContainer}>
                {menuMounted && (
                    <Animated.View
                        style={{
                            alignItems: 'flex-end',
                            gap: 10,
                            marginBottom: 8,
                            opacity: menuAnim,
                        }}
                    >
                        <Animated.View
                            style={{
                                transform: [{
                                    translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }),
                                }],
                            }}
                        >
                            <TouchableOpacity
                                onPress={() => {
                                    setMenuOpen(false);
                                    syncDownloads();
                                }}
                                disabled={isSyncing}
                                style={styles.menuItem}
                                activeOpacity={0.85}
                            >
                                {isSyncing
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <RotateCw size={16} color="#fff" />}
                                <Text style={styles.menuItemText}>Sincronizar</Text>
                            </TouchableOpacity>
                        </Animated.View>
                        <Animated.View
                            style={{
                                transform: [{
                                    translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
                                }],
                            }}
                        >
                            <TouchableOpacity
                                onPress={() => {
                                    setMenuOpen(false);
                                    router.push('/downloads');
                                }}
                                style={styles.menuItem}
                                activeOpacity={0.85}
                            >
                                <FolderDown size={16} color="#fff" />
                                <Text style={styles.menuItemText}>Ver downloads</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    </Animated.View>
                )}
                <TouchableOpacity
                    onPress={() => setMenuOpen(v => !v)}
                    style={[styles.fab, styles.fabSecondary]}
                    activeOpacity={0.85}
                >
                    {isSyncing
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Download size={20} color="#fff" />
                    }
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => setIsModalOpen(true)}
                    style={[styles.fab, styles.fabPrimary]}
                    activeOpacity={0.85}
                >
                    <Plus size={24} color="#fff" />
                </TouchableOpacity>
            </View>

            <AddManhwaModal
                visible={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onAdd={fetchManhwas}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    menuBackdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    fabContainer: {
        position: 'absolute',
        bottom: 28,
        right: 20,
        alignItems: 'flex-end',
        gap: 12,
    },
    fab: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 8,
    },
    fabPrimary: {
        backgroundColor: '#ed4545',
        width: 56,
        height: 56,
        borderRadius: 28,
    },
    fabSecondary: {
        backgroundColor: '#2563eb',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 24,
        backgroundColor: '#1f1c1c',
        borderWidth: 1,
        borderColor: '#374151',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 6,
        elevation: 6,
    },
    menuItemText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
});
