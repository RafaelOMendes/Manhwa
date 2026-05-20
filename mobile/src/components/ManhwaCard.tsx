import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, Modal, ScrollView, Linking, ActivityIndicator, LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { Star, Trash2, ExternalLink, Heart, FileText, X, FolderOpen, CheckCircle2, ChevronDown, Download as DownloadIcon } from 'lucide-react-native';
import { Manhwa } from '../types/manhwa';
import { API_BASE } from '../lib/api';
import { openReader } from '../lib/reader-store';
import {
    getLocalChaptersSet,
    removeManhwaLocal,
    getLocalCoverUri,
    saveManhwaFiles,
    loadManhwaFiles,
    getReadChaptersSet,
    reconcileReadsWithServer,
} from '../lib/cache';
import { drainQueue } from '../lib/sync-queue';

interface CbzFile {
    name: string;
    size_mb: number;
    chapter_number: number;
}

interface ManhwaCardProps {
    manhwa: Manhwa;
    onUpdate: () => void;
}

function ManhwaCard({ manhwa, onUpdate }: ManhwaCardProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [isTogglingDownload, setIsTogglingDownload] = useState(false);
    const [showFiles, setShowFiles] = useState(false);
    const [files, setFiles] = useState<CbzFile[]>([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    const [currentChapter, setCurrentChapter] = useState(manhwa.current_chapter || 0);
    const [showStatusPicker, setShowStatusPicker] = useState(false);
    const [localFiles, setLocalFiles] = useState<Set<string>>(new Set());
    const [readChapters, setReadChapters] = useState<Set<string>>(new Set());
    const [localCoverUri, setLocalCoverUri] = useState<string | null>(null);

    // Re-checa a cover local sempre que o manhwa mudar de identidade (após fetchManhwas / sync)
    useEffect(() => {
        setLocalCoverUri(getLocalCoverUri(manhwa.id));
    }, [manhwa]);

    const filesScrollRef = useRef<ScrollView>(null);
    const itemYsRef = useRef<Record<number, number>>({});
    const hasAutoScrolledRef = useRef(false);

    // Reseta o estado de autoscroll a cada abertura do menu
    useEffect(() => {
        if (showFiles) {
            itemYsRef.current = {};
            hasAutoScrolledRef.current = false;
        }
    }, [showFiles]);

    const handleItemLayout = (index: number) => (e: LayoutChangeEvent) => {
        itemYsRef.current[index] = e.nativeEvent.layout.y;
    };

    // Autoscroll para o primeiro capítulo não-lido (per-chapter, baseado em readChapters)
    useEffect(() => {
        if (!showFiles || isLoadingFiles || hasAutoScrolledRef.current || files.length === 0) return;

        // Índice do primeiro filename que NÃO está em readChapters
        const firstUnreadIdx = files.findIndex(f => !readChapters.has(f.name));
        // Se não tem unread ou o primeiro unread já é o topo, não precisa rolar
        if (firstUnreadIdx <= 0) return;

        let attempts = 0;
        const tryScroll = () => {
            const y = itemYsRef.current[firstUnreadIdx];
            if (y !== undefined) {
                hasAutoScrolledRef.current = true;
                filesScrollRef.current?.scrollTo({
                    y: Math.max(0, y - 60),
                    animated: true,
                });
            } else if (attempts < 8) {
                attempts++;
                setTimeout(tryScroll, 50);
            }
        };
        const initial = setTimeout(tryScroll, 320);
        return () => clearTimeout(initial);
    }, [showFiles, isLoadingFiles, files.length, readChapters]);

    const hasLink = manhwa.notes && manhwa.notes.startsWith('http');
    const hasTelegramLink = manhwa.notes && manhwa.notes.includes('t.me');

    const handleCardClick = async () => {
        if (manhwa.download && hasTelegramLink) {
            setIsLoadingFiles(true);
            setShowFiles(true);

            try {
                // Local sempre roda (independente de rede)
                const [local, readSet] = await Promise.all([
                    getLocalChaptersSet(manhwa.id),
                    getReadChaptersSet(manhwa.id),
                ]);
                setLocalFiles(local);
                setReadChapters(readSet);

                let loadedFiles: { name: string; size_mb: number; chapter_number: number }[] = [];
                let loadedCurrentChapter = 0;
                let fetchedOnline = false;

                try {
                    // Drena leituras offline ANTES de buscar o current_chapter,
                    // pra que o valor do servidor já reflita o que foi lido offline.
                    await drainQueue().catch(() => {});
                    const response = await fetch(`${API_BASE}/api/manhwas/${manhwa.id}/files`);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const data = await response.json();
                    // chapter_number = POSIÇÃO na lista ordenada completa (1-based),
                    // que é o que o servidor usa como current_chapter.
                    const fullList = (data.files || []) as { name: string; size_mb: number }[];
                    loadedFiles = fullList.map((f, i) => ({ name: f.name, size_mb: f.size_mb, chapter_number: i + 1 }));
                    loadedCurrentChapter = data.current_chapter || 0;
                    fetchedOnline = true;
                    saveManhwaFiles(manhwa.id, loadedFiles).catch(() => {});
                } catch (error) {
                    console.warn('[fetch] /files falhou, usando cache offline:', error);
                    const saved = await loadManhwaFiles(manhwa.id).catch(() => null);
                    if (saved && saved.length > 0) {
                        // Posição = índice na lista COMPLETA do snapshot (não na lista
                        // filtrada). Assim "Capítulo 311" mantém o #311 offline.
                        const positionByName = new Map(saved.map((f, i) => [f.name, i + 1]));
                        loadedFiles = saved
                            .filter(f => local.has(f.name))
                            .map(f => ({ name: f.name, size_mb: f.size_mb, chapter_number: positionByName.get(f.name) ?? 0 }));
                    } else {
                        loadedFiles = [...local].sort().map((name, i) => ({
                            name,
                            size_mb: 0,
                            chapter_number: i + 1,
                        }));
                    }
                    loadedCurrentChapter = manhwa.current_chapter || 0;
                }

                setFiles(loadedFiles);
                setCurrentChapter(loadedCurrentChapter);

                // Reconcilia o set de lidos com o current_chapter do servidor,
                // mas SÓ quando temos um valor fresco (online). Offline não mexe
                // pra não regredir leituras com um valor defasado.
                if (fetchedOnline && loadedFiles.length > 0) {
                    try {
                        await reconcileReadsWithServer(manhwa.id, loadedCurrentChapter, loadedFiles);
                        const updated = await getReadChaptersSet(manhwa.id);
                        setReadChapters(updated);
                    } catch (e) {
                        console.warn('[cache] reconcileReadsWithServer:', e);
                    }
                }
            } finally {
                setIsLoadingFiles(false);
            }
            return;
        }

        if (hasLink) {
            Linking.openURL(manhwa.notes!);
        }
    };

    const deleteManhwa = () => {
        Alert.alert(
            "Confirmar",
            `Tem certeza que deseja excluir "${manhwa.title}"?`,
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Excluir",
                    style: "destructive",
                    onPress: async () => {
                        setIsDeleting(true);
                        try {
                            await fetch(`${API_BASE}/api/manhwas/${manhwa.id}`, { method: 'DELETE' });
                            onUpdate();
                        } catch (error) {
                            console.error('Erro ao deletar:', error);
                            setIsDeleting(false);
                        }
                    }
                }
            ]
        );
    };

    const toggleDownload = async () => {
        if (isTogglingDownload) return;
        setIsTogglingDownload(true);
        const wasDownload = manhwa.download;
        try {
            await fetch(`${API_BASE}/api/manhwas/${manhwa.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...manhwa, download: !wasDownload }),
            });
            // Desligando sync → apaga tudo localmente
            if (wasDownload) {
                await removeManhwaLocal(manhwa.id);
                setLocalFiles(new Set());
            }
            onUpdate();
        } catch (error) {
            console.error('Erro ao alterar download:', error);
        } finally {
            setIsTogglingDownload(false);
        }
    };

    const updateStatus = async (newStatus: 'reading' | 'completed' | 'plan_to_read') => {
        try {
            await fetch(`${API_BASE}/api/manhwas/${manhwa.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...manhwa, status: newStatus }),
            });
            setShowStatusPicker(false);
            onUpdate();
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
        }
    };

    const handleChapterRead = (chapterNum: number, filename: string) => {
        // Mantém o currentChapter cumulativo (usado no card "Cap: X/Y" e no servidor),
        // mas marca per-chapter pra UI da lista.
        if (chapterNum > currentChapter) setCurrentChapter(chapterNum);
        setReadChapters(prev => {
            if (prev.has(filename)) return prev;
            const next = new Set(prev);
            next.add(filename);
            return next;
        });
    };

    const isChapterRead = (filename: string): boolean => {
        return readChapters.has(filename);
    };

    const getStatusBadge = () => {
        const badges: Record<string, { text: string, bg: string }> = {
            reading: { text: 'Lendo', bg: 'bg-blue-600' },
            completed: { text: 'Completo', bg: 'bg-green-600' },
            plan_to_read: { text: 'Planejo Ler', bg: 'bg-yellow-600' },
        };
        const badge = badges[manhwa.status] || badges.plan_to_read;
        return (
            <View className={`${badge.bg} px-2 py-1 rounded-full`}>
                <Text className="text-[10px] text-white font-medium">{badge.text}</Text>
            </View>
        );
    };

    const getStatusLabel = (status: string) => {
        if (status === 'reading') return 'Lendo';
        if (status === 'completed') return 'Completo';
        return 'Planejo Ler';
    };

    const readCount = files.filter(f => isChapterRead(f.name)).length;

    // Prefere a cover local (modo offline funciona); senão, fallback pra remota
    const imageUrl = localCoverUri
        ?? (manhwa.cover_url
            ? (manhwa.cover_url.startsWith('/') ? `${API_BASE}${manhwa.cover_url}` : manhwa.cover_url)
            : null);

    return (
        <>
            <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleCardClick}
                className="bg-[#1f1c1c] rounded-lg overflow-hidden shadow-lg border border-gray-800 mb-4"
            >
                {/* Cover image */}
                <View className="w-full bg-[#262525] items-center justify-center relative" style={{ aspectRatio: 2 / 3 }}>
                    {imageUrl ? (
                        <Image
                            source={{ uri: imageUrl }}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                        />
                    ) : (
                        <View className="w-full h-full items-center justify-center">
                            <FileText size={32} color="#4b5563" />
                        </View>
                    )}
                    {manhwa.download && hasTelegramLink ? (
                        <View className="absolute top-2 right-2 bg-blue-600/80 rounded-full p-1.5">
                            <FolderOpen size={12} color="white" />
                        </View>
                    ) : hasLink ? (
                        <View className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5">
                            <ExternalLink size={12} color="rgba(255,255,255,0.8)" />
                        </View>
                    ) : null}
                </View>

                <View className="p-2.5">
                    {/* Title + delete */}
                    <View className="flex-row items-start justify-between mb-1.5 gap-1">
                        <Text className="text-sm font-bold text-white flex-1" numberOfLines={2}>
                            {manhwa.title}
                        </Text>
                        <TouchableOpacity onPress={deleteManhwa} disabled={isDeleting} className="p-1 -mr-1 -mt-0.5">
                            <Trash2 size={14} color="#ef4444" />
                        </TouchableOpacity>
                    </View>

                    {/* Status badge + andamento + ratings */}
                    <View className="flex-row items-center justify-between mb-2 gap-1 flex-wrap">
                        <View className="flex-row items-center gap-1 flex-wrap flex-1">
                            {getStatusBadge()}
                            {manhwa.andamento && (
                                <View className={`px-1.5 py-0.5 rounded-full ${manhwa.andamento === 'finalizado' ? 'bg-purple-600/80' : 'bg-teal-600/80'}`}>
                                    <Text className="text-[9px] text-white font-medium">{manhwa.andamento === 'finalizado' ? 'Finalizado' : 'Em Curso'}</Text>
                                </View>
                            )}
                        </View>
                        <View className="flex-row items-center gap-1.5">
                            {manhwa.medium_reaction !== undefined && manhwa.medium_reaction !== null && manhwa.medium_reaction > 0 ? (
                                <View className="flex-row items-center gap-0.5">
                                    <Heart size={12} color="#fb7185" fill="#fb7185" />
                                    <Text className="text-[11px] text-rose-400">{manhwa.medium_reaction}</Text>
                                </View>
                            ) : null}
                            {manhwa.rating ? (
                                <View className="flex-row items-center gap-0.5">
                                    <Star size={12} color="#eab308" fill="#eab308" />
                                    <Text className="text-[11px] text-yellow-500">{manhwa.rating}/5</Text>
                                </View>
                            ) : null}
                        </View>
                    </View>

                    {/* Chapter info */}
                    {manhwa.current_chapter !== undefined && (
                        <Text className="text-[11px] text-gray-400 mb-2">
                            Cap: {manhwa.current_chapter}{manhwa.total_chapters ? ` / ${manhwa.total_chapters}` : ''}
                        </Text>
                    )}

                    {/* Sync toggle */}
                    {hasTelegramLink && (
                        <TouchableOpacity
                            onPress={toggleDownload}
                            className="flex-row items-center justify-between mb-2 px-2 py-1.5 rounded-md bg-[#262525] border border-gray-800"
                        >
                            <Text className="text-[11px] text-gray-400">Sincronizar</Text>
                            <View className={`w-8 h-4 rounded-full justify-center ${manhwa.download ? 'bg-blue-600' : 'bg-gray-700'}`}>
                                <View
                                    className="w-3 h-3 rounded-full bg-white shadow-sm"
                                    style={{ marginLeft: manhwa.download ? 18 : 2 }}
                                />
                            </View>
                        </TouchableOpacity>
                    )}

                    {/* Status selector */}
                    <TouchableOpacity
                        onPress={() => setShowStatusPicker(true)}
                        className="w-full flex-row items-center justify-between bg-[#262525] px-2.5 py-1.5 rounded-lg border border-gray-800"
                    >
                        <Text className="text-white text-[11px]">{getStatusLabel(manhwa.status)}</Text>
                        <ChevronDown size={12} color="#9ca3af" />
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>

            {/* Status picker modal */}
            <Modal visible={showStatusPicker} transparent={true} animationType="fade" onRequestClose={() => setShowStatusPicker(false)}>
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setShowStatusPicker(false)}
                    className="flex-1 bg-black/60 justify-center p-6"
                >
                    <View className="bg-[#1f1c1c] rounded-xl border border-gray-800 overflow-hidden w-full" onStartShouldSetResponder={() => true}>
                        <View className="p-4 border-b border-gray-800">
                            <Text className="text-white font-bold text-lg text-center">Status</Text>
                        </View>
                        <TouchableOpacity onPress={() => updateStatus('plan_to_read')} className="p-4 border-b border-gray-800/50">
                            <Text className={`text-center ${manhwa.status === 'plan_to_read' ? 'text-yellow-500 font-bold' : 'text-gray-300'}`}>Planejo Ler</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => updateStatus('reading')} className="p-4 border-b border-gray-800/50">
                            <Text className={`text-center ${manhwa.status === 'reading' ? 'text-blue-500 font-bold' : 'text-gray-300'}`}>Lendo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => updateStatus('completed')} className="p-4">
                            <Text className={`text-center ${manhwa.status === 'completed' ? 'text-green-500 font-bold' : 'text-gray-300'}`}>Completo</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Files modal */}
            <Modal visible={showFiles} transparent={true} animationType="fade" onRequestClose={() => setShowFiles(false)}>
                <View className="flex-1 bg-black/70 justify-center p-4">
                    <View className="bg-[#1f1c1c] rounded-lg border border-gray-800 max-h-[80%] overflow-hidden flex-1 shadow-2xl">
                        <View className="p-4 border-b border-gray-800 flex-row items-start justify-between gap-4">
                            <View className="flex-row items-start flex-1 gap-2">
                                <FolderOpen size={18} color="#ed4545" style={{ marginTop: 2 }} />
                                <Text className="text-white font-semibold flex-1" numberOfLines={2}>{manhwa.title}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowFiles(false)} className="p-1">
                                <X size={20} color="#9ca3af" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            ref={filesScrollRef}
                            className="p-4"
                            contentContainerStyle={{ paddingBottom: 24 }}
                        >
                            {isLoadingFiles ? (
                                <View className="py-8 items-center">
                                    <ActivityIndicator size="small" color="#3b82f6" style={{ marginBottom: 12 }} />
                                    <Text className="text-gray-400">Carregando arquivos...</Text>
                                </View>
                            ) : files.length === 0 ? (
                                <View className="py-8 items-center">
                                    <FileText size={32} color="#6b7280" style={{ marginBottom: 12, opacity: 0.5 }} />
                                    <Text className="text-gray-500 text-center">Nenhum arquivo baixado ainda.</Text>
                                    <Text className="text-xs text-gray-600 text-center mt-1">Clique em "Sincronizar" para baixar os capítulos.</Text>
                                </View>
                            ) : (
                                <View>
                                    <Text className="text-xs text-gray-500 mb-3">
                                        {files.length} capítulo{files.length > 1 ? 's' : ''} baixado{files.length > 1 ? 's' : ''}
                                        {readCount > 0 && (
                                            <Text className="text-green-400"> · {readCount} lido{readCount > 1 ? 's' : ''}</Text>
                                        )}
                                    </Text>
                                    {files.map((file, i) => {
                                        const read = isChapterRead(file.name);
                                        const chapterNumber = file.chapter_number || i + 1;
                                        return (
                                            <TouchableOpacity
                                                key={i}
                                                activeOpacity={0.75}
                                                onLayout={handleItemLayout(i)}
                                                onPress={() => {
                                                    setShowFiles(false);
                                                    openReader({
                                                        manhwaId: manhwa.id,
                                                        filename: file.name,
                                                        chapterNumber,
                                                        files,
                                                        onChapterRead: handleChapterRead,
                                                        onClose: onUpdate,
                                                    });
                                                }}
                                                style={{
                                                    marginBottom: 8,
                                                    paddingVertical: 11,
                                                    paddingHorizontal: 14,
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    gap: 10,
                                                    borderRadius: 6,
                                                    borderWidth: 1,
                                                    backgroundColor: read ? '#142119' : '#262525',
                                                    borderColor: read ? '#14532d' : '#1f2937',
                                                }}
                                            >
                                                {read ? (
                                                    <CheckCircle2 size={16} color="#4ade80" />
                                                ) : (
                                                    <FileText size={16} color="#60a5fa" />
                                                )}
                                                <Text
                                                    className={`text-sm flex-1 ${read ? 'text-green-300/80' : 'text-white'}`}
                                                    numberOfLines={1}
                                                >
                                                    <Text className="text-gray-500 font-mono text-xs">#{chapterNumber} </Text>
                                                    {file.name}
                                                </Text>
                                                {read && (
                                                    <Text className="text-[10px] text-green-500 uppercase tracking-wider font-medium">Lido</Text>
                                                )}
                                                {localFiles.has(file.name) && (
                                                    <DownloadIcon size={12} color="#60a5fa" />
                                                )}
                                                <Text className="text-xs text-gray-500">{file.size_mb} MB</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </>
    );
}

export default React.memo(ManhwaCard);
