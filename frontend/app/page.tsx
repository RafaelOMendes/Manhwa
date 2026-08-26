'use client'

import { useState, useEffect } from 'react'
import { BookOpen, Plus, Download, Loader2, CheckCircle, XCircle } from 'lucide-react'
import ManhwaCard from '@/components/ManhwaCard'
import AddManhwaModal from '@/components/AddManhwaModal'
import { Manhwa } from '@/types/manhwa'
import { API_BASE, authHeaders } from '@/lib/api'

export default function Home() {
    const [manhwas, setManhwas] = useState<Manhwa[]>([])
    const [filter, setFilter] = useState<'all' | 'reading' | 'completed' | 'plan_to_read' | 'top30'>('all')
    const [showOnlyNew, setShowOnlyNew] = useState(false)
    const [showOnlyDownloaded, setShowOnlyDownloaded] = useState(false)
    const [showOnlyUnreadTop30, setShowOnlyUnreadTop30] = useState(false)
    const [showOnlyMoreThan80Chapters, setShowOnlyMoreThan80Chapters] = useState(false)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isSyncing, setIsSyncing] = useState(false)
    const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null)

    useEffect(() => {
        fetchManhwas()
    }, [])

    const fetchManhwas = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/manhwas`, { headers: authHeaders() })
            const data = await response.json()
            setManhwas(data)
        } catch (error) {
            console.error('Erro ao buscar manhwas:', error)
        }
    }

    const syncDownloads = async () => {
        if (isSyncing) return

        setIsSyncing(true)
        setSyncResult(null)

        try {
            const response = await fetch(`${API_BASE}/api/manhwas/download-all`, {
                method: 'POST',
                headers: authHeaders(),
            })
            const data = await response.json()

            if (!response.ok) {
                setSyncResult({ success: false, message: data.message || `Erro do servidor (${response.status})` })
            } else {
                setSyncResult({ success: data.success, message: data.message })
            }

            // Limpar feedback após 8 segundos
            setTimeout(() => setSyncResult(null), 8000)
        } catch (error) {
            console.error('Erro na sincronização:', error)
            setSyncResult({ success: false, message: 'Erro de conexão com o servidor' })
            setTimeout(() => setSyncResult(null), 8000)
        } finally {
            setIsSyncing(false)
        }
    }

    const filteredManhwas = (() => {
        let result = [...manhwas]

        if (filter === 'top30') {
            if (showOnlyUnreadTop30) {
                result = result.filter(m => m.status !== 'reading' && m.status !== 'completed')
            }
            if (showOnlyMoreThan80Chapters) {
                result = result.filter(m => (m.total_chapters ?? 0) > 80)
            }
            return result
                .sort((a, b) => (b.medium_reaction ?? 0) - (a.medium_reaction ?? 0))
                .slice(0, 30)
        }

        return result.filter(manhwa => {
            if (filter === 'all') return true
            if (filter === 'reading') {
                if (manhwa.status !== 'reading') return false
                if (showOnlyDownloaded && !manhwa.download) return false
                if (showOnlyNew) {
                    return manhwa.total_chapters !== undefined &&
                        manhwa.total_chapters !== null &&
                        manhwa.current_chapter !== undefined &&
                        manhwa.total_chapters > manhwa.current_chapter
                }
                return true
            }
            return manhwa.status === filter
        })
    })()

    return (
        <main className="min-h-screen bg-gradient-to-b from-background-dark to-background-darker text-white">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
                <header className="mb-6 sm:mb-8">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-2 sm:gap-3">
                            <BookOpen size={32} className="text-primary-500 sm:w-10 sm:h-10" />
                            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">Manhwa Tracker</h1>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <button
                                onClick={syncDownloads}
                                disabled={isSyncing}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed px-3 sm:px-4 py-2 rounded-lg transition text-sm sm:text-base flex-1 sm:flex-none justify-center"
                            >
                                {isSyncing ? (
                                    <Loader2 size={18} className="sm:w-5 sm:h-5 animate-spin" />
                                ) : (
                                    <Download size={18} className="sm:w-5 sm:h-5" />
                                )}
                                <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
                            </button>
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 px-3 sm:px-4 py-2 rounded-lg transition text-sm sm:text-base flex-1 sm:flex-none justify-center"
                            >
                                <Plus size={18} className="sm:w-5 sm:h-5" />
                                <span className="sm:inline">Adicionar</span>
                            </button>
                        </div>
                    </div>

                    {syncResult && (
                        <div className={`flex items-center gap-2 text-sm mb-4 px-4 py-3 rounded-lg ${syncResult.success
                            ? 'bg-green-900/40 text-green-400 border border-green-800/50'
                            : 'bg-red-900/40 text-red-400 border border-red-800/50'
                            }`}>
                            {syncResult.success ? (
                                <CheckCircle size={18} className="flex-shrink-0" />
                            ) : (
                                <XCircle size={18} className="flex-shrink-0" />
                            )}
                            <span>{syncResult.message}</span>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2 sm:gap-3">
                        <button
                            onClick={() => setFilter('all')}
                            className={`px-3 sm:px-4 py-2 rounded-lg transition text-sm sm:text-base flex-1 sm:flex-none ${filter === 'all' ? 'bg-primary-500' : 'bg-background-darker hover:bg-gray-800'
                                }`}
                        >
                            Todos
                        </button>
                        <button
                            onClick={() => setFilter('reading')}
                            className={`px-3 sm:px-4 py-2 rounded-lg transition text-sm sm:text-base flex-1 sm:flex-none ${filter === 'reading' ? 'bg-primary-500' : 'bg-background-darker hover:bg-gray-800'
                                }`}
                        >
                            Lendo
                        </button>

                        <button
                            onClick={() => setFilter('top30')}
                            className={`px-3 sm:px-4 py-2 rounded-lg transition text-sm sm:text-base flex-1 sm:flex-none ${filter === 'top30' ? 'bg-rose-600' : 'bg-background-darker hover:bg-gray-800'
                                }`}
                        >
                            🔥 Top 30
                        </button>
                        <button
                            onClick={() => setFilter('completed')}
                            className={`px-3 sm:px-4 py-2 rounded-lg transition text-sm sm:text-base flex-1 sm:flex-none ${filter === 'completed' ? 'bg-primary-500' : 'bg-background-darker hover:bg-gray-800'
                                }`}
                        >
                            Completos
                        </button>
                        <button
                            onClick={() => setFilter('plan_to_read')}
                            className={`px-3 sm:px-4 py-2 rounded-lg transition text-sm sm:text-base flex-1 sm:flex-none ${filter === 'plan_to_read' ? 'bg-primary-500' : 'bg-background-darker hover:bg-gray-800'
                                }`}
                        >
                            Planejo Ler
                        </button>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        {filter === 'reading' && (
                            <>
                                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white transition bg-background-darker/50 px-3 py-2 rounded-lg border border-gray-800/50">
                                    <input
                                        type="checkbox"
                                        checked={showOnlyNew}
                                        onChange={(e) => setShowOnlyNew(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-600 bg-background-dark text-blue-500 focus:ring-blue-500 focus:ring-offset-background-dark"
                                    />
                                    <span>Apenas com capítulos novos</span>
                                </label>
                                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white transition bg-background-darker/50 px-3 py-2 rounded-lg border border-gray-800/50">
                                    <input
                                        type="checkbox"
                                        checked={showOnlyDownloaded}
                                        onChange={(e) => setShowOnlyDownloaded(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-600 bg-background-dark text-blue-500 focus:ring-blue-500 focus:ring-offset-background-dark"
                                    />
                                    <span>Apenas com download</span>
                                </label>
                            </>
                        )}

                        {filter === 'top30' && (
                            <>
                                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white transition bg-background-darker/50 px-3 py-2 rounded-lg border border-rose-900/30">
                                    <input
                                        type="checkbox"
                                        checked={showOnlyUnreadTop30}
                                        onChange={(e) => setShowOnlyUnreadTop30(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-600 bg-background-dark text-rose-500 focus:ring-rose-500 focus:ring-offset-background-dark"
                                    />
                                    <span>Apenas os que não li nenhum capítulo</span>
                                </label>
                                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white transition bg-background-darker/50 px-3 py-2 rounded-lg border border-rose-900/30">
                                    <input
                                        type="checkbox"
                                        checked={showOnlyMoreThan80Chapters}
                                        onChange={(e) => setShowOnlyMoreThan80Chapters(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-600 bg-background-dark text-rose-500 focus:ring-rose-500 focus:ring-offset-background-dark"
                                    />
                                    <span>Mais de 80 capítulos</span>
                                </label>
                            </>
                        )}
                    </div>
                </header>

                {filteredManhwas.length === 0 ? (
                    <div className="text-center py-12 sm:py-16">
                        <BookOpen size={48} className="mx-auto mb-4 text-gray-600 sm:w-16 sm:h-16" />
                        <p className="text-lg sm:text-xl text-gray-400 px-4">
                            Nenhum manhwa encontrado. Adicione seu primeiro manhwa!
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-5 lg:gap-6">
                        {filteredManhwas.map((manhwa) => (
                            <ManhwaCard key={manhwa.id} manhwa={manhwa} onUpdate={fetchManhwas} />
                        ))}
                    </div>
                )}
            </div>

            {isModalOpen && (
                <AddManhwaModal
                    onClose={() => setIsModalOpen(false)}
                    onAdd={fetchManhwas}
                />
            )}
        </main>
    )
}
