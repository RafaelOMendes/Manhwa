import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, FlatList, Dimensions, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { X, ChevronUp, ChevronLeft, ChevronRight, CheckCircle, SkipForward } from 'lucide-react-native';
import { API_BASE } from '../lib/api';
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
    onChapterRead?: (chapterNumber: number) => void;
    onNavigate?: (filename: string, chapterNumber: number) => void;
}

function extractChapterNumber(filename: string): number {
    const m = filename.match(/(?:cap(?:[ií]tulo)?\.?\s*|chapter\s*|ch\.?\s*|ep\.?\s*|#)(\d+(?:\.\d+)?)/i);
    if (m) return Math.floor(parseFloat(m[1]));
    const nums = filename.match(/(\d+(?:\.\d+)?)/g);
    if (nums && nums.length > 0) return Math.floor(parseFloat(nums[nums.length - 1]));
    return 0;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function CbzReader({ manhwaId, filename, chapterNumber, files, onClose, onChapterRead, onNavigate }: CbzReaderProps) {
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showUI, setShowUI] = useState(true);
    const [reachedEnd, setReachedEnd] = useState(false);
    const insets = useSafeAreaInsets();

    const flatListRef = useRef<FlatList>(null);
    const hasMarkedRef = useRef(false);

    const currentIndex = files?.findIndex(f => f.name === filename) ?? -1;
    const prevChapter = files && currentIndex > 0 ? files[currentIndex - 1] : null;
    const nextChapter = files && currentIndex >= 0 && currentIndex < files.length - 1 ? files[currentIndex + 1] : null;
    const chapNum = files && currentIndex >= 0 ? currentIndex + 1 : (chapterNumber ?? extractChapterNumber(filename));

    useEffect(() => {
        setLoading(true);
        setReachedEnd(false);
        hasMarkedRef.current = false;
        const fetchInfo = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}`);
                const data = await res.json();
                setTotalPages(data.total_pages);
            } catch (error) {
                console.error('Erro ao carregar CBZ:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchInfo();
    }, [manhwaId, filename]);

    useEffect(() => {
        if (!showUI) return;
        const timer = setTimeout(() => setShowUI(false), 3000);
        return () => clearTimeout(timer);
    }, [showUI]);

    const markChapterAsRead = useCallback(async () => {
        if (hasMarkedRef.current || chapNum <= 0) return;
        hasMarkedRef.current = true;

        try {
            await fetch(`${API_BASE}/api/manhwas/${manhwaId}/current-chapter`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_chapter: chapNum }),
            });
            onChapterRead?.(chapNum);
        } catch (error) {
            console.error('Erro ao marcar capítulo como lido:', error);
            hasMarkedRef.current = false;
        }
    }, [manhwaId, chapNum, onChapterRead]);

    const handleEndReached = () => {
        if (totalPages > 0 && !loading && !reachedEnd) {
            setReachedEnd(true);
            markChapterAsRead();
        }
    };

    const toggleUI = () => setShowUI(prev => !prev);
    const scrollToTop = () => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    };

    const goToChapter = (file: ChapterFile) => {
        onNavigate?.(file.name, file.chapter_number);
    };

    const pages = Array.from({ length: totalPages }, (_, i) => ({
        id: i.toString(),
        url: `${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}/page/${i}`,
    }));

    const renderHeader = () => {
        if (!showUI) return null;
        return (
            <View style={[styles.header, { paddingTop: insets.top || 16 }]} className="bg-black/80 flex-row items-center justify-between px-3 pb-3 absolute top-0 left-0 right-0 z-10">
                <TouchableOpacity
                    onPress={() => prevChapter && goToChapter(prevChapter)}
                    disabled={!prevChapter}
                    className={`flex-row items-center gap-1 px-2.5 py-1.5 rounded-lg ${prevChapter ? 'opacity-100' : 'opacity-30'}`}
                >
                    <ChevronLeft size={20} color="white" />
                </TouchableOpacity>

                <Text className="text-white text-sm font-medium flex-1 text-center" numberOfLines={1}>
                    {filename.replace('.cbz', '')}
                    {files && files.length > 0 && (
                        <Text className="text-white/40 text-xs"> ({currentIndex + 1}/{files.length})</Text>
                    )}
                </Text>

                <View className="flex-row items-center">
                    <TouchableOpacity
                        onPress={() => nextChapter && goToChapter(nextChapter)}
                        disabled={!nextChapter}
                        className={`flex-row items-center px-2.5 py-1.5 rounded-lg ${nextChapter ? 'opacity-100' : 'opacity-30'}`}
                    >
                        <ChevronRight size={20} color="white" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onClose} className="p-1.5 ml-1">
                        <X size={24} color="white" />
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    const renderFooter = () => {
        if (loading || totalPages === 0) return null;
        return (
            <View className="py-16 px-6 items-center flex-col gap-6">
                <Text className="text-white/30 text-xs uppercase tracking-widest text-center mb-4">Fim do capítulo</Text>
                <View className="w-full max-w-sm flex-row items-center justify-center gap-3">
                    {prevChapter && (
                        <TouchableOpacity
                            onPress={() => goToChapter(prevChapter)}
                            className="flex-1 flex-row items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/10 bg-white/5"
                        >
                            <ChevronLeft size={18} color="#fff" opacity={0.7} />
                            <Text className="text-white/70 text-sm">Anterior</Text>
                        </TouchableOpacity>
                    )}
                    {nextChapter ? (
                        <TouchableOpacity
                            onPress={() => goToChapter(nextChapter)}
                            className="flex-1 flex-row items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-blue-600"
                        >
                            <SkipForward size={18} color="#fff" />
                            <Text className="text-white font-medium">Próximo</Text>
                        </TouchableOpacity>
                    ) : (
                        <View className="flex-1 flex-row items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/10 bg-white/5">
                            <CheckCircle size={18} color="#fff" opacity={0.3} />
                            <Text className="text-white/30 text-sm">Último disponível</Text>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    return (
        <Modal visible={true} transparent={false} animationType="slide" onRequestClose={onClose}>
            <View className="flex-1 bg-black">
                {renderHeader()}
                
                {loading ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator size="large" color="#ffffff" />
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={pages}
                        keyExtractor={(item) => item.id}
                        showsVerticalScrollIndicator={false}
                        onEndReached={handleEndReached}
                        onEndReachedThreshold={0.5}
                        ListFooterComponent={renderFooter}
                        renderItem={({ item }) => (
                            <TouchableOpacity activeOpacity={1} onPress={toggleUI}>
                                <Image
                                    source={{ uri: item.url }}
                                    style={{ width: SCREEN_WIDTH, minHeight: SCREEN_HEIGHT }}
                                    contentFit="contain"
                                    transition={200}
                                />
                            </TouchableOpacity>
                        )}
                    />
                )}

                {showUI && !reachedEnd && (
                    <TouchableOpacity
                        onPress={scrollToTop}
                        className="absolute bottom-6 right-6 bg-white/20 p-3 rounded-full"
                    >
                        <ChevronUp size={24} color="white" />
                    </TouchableOpacity>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    header: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    }
});
