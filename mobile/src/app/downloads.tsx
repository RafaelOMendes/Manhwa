import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert, InteractionManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ArrowLeft, HardDrive, CloudDownload, Trash2, Download, FileText, CheckCircle2, Square } from 'lucide-react-native';
import { Manhwa } from '../types/manhwa';
import { API_BASE } from '../lib/api';
import {
    getManhwaStorage,
    getLocalChaptersSet,
    getReadChaptersSet,
    getLocalCoverUri,
    removeManhwaLocal,
    loadManhwaList,
    loadManhwaFiles,
    getManhwasWithLocalData,
    cleanupCorrupted,
} from '../lib/cache';
import { useDownloadProgress, clearFinishedProgress, getStoreState } from '../lib/download-manager';
import { startBackgroundDownload, stopBackgroundDownload } from '../lib/background-download';

type Unit = 'chapters' | 'mb';

interface RowInfo {
    manhwa: Manhwa;
    localBytes: number;
    downloadedChapters: number;
    pendingCount: number;
    pendingMB: number;
    /** false quando /files falhou (offline) — "falta" fica desconhecido. */
    filesLoaded: boolean;
}

function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
}

async function poolMap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let i = 0;
    const worker = async () => {
        while (i < items.length) {
            const idx = i++;
            results[idx] = await fn(items[idx]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
    return results;
}

/** Computa info local + pendências de um manhwa. */
async function buildRow(m: Manhwa): Promise<RowInfo> {
    const [localSet, readSet, localBytes] = await Promise.all([
        getLocalChaptersSet(m.id),
        getReadChaptersSet(m.id),
        getManhwaStorage(m.id),
    ]);

    let pendingCount = 0;
    let pendingMB = 0;
    let filesLoaded = false;

    // Um capítulo conta como "lido" se está no set local OU se está abaixo do
    // current_chapter do servidor (mesma inferência que o syncManhwaLocal faz
    // antes de baixar). Sem isso, manhwas nunca abertos no aparelho mostrariam
    // todos os capítulos como pendentes.
    const tally = (files: { name: string; size_mb?: number }[], currentChapter: number) => {
        files.forEach((f, i) => {
            const isRead = readSet.has(f.name) || i < currentChapter;
            if (!isRead && !localSet.has(f.name)) {
                pendingCount++;
                pendingMB += f.size_mb ?? 0;
            }
        });
    };

    try {
        const res = await fetch(`${API_BASE}/api/manhwas/${m.id}/files`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const files: { name: string; size_mb?: number }[] = data.files ?? [];
        filesLoaded = true;
        tally(files, data.current_chapter ?? m.current_chapter ?? 0);
    } catch {
        // offline: tenta snapshot só pra não quebrar (sem números de pendência confiáveis)
        const saved = await loadManhwaFiles(m.id).catch(() => null);
        if (saved) {
            tally(saved, m.current_chapter ?? 0);
            filesLoaded = true;
        }
    }

    return {
        manhwa: m,
        localBytes,
        downloadedChapters: localSet.size,
        pendingCount,
        pendingMB,
        filesLoaded,
    };
}

export default function Downloads() {
    const router = useRouter();
    const { progress } = useDownloadProgress();

    const [rows, setRows] = useState<RowInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [unit, setUnit] = useState<Unit>('chapters');

    const anyDownloading = Object.values(progress).some(p => p.status === 'downloading');

    const loadAll = useCallback(async () => {
        setLoading(true);
        setRows([]);

        // Remove corrompidos/órfãos do disco (só quando não há download ativo,
        // pra não apagar o que está baixando agora). Mantém os números consistentes.
        if (!getStoreState().active) {
            await cleanupCorrupted().catch(() => {});
        }

        // lista de manhwas (server, com fallback offline)
        let list: Manhwa[] = [];
        try {
            const res = await fetch(`${API_BASE}/api/manhwas`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            list = await res.json();
        } catch {
            list = (await loadManhwaList<Manhwa>()) ?? [];
        }

        // candidatos: tem capítulos locais OU está marcado pra download (reading).
        // Uma única leitura do índice (em vez de uma por manhwa) — bem mais rápido.
        const hasLocal = await getManhwasWithLocalData();
        const candidates = list.filter(m => hasLocal.has(m.id) || (m.download && m.status === 'reading'));

        // Ordenação: com pendência primeiro, depois por armazenamento.
        const sortFn = (a: RowInfo, b: RowInfo) => {
            if ((b.pendingCount > 0 ? 1 : 0) !== (a.pendingCount > 0 ? 1 : 0)) {
                return (b.pendingCount > 0 ? 1 : 0) - (a.pendingCount > 0 ? 1 : 0);
            }
            return b.localBytes - a.localBytes;
        };

        // Renderiza progressivamente: cada linha aparece assim que fica pronta.
        const acc: RowInfo[] = [];
        await poolMap(candidates, 4, async (m) => {
            const row = await buildRow(m);
            acc.push(row);
            acc.sort(sortFn);
            setRows([...acc]);
        });
        setLoading(false);
    }, []);

    useEffect(() => {
        clearFinishedProgress();
        // Adia o trabalho pesado (rede + varredura de disco) pra depois da
        // animação de navegação, pra tela abrir instantaneamente.
        const task = InteractionManager.runAfterInteractions(() => { loadAll(); });
        return () => task.cancel();
    }, [loadAll]);

    const refreshRow = useCallback(async (m: Manhwa) => {
        const updated = await buildRow(m);
        setRows(prev => prev.map(r => (r.manhwa.id === m.id ? updated : r)));
    }, []);

    const storageTotal = useMemo(() => rows.reduce((s, r) => s + r.localBytes, 0), [rows]);

    // Atualiza a linha quando o download daquele manhwa termina (done/error),
    // mesmo tendo rodado no foreground service.
    const handledStatusRef = useRef<Record<number, string>>({});
    useEffect(() => {
        for (const idStr of Object.keys(progress)) {
            const id = Number(idStr);
            const st = progress[id].status;
            if ((st === 'done' || st === 'error' || st === 'cancelled') && handledStatusRef.current[id] !== st) {
                handledStatusRef.current[id] = st;
                const row = rows.find(r => r.manhwa.id === id);
                if (row) refreshRow(row.manhwa);
            } else if (st === 'downloading') {
                handledStatusRef.current[id] = st;
            }
        }
    }, [progress, rows, refreshRow]);

    const handleDownloadOne = useCallback((m: Manhwa) => {
        startBackgroundDownload([m]);
    }, []);

    const handleDownloadAll = useCallback(() => {
        const pending = rows.filter(r => r.pendingCount > 0).map(r => r.manhwa);
        if (pending.length === 0) return;
        startBackgroundDownload(pending);
    }, [rows]);

    const handleStop = useCallback(async () => {
        await stopBackgroundDownload();
        // Recarrega pra refletir o que foi baixado até parar (e limpar parciais).
        setTimeout(() => { loadAll(); }, 400);
    }, [loadAll]);

    const handleRemove = useCallback((row: RowInfo) => {
        Alert.alert(
            'Remover download',
            `Apagar os capítulos baixados de "${row.manhwa.title}" do aparelho? Os arquivos serão baixados de novo no próximo sync se "Sincronizar" estiver ligado.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Apagar',
                    style: 'destructive',
                    onPress: async () => {
                        await removeManhwaLocal(row.manhwa.id);
                        await refreshRow(row.manhwa);
                    },
                },
            ]
        );
    }, [refreshRow]);

    const totalPendingCount = rows.reduce((s, r) => s + r.pendingCount, 0);
    const totalPendingMB = rows.reduce((s, r) => s + r.pendingMB, 0);
    const anyUnknown = rows.some(r => !r.filesLoaded);

    const toggleUnit = () => setUnit(u => (u === 'chapters' ? 'mb' : 'chapters'));

    const renderHeader = () => (
        <View className="px-4 pt-2 pb-1">
            {/* Cartões de resumo */}
            <View className="flex-row gap-3 mb-4">
                <View className="flex-1 bg-[#1f1c1c] rounded-xl border border-gray-800 p-3.5">
                    <View className="flex-row items-center gap-1.5 mb-1.5">
                        <HardDrive size={14} color="#60a5fa" />
                        <Text className="text-[11px] text-gray-400">Armazenamento</Text>
                    </View>
                    <Text className="text-xl font-bold text-white">{formatBytes(storageTotal)}</Text>
                    <Text className="text-[10px] text-gray-500 mt-0.5">usado no aparelho</Text>
                </View>
                <View className="flex-1 bg-[#1f1c1c] rounded-xl border border-gray-800 p-3.5">
                    <View className="flex-row items-center gap-1.5 mb-1.5">
                        <CloudDownload size={14} color="#fbbf24" />
                        <Text className="text-[11px] text-gray-400">Falta baixar</Text>
                    </View>
                    <Text className="text-xl font-bold text-white">
                        {unit === 'chapters'
                            ? `${totalPendingCount} cap.`
                            : `${totalPendingMB.toFixed(1)} MB`}
                    </Text>
                    <TouchableOpacity onPress={toggleUnit}>
                        <Text className="text-[10px] text-blue-400 mt-0.5">
                            {anyUnknown ? 'parcial · ' : ''}toque p/ {unit === 'chapters' ? 'MB' : 'caps'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Baixar tudo / Parar */}
            {anyDownloading ? (
                <TouchableOpacity
                    onPress={handleStop}
                    activeOpacity={0.85}
                    className="flex-row items-center justify-center gap-2 rounded-xl mt-1 mb-4 bg-red-600"
                    style={{ height: 44 }}
                >
                    <Square size={16} color="#fff" fill="#fff" />
                    <Text className="text-[15px] font-semibold text-white" style={{ includeFontPadding: false }}>
                        Parar download
                    </Text>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity
                    onPress={handleDownloadAll}
                    disabled={totalPendingCount === 0}
                    activeOpacity={0.85}
                    className={`flex-row items-center justify-center gap-2 rounded-xl mt-1 mb-4 ${
                        totalPendingCount === 0 ? 'bg-[#1f1c1c] border border-gray-800' : 'bg-blue-600'
                    }`}
                    style={{ height: 44 }}
                >
                    <Download size={18} color={totalPendingCount === 0 ? '#6b7280' : '#fff'} />
                    <Text
                        className={`text-[15px] font-semibold ${totalPendingCount === 0 ? 'text-gray-500' : 'text-white'}`}
                        style={{ includeFontPadding: false }}
                    >
                        {totalPendingCount === 0 ? 'Tudo baixado' : `Baixar tudo (${totalPendingCount} cap.)`}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );

    const renderItem = ({ item }: { item: RowInfo }) => {
        const m = item.manhwa;
        const prog = progress[m.id];
        const isDownloading = prog?.status === 'downloading';
        const coverUri =
            getLocalCoverUri(m.id) ??
            (m.cover_url
                ? m.cover_url.startsWith('/')
                    ? `${API_BASE}${m.cover_url}`
                    : m.cover_url
                : null);

        let fraction = 0;
        let progLabel = '';
        if (prog) {
            if (unit === 'chapters') {
                fraction = prog.totalChapters > 0 ? prog.doneChapters / prog.totalChapters : prog.status === 'done' ? 1 : 0;
                progLabel = `${prog.doneChapters}/${prog.totalChapters} caps`;
            } else {
                fraction = prog.totalMB > 0 ? prog.doneMB / prog.totalMB : prog.status === 'done' ? 1 : 0;
                progLabel = `${prog.doneMB.toFixed(1)}/${prog.totalMB.toFixed(1)} MB`;
            }
        }

        return (
            <View className="mx-4 mb-3 bg-[#1f1c1c] rounded-xl border border-gray-800 overflow-hidden">
                <View className="flex-row p-3 gap-3">
                    <View className="w-12 h-16 rounded-md overflow-hidden bg-[#262525] items-center justify-center">
                        {coverUri ? (
                            <Image source={{ uri: coverUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                        ) : (
                            <FileText size={18} color="#4b5563" />
                        )}
                    </View>

                    <View className="flex-1">
                        <Text className="text-sm font-semibold text-white" numberOfLines={2}>{m.title}</Text>
                        <View className="flex-row items-center gap-3 mt-1">
                            <View className="flex-row items-center gap-1">
                                <CheckCircle2 size={11} color="#4ade80" />
                                <Text className="text-[11px] text-gray-400">{item.downloadedChapters} baixados</Text>
                            </View>
                            <Text className="text-[11px] text-gray-500">{formatBytes(item.localBytes)}</Text>
                        </View>
                        <Text className="text-[11px] mt-0.5 text-gray-500">
                            {!item.filesLoaded
                                ? 'pendências indisponíveis (offline)'
                                : item.pendingCount === 0
                                ? 'em dia'
                                : `falta ${item.pendingCount} cap. · ${item.pendingMB.toFixed(1)} MB`}
                        </Text>
                    </View>

                    {/* Ações */}
                    <View className="items-center justify-center gap-2">
                        <TouchableOpacity
                            onPress={() => handleDownloadOne(m)}
                            disabled={isDownloading || item.pendingCount === 0}
                            className={`w-9 h-9 rounded-full items-center justify-center ${
                                item.pendingCount === 0 ? 'bg-[#262525]' : 'bg-blue-600'
                            }`}
                        >
                            {isDownloading ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Download size={16} color={item.pendingCount === 0 ? '#6b7280' : '#fff'} />
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => handleRemove(item)}
                            disabled={item.downloadedChapters === 0}
                            className="w-9 h-9 rounded-full items-center justify-center bg-[#262525]"
                        >
                            <Trash2 size={16} color={item.downloadedChapters === 0 ? '#6b7280' : '#ef4444'} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Barra de progresso (toque alterna caps/MB) */}
                {prog && (
                    <TouchableOpacity activeOpacity={0.8} onPress={toggleUnit} className="px-3 pb-3">
                        <View className="h-2 rounded-full bg-[#262525] overflow-hidden">
                            <View
                                className={`h-full rounded-full ${prog.status === 'error' ? 'bg-red-500' : prog.status === 'cancelled' ? 'bg-gray-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }}
                            />
                        </View>
                        <Text className="text-[10px] text-gray-500 mt-1">
                            {prog.status === 'error'
                                ? 'erro no download'
                                : prog.status === 'cancelled'
                                ? 'parado'
                                : prog.status === 'done'
                                ? 'concluído'
                                : `${progLabel}`}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-[#262525]">
            {/* Top bar */}
            <View className="flex-row items-center gap-3 px-4 py-3 border-b border-gray-800">
                <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
                    <ArrowLeft size={22} color="#fff" />
                </TouchableOpacity>
                <Text className="text-lg font-bold text-white">Downloads</Text>
            </View>

            <FlatList
                data={rows}
                keyExtractor={item => item.manhwa.id.toString()}
                ListHeaderComponent={renderHeader}
                renderItem={renderItem}
                contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
                ListEmptyComponent={() =>
                    loading ? (
                        <View className="py-16 items-center">
                            <ActivityIndicator size="large" color="#ed4545" />
                        </View>
                    ) : (
                        <View className="items-center py-16 px-4">
                            <CloudDownload size={44} color="#4b5563" style={{ marginBottom: 14 }} />
                            <Text className="text-gray-400 text-center">Nada baixado ainda. Ligue "Sincronizar" em um manhwa.</Text>
                        </View>
                    )
                }
            />
        </SafeAreaView>
    );
}
