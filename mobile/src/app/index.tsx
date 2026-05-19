import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookOpen, Plus, Download, CheckCircle, XCircle, WifiOff, RefreshCw } from 'lucide-react-native';
import ManhwaCard from '../components/ManhwaCard';
import AddManhwaModal from '../components/AddManhwaModal';
import { Manhwa } from '../types/manhwa';
import { API_BASE } from '../lib/api';
import {
    syncManhwaLocal,
    removeManhwaLocal,
    saveManhwaList,
    loadManhwaList,
    getLocalChaptersSet,
} from '../lib/cache';
import { drainQueue } from '../lib/sync-queue';

const FILTERS = [
    { id: 'all', label: 'Todos' },
    { id: 'reading', label: 'Lendo' },
    { id: 'top30', label: '🔥 Top 30' },
    { id: 'completed', label: 'Completos' },
    { id: 'plan_to_read', label: 'Planejo Ler' },
] as const;

type FilterId = typeof FILTERS[number]['id'];

export default function Home() {
    const [manhwas, setManhwas] = useState<Manhwa[]>([]);
    const [filter, setFilter] = useState<FilterId>('all');
    const [showOnlyNew, setShowOnlyNew] = useState(false);
    const [showOnlyUnreadTop30, setShowOnlyUnreadTop30] = useState(false);
    const [showOnlyDownloaded, setShowOnlyDownloaded] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOffline, setIsOffline] = useState(false);
    const [isReconnecting, setIsReconnecting] = useState(false);

    useEffect(() => {
        fetchManhwas();
    }, []);

    const fetchManhwas = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/manhwas`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data: Manhwa[] = await response.json();
            setManhwas(data);
            setIsOffline(false);
            saveManhwaList(data).catch(() => {});
        } catch (error) {
            console.warn('[fetch] manhwas falhou, tentando cache local:', error);
            // Fallback offline: lista do AsyncStorage filtrada pra quem tem chapters baixados
            const cached = await loadManhwaList<Manhwa>();
            if (cached && cached.length > 0) {
                const filtered: Manhwa[] = [];
                for (const m of cached) {
                    const local = await getLocalChaptersSet(m.id);
                    if (local.size > 0) filtered.push(m);
                }
                setManhwas(filtered);
                setIsOffline(true);
            } else {
                setManhwas([]);
                setIsOffline(true);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const tryReconnect = async () => {
        if (isReconnecting) return;
        setIsReconnecting(true);
        try {
            // Drena fila de leituras offline e depois tenta refazer a lista
            await drainQueue().catch(() => {});
            await fetchManhwas();
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

            // 1. Sincroniza no servidor (baixa do Telegram pro D:\Manhwas)
            console.log('[sync] ☁️  POST /download-all (servidor sincroniza com Telegram)...');
            const tServer = Date.now();
            const response = await fetch(`${API_BASE}/api/manhwas/download-all`, { method: 'POST' });
            const data = await response.json();
            console.log(`[sync]   ↪ servidor concluiu em ${Date.now() - tServer}ms: ${data.message}`);

            // 2. Replica pro celular em paralelo: baixa unread chapters dos reading+download=true
            //    e remove os locais dos com download=false.
            const toSync = manhwas.filter(m => m.status === 'reading' && m.download === true);
            const toRemove = manhwas.filter(m => m.download === false);
            console.log(`[sync] 📚 ${toSync.length} manhwas pra replicar no celular, ${toRemove.length} pra remover localmente`);

            // Cleanup local de quem foi desligado (paralelo total)
            if (toRemove.length > 0) {
                console.log('[sync] 🗑️  removendo locais dos desligados...');
                await Promise.all(toRemove.map(m =>
                    removeManhwaLocal(m.id)
                        .then(() => console.log(`[sync]   ✓ ${m.title} removido localmente`))
                        .catch(e => console.warn(`[sync]   ✗ ${m.title}:`, e))
                ));
            }

            // Sync paralelo dos manhwas (semáforo de MANHWA_CONCURRENCY)
            const MANHWA_CONCURRENCY = 4;
            const queue = [...toSync];
            let localDownloaded = 0;
            let localErrors = 0;
            let processedCount = 0;

            const syncWorker = async () => {
                while (queue.length > 0) {
                    const m = queue.shift();
                    if (!m) return;
                    processedCount++;
                    console.log(`[sync] ▶️  [${processedCount}/${toSync.length}] ${m.title} (#${m.id})`);
                    try {
                        const filesRes = await fetch(`${API_BASE}/api/manhwas/${m.id}/files`);
                        const filesData = await filesRes.json();
                        const r = await syncManhwaLocal(
                            m.id,
                            m.current_chapter ?? 0,
                            filesData.files ?? [],
                            m.cover_url ?? null
                        );
                        localDownloaded += r.downloaded;
                        localErrors += r.errors;
                        console.log(`[sync]   ✓ ${m.title}: ${r.downloaded} baixados, ${r.errors} erros`);
                    } catch (e) {
                        console.warn(`[sync]   ✗ ${m.title} falhou:`, e);
                        localErrors++;
                    }
                }
            };

            await Promise.all(
                Array.from({ length: Math.min(MANHWA_CONCURRENCY, toSync.length || 1) }, syncWorker)
            );

            const fullMs = Date.now() - tFull;
            console.log(
                `[sync] 🏁 Concluído em ${fullMs}ms — ` +
                `${localDownloaded} caps confirmados no celular, ` +
                `${localErrors} falhas, ${drain.sent} leituras offline enviadas`
            );
            console.log('[sync] ═══════════════════════════════════════');

            const localMsg = localDownloaded > 0
                ? ` · ${localDownloaded} cap. no celular${localErrors > 0 ? ` (${localErrors} falhas)` : ''}`
                : '';
            const drainMsg = drain.sent > 0 ? ` · ${drain.sent} leitura(s) offline enviada(s)` : '';
            setSyncResult({ success: data.success, message: `${data.message}${localMsg}${drainMsg}` });
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

        if (showOnlyDownloaded) {
            result = result.filter(m => m.download === true);
        }

        if (filter === 'top30') {
            if (showOnlyUnreadTop30) {
                result = result.filter(m => m.status !== 'reading' && m.status !== 'completed');
            }
            return result
                .sort((a, b) => (b.medium_reaction ?? 0) - (a.medium_reaction ?? 0))
                .slice(0, 30);
        }

        return result.filter(manhwa => {
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
        });
    })();

    const Checkbox = ({
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
    );

    const renderHeader = () => (
        <View className="mb-4 mt-4 px-4">
            {/* App title */}
            <View className="flex-row items-center justify-between mb-6">
                <View className="flex-row items-center gap-2">
                    <BookOpen size={28} color="#ed4545" />
                    <Text className="text-2xl font-bold text-white">Manhwa Tracker</Text>
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
                <Checkbox
                    value={showOnlyDownloaded}
                    onChange={setShowOnlyDownloaded}
                    label="Apenas baixados"
                />
                {filter === 'reading' && (
                    <Checkbox
                        value={showOnlyNew}
                        onChange={setShowOnlyNew}
                        label="Apenas com capítulos novos"
                    />
                )}
                {filter === 'top30' && (
                    <Checkbox
                        value={showOnlyUnreadTop30}
                        onChange={setShowOnlyUnreadTop30}
                        label="Apenas os que não li nenhum capítulo"
                        accentClass="bg-rose-500 border-rose-500"
                    />
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
                columnWrapperStyle={{ paddingHorizontal: 12, gap: 10 }}
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
                    <View style={{ flex: 1 }}>
                        <ManhwaCard manhwa={item} onUpdate={fetchManhwas} />
                    </View>
                )}
            />

            {/* FABs — Sincronizar (acima) + Adicionar (abaixo) */}
            <View style={styles.fabContainer}>
                <TouchableOpacity
                    onPress={syncDownloads}
                    disabled={isSyncing}
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
    fabContainer: {
        position: 'absolute',
        bottom: 28,
        right: 20,
        alignItems: 'center',
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
});
