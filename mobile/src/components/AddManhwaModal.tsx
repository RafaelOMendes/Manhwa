import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { X, Star } from 'lucide-react-native';
import { CreateManhwaDto } from '../types/manhwa';
import { API_BASE } from '../lib/api';

interface AddManhwaModalProps {
    visible: boolean;
    onClose: () => void;
    onAdd: () => void;
}

export default function AddManhwaModal({ visible, onClose, onAdd }: AddManhwaModalProps) {
    const [formData, setFormData] = useState<CreateManhwaDto>({
        title: '',
        cover_url: '',
        status: 'plan_to_read',
        current_chapter: 0,
        total_chapters: undefined,
        rating: undefined,
        notes: '',
    });

    const handleSubmit = async () => {
        if (!formData.title) return;
        try {
            await fetch(`${API_BASE}/api/manhwas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            onAdd();
            onClose();
        } catch (error) {
            console.error('Erro ao adicionar manhwa:', error);
        }
    };

    const renderStars = () => {
        return (
            <View className="flex-row gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                        key={star}
                        onPress={() => setFormData({ ...formData, rating: star })}
                    >
                        <Star
                            size={32}
                            color="#eab308"
                            fill={(formData.rating || 0) >= star ? "#eab308" : "transparent"}
                        />
                    </TouchableOpacity>
                ))}
            </View>
        );
    };

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <View className="flex-1 bg-black/60 justify-center p-4">
                <View className="bg-[#1f1c1c] rounded-xl border border-gray-800 max-h-[90%] overflow-hidden">
                    <View className="p-4 border-b border-gray-800 flex-row items-center justify-between">
                        <Text className="text-xl font-bold text-white">Adicionar Manhwa</Text>
                        <TouchableOpacity onPress={onClose} className="p-1">
                            <X size={24} color="#9ca3af" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView className="p-4" contentContainerStyle={{ paddingBottom: 24 }}>
                        <View className="mb-4">
                            <Text className="text-sm font-medium text-gray-300 mb-2">Título *</Text>
                            <TextInput
                                className="bg-[#262525] text-white px-4 py-3 rounded-lg border border-gray-800"
                                value={formData.title}
                                onChangeText={(t) => setFormData({ ...formData, title: t })}
                                placeholder="Ex: Solo Leveling"
                                placeholderTextColor="#6b7280"
                            />
                        </View>

                        <View className="mb-4">
                            <Text className="text-sm font-medium text-gray-300 mb-2">URL da Capa</Text>
                            <TextInput
                                className="bg-[#262525] text-white px-4 py-3 rounded-lg border border-gray-800"
                                value={formData.cover_url}
                                onChangeText={(t) => setFormData({ ...formData, cover_url: t })}
                                placeholder="https://..."
                                placeholderTextColor="#6b7280"
                            />
                        </View>

                        <View className="flex-row gap-4 mb-4">
                            <View className="flex-1">
                                <Text className="text-sm font-medium text-gray-300 mb-2">Status</Text>
                                <View className="flex-row flex-wrap gap-2">
                                    <TouchableOpacity 
                                        onPress={() => setFormData({...formData, status: 'plan_to_read'})}
                                        className={`px-3 py-2 rounded-lg border border-gray-800 ${formData.status === 'plan_to_read' ? 'bg-primary-500' : 'bg-[#262525]'}`}
                                    >
                                        <Text className="text-white text-xs text-center">Planejo Ler</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        onPress={() => setFormData({...formData, status: 'reading'})}
                                        className={`px-3 py-2 rounded-lg border border-gray-800 ${formData.status === 'reading' ? 'bg-primary-500' : 'bg-[#262525]'}`}
                                    >
                                        <Text className="text-white text-xs text-center">Lendo</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        onPress={() => setFormData({...formData, status: 'completed'})}
                                        className={`px-3 py-2 rounded-lg border border-gray-800 ${formData.status === 'completed' ? 'bg-primary-500' : 'bg-[#262525]'}`}
                                    >
                                        <Text className="text-white text-xs text-center">Completo</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>

                        <View className="flex-row gap-4 mb-4">
                            <View className="flex-1">
                                <Text className="text-sm font-medium text-gray-300 mb-2">Capítulo Atual</Text>
                                <TextInput
                                    className="bg-[#262525] text-white px-4 py-3 rounded-lg border border-gray-800"
                                    value={formData.current_chapter?.toString() || ''}
                                    onChangeText={(t) => setFormData({ ...formData, current_chapter: parseInt(t) || 0 })}
                                    keyboardType="numeric"
                                />
                            </View>
                            <View className="flex-1">
                                <Text className="text-sm font-medium text-gray-300 mb-2">Total (opcional)</Text>
                                <TextInput
                                    className="bg-[#262525] text-white px-4 py-3 rounded-lg border border-gray-800"
                                    value={formData.total_chapters?.toString() || ''}
                                    onChangeText={(t) => setFormData({ ...formData, total_chapters: parseInt(t) || undefined })}
                                    keyboardType="numeric"
                                />
                            </View>
                        </View>

                        <View className="mb-4">
                            <Text className="text-sm font-medium text-gray-300 mb-2">Avaliação</Text>
                            {renderStars()}
                        </View>

                        <View className="mb-6">
                            <Text className="text-sm font-medium text-gray-300 mb-2">Notas / Link Telegram</Text>
                            <TextInput
                                className="bg-[#262525] text-white px-4 py-3 rounded-lg border border-gray-800"
                                value={formData.notes}
                                onChangeText={(t) => setFormData({ ...formData, notes: t })}
                                multiline
                                numberOfLines={3}
                                textAlignVertical="top"
                            />
                        </View>

                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                onPress={onClose}
                                className="flex-1 bg-[#262525] py-3.5 rounded-lg border border-gray-800 items-center"
                            >
                                <Text className="text-white font-medium">Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleSubmit}
                                className="flex-1 bg-primary-500 py-3.5 rounded-lg items-center"
                            >
                                <Text className="text-white font-medium">Adicionar</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}
