import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookOpen, Plus, Download, CheckCircle, XCircle } from 'lucide-react-native';
import ManhwaCard from '../components/ManhwaCard';
import AddManhwaModal from '../components/AddManhwaModal';
import { Manhwa } from '../types/manhwa';
import { API_BASE } from '../lib/api';

export default function Home() {
    const [manhwas, setManhwas] = useState<Manhwa[]>([]);
    const [filter, setFilter] = useState<'all' | 'reading' | 'completed' | 'plan_to_read' | 'top30'>('all');
    const [showOnlyNew, setShowOnlyNew] = useState(false);
    const [showOnlyUnreadTop30, setShowOnlyUnreadTop30] = useState(false);
    const [showOnlyDownloaded, setShowOnlyDownloaded] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchManhwas();
    }, []);

    const fetchManhwas = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/manhwas`);
            const data = await response.json();
            setManhwas(data);
        } catch (error) {
            console.error('Erro ao buscar manhwas:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const syncDownloads = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        setSyncResult(null);

        try {
            const response = await fetch(`${API_BASE}/api/manhwas/download-all`, { method: 'POST' });
            const data = await response.json();
            setSyncResult({ success: data.success, message: data.message });
            setTimeout(() => setSyncResult(null), 8000);
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

    const renderHeader = () => (
        <View className="mb-6 mt-4 px-4">
            <View className="flex-row items-center justify-between mb-6">
                <View className="flex-row items-center gap-2">
                    <BookOpen size={28} color="#ed4545" />
                    <Text className="text-2xl font-bold text-white">Manhwa Tracker</Text>
                </View>
            </View>

            <View className="flex-row gap-2 mb-6">
                <TouchableOpacity
                    onPress={syncDownloads}
                    disabled={isSyncing}
                    className="flex-1 flex-row items-center justify-center gap-2 bg-blue-600 py-3 rounded-xl"
                >
                    {isSyncing ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Download size={18} color="#fff" />
                    )}
                    <Text className="text-white font-medium">{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => setIsModalOpen(true)}
                    className="flex-1 flex-row items-center justify-center gap-2 bg-primary-500 py-3 rounded-xl"
                >
                    <Plus size={18} color="#fff" />
                    <Text className="text-white font-medium">Adicionar</Text>
                </TouchableOpacity>
            </View>

            {syncResult && (
                <View className={`flex-row items-center gap-2 mb-4 px-4 py-3 rounded-xl ${syncResult.success ? 'bg-green-900/40 border border-green-800/50' : 'bg-red-900/40 border border-red-800/50'}`}>
                    {syncResult.success ? <CheckCircle size={18} color="#4ade80" /> : <XCircle size={18} color="#f87171" />}
                    <Text className={`text-sm ${syncResult.success ? 'text-green-400' : 'text-red-400'}`}>{syncResult.message}</Text>
                </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                <View className="flex-row gap-2 pr-4">
                    {[
                        { id: 'all', label: 'Todos' },
                        { id: 'reading', label: 'Lendo' },
                        { id: 'top30', label: '🔥 Top 30' },
                        { id: 'completed', label: 'Completos' },
                        { id: 'plan_to_read', label: 'Planejo Ler' },
                    ].map(f => (
                        <TouchableOpacity
                            key={f.id}
                            onPress={() => setFilter(f.id as any)}
                            className={`px-4 py-2.5 rounded-lg border border-gray-800 ${filter === f.id ? (f.id === 'top30' ? 'bg-rose-600 border-rose-600' : 'bg-primary-500 border-primary-500') : 'bg-[#1f1c1c]'}`}
                        >
                            <Text className={`font-medium ${filter === f.id ? 'text-white' : 'text-gray-300'}`}>{f.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>

            <View className="flex-row flex-wrap gap-2 mb-2">
                <TouchableOpacity
                    onPress={() => setShowOnlyDownloaded(!showOnlyDownloaded)}
                    className={`flex-row items-center px-3 py-2 rounded-lg border ${showOnlyDownloaded ? 'bg-blue-900/30 border-blue-800' : 'bg-[#1f1c1c] border-gray-800'}`}
                >
                    <Text className={`text-xs ${showOnlyDownloaded ? 'text-blue-400' : 'text-gray-400'}`}>Apenas baixados</Text>
                </TouchableOpacity>

                {filter === 'reading' && (
                    <TouchableOpacity
                        onPress={() => setShowOnlyNew(!showOnlyNew)}
                        className={`flex-row items-center px-3 py-2 rounded-lg border ${showOnlyNew ? 'bg-blue-900/30 border-blue-800' : 'bg-[#1f1c1c] border-gray-800'}`}
                    >
                        <Text className={`text-xs ${showOnlyNew ? 'text-blue-400' : 'text-gray-400'}`}>Capítulos novos</Text>
                    </TouchableOpacity>
                )}

                {filter === 'top30' && (
                    <TouchableOpacity
                        onPress={() => setShowOnlyUnreadTop30(!showOnlyUnreadTop30)}
                        className={`flex-row items-center px-3 py-2 rounded-lg border ${showOnlyUnreadTop30 ? 'bg-rose-900/30 border-rose-800' : 'bg-[#1f1c1c] border-gray-800'}`}
                    >
                        <Text className={`text-xs ${showOnlyUnreadTop30 ? 'text-rose-400' : 'text-gray-400'}`}>Não lidos</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );

    return (
        <SafeAreaView className="flex-1 bg-[#262525]">
            <FlatList
                data={filteredManhwas}
                keyExtractor={(item) => item.id.toString()}
                ListHeaderComponent={renderHeader}
                contentContainerStyle={{ paddingBottom: 24 }}
                ListEmptyComponent={() => (
                    !isLoading ? (
                        <View className="items-center py-16 px-4">
                            <BookOpen size={48} color="#4b5563" style={{ marginBottom: 16 }} />
                            <Text className="text-gray-400 text-lg text-center">Nenhum manhwa encontrado. Adicione seu primeiro manhwa!</Text>
                        </View>
                    ) : (
                        <View className="py-16 items-center">
                            <ActivityIndicator size="large" color="#ed4545" />
                        </View>
                    )
                )}
                renderItem={({ item }) => (
                    <View className="px-4">
                        <ManhwaCard manhwa={item} onUpdate={fetchManhwas} />
                    </View>
                )}
            />

            <AddManhwaModal
                visible={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onAdd={fetchManhwas}
            />
        </SafeAreaView>
    );
}
