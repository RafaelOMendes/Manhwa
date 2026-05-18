import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Modal, ScrollView, Linking, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Star, Trash2, ExternalLink, Heart, FileText, X, FolderOpen, CheckCircle2, ChevronDown } from 'lucide-react-native';
import { Manhwa } from '../types/manhwa';
import CbzReader from './CbzReader';
import { API_BASE } from '../lib/api';

interface CbzFile {
    name: string;
    size_mb: number;
    chapter_number: number;
}

interface ManhwaCardProps {
    manhwa: Manhwa;
    onUpdate: () => void;
}

export default function ManhwaCard({ manhwa, onUpdate }: ManhwaCardProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [isTogglingDownload, setIsTogglingDownload] = useState(false);
    const [showFiles, setShowFiles] = useState(false);
    const [files, setFiles] = useState<CbzFile[]>([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    const [readingFile, setReadingFile] = useState<string | null>(null);
    const [readingChapterNum, setReadingChapterNum] = useState<number | undefined>();
    const [currentChapter, setCurrentChapter] = useState(manhwa.current_chapter || 0);
    const [showStatusPicker, setShowStatusPicker] = useState(false);

    const hasLink = manhwa.notes && manhwa.notes.startsWith('http');
    const hasTelegramLink = manhwa.notes && manhwa.notes.includes('t.me');

    const handleCardClick = async () => {
        if (manhwa.download && hasTelegramLink) {
            setIsLoadingFiles(true);
            setShowFiles(true);
            try {
                const response = await fetch(`${API_BASE}/api/manhwas/${manhwa.id}/files`);
                const data = await response.json();
                setFiles(data.files || []);
                setCurrentChapter(data.current_chapter || 0);
            } catch (error) {
                console.error('Erro ao buscar arquivos:', error);
                setFiles([]);
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
        try {
            await fetch(`${API_BASE}/api/manhwas/${manhwa.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...manhwa, download: !manhwa.download }),
            });
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

    const handleChapterRead = (chapterNum: number) => {
        setCurrentChapter(chapterNum);
    };

    const isChapterRead = (index: number): boolean => {
        return index + 1 <= currentChapter;
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

    const readCount = files.filter((_, i) => isChapterRead(i)).length;

    // Fix: prefix API_BASE for relative URLs (covers served by the backend)
    const imageUrl = manhwa.cover_url
        ? (manhwa.cover_url.startsWith('/')
            ? `${API_BASE}${manhwa.cover_url}`
            : manhwa.cover_url)
        : null;

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
                        <View className="p-4 border-b border-gray-800 flex-row items-start justify-between">
                            <View className="flex-row items-start flex-1 mr-2">
                                <FolderOpen size={18} color="#ed4545" style={{ marginTop: 2, marginRight: 8 }} />
                                <Text className="text-white font-bold flex-1" numberOfLines={2}>{manhwa.title}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowFiles(false)} className="p-1">
                                <X size={20} color="#9ca3af" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView className="p-4" contentContainerStyle={{ paddingBottom: 24 }}>
                            {isLoadingFiles ? (
                                <View className="py-8 items-center">
                                    <ActivityIndicator size="small" color="#3b82f6" style={{ marginBottom: 12 }} />
                                    <Text className="text-gray-400">Carregando arquivos...</Text>
                                </View>
                            ) : files.length === 0 ? (
                                <View className="py-8 items-center">
                                    <FileText size={32} color="#6b7280" style={{ marginBottom: 12, opacity: 0.5 }} />
                                    <Text className="text-gray-500 text-center">Nenhum arquivo baixado ainda.</Text>
                                    <Text className="text-xs text-gray-600 text-center mt-1">Sincronize para baixar.</Text>
                                </View>
                            ) : (
                                <View>
                                    <Text className="text-xs text-gray-500 mb-3">
                                        {files.length} capítulo(s) baixado(s)
                                        {readCount > 0 && <Text className="text-green-400"> · {readCount} lido(s)</Text>}
                                    </Text>
                                    {files.map((file, i) => {
                                        const read = isChapterRead(i);
                                        const chapterNumber = i + 1;
                                        return (
                                            <TouchableOpacity
                                                key={i}
                                                onPress={() => {
                                                    setShowFiles(false);
                                                    setReadingChapterNum(chapterNumber);
                                                    setReadingFile(file.name);
                                                }}
                                                className={`flex-row items-center gap-3 px-3 py-2 rounded-md border mb-2 ${read ? 'bg-green-950/20 border-green-800/40' : 'bg-[#262525] border-gray-800/50'}`}
                                            >
                                                {read ? (
                                                    <CheckCircle2 size={16} color="#4ade80" />
                                                ) : (
                                                    <FileText size={16} color="#60a5fa" />
                                                )}
                                                <View className="flex-1 flex-row items-center">
                                                    <Text className="text-gray-500 font-mono text-xs mr-2">#{chapterNumber}</Text>
                                                    <Text className={`text-sm flex-1 ${read ? 'text-green-300/80' : 'text-white'}`} numberOfLines={1}>
                                                        {file.name}
                                                    </Text>
                                                </View>
                                                {read && (
                                                    <Text className="text-[10px] text-green-500 uppercase tracking-wider font-medium mr-2">Lido</Text>
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

            {readingFile && (
                <CbzReader
                    manhwaId={manhwa.id}
                    filename={readingFile}
                    chapterNumber={readingChapterNum}
                    files={files}
                    onClose={() => {
                        setReadingFile(null);
                        onUpdate();
                    }}
                    onChapterRead={handleChapterRead}
                    onNavigate={(newFilename, newChapterNum) => {
                        setReadingFile(newFilename);
                        setReadingChapterNum(newChapterNum);
                    }}
                />
            )}
        </>
    );
}
