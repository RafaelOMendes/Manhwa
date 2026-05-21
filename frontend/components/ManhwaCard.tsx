'use client'

import { useState, useRef, useEffect } from 'react'
import { Star, Trash2, ExternalLink, Heart, FileText, X, FolderOpen, CheckCircle2 } from 'lucide-react'
import { Manhwa } from '@/types/manhwa'
import CbzReader from './CbzReader'
import { API_BASE, authHeaders } from '@/lib/api'

interface CbzFile {
    name: string
    size_mb: number
    chapter_number: number
}

interface ManhwaCardProps {
    manhwa: Manhwa
    onUpdate: () => void
}

export default function ManhwaCard({ manhwa, onUpdate }: ManhwaCardProps) {
    const [isDeleting, setIsDeleting] = useState(false)
    const [isTogglingDownload, setIsTogglingDownload] = useState(false)
    const [showFiles, setShowFiles] = useState(false)
    const [files, setFiles] = useState<CbzFile[]>([])
    const [isLoadingFiles, setIsLoadingFiles] = useState(false)
    const [readingFile, setReadingFile] = useState<string | null>(null)
    const [readingChapterNum, setReadingChapterNum] = useState<number | undefined>()
    const [currentChapter, setCurrentChapter] = useState(manhwa.current_chapter || 0)
    
    const firstUnreadRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (showFiles && !isLoadingFiles && files.length > 0) {
            setTimeout(() => {
                if (firstUnreadRef.current) {
                    firstUnreadRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
            }, 100)
        }
    }, [showFiles, isLoadingFiles, files.length])

    // Bloquear scroll do fundo quando modal ou leitor estiverem abertos
    useEffect(() => {
        if (showFiles || readingFile) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [showFiles, readingFile])

    const hasLink = manhwa.notes && manhwa.notes.startsWith('http')
    const hasTelegramLink = manhwa.notes && manhwa.notes.includes('t.me')

    const handleCardClick = async () => {
        // Se tem sincronização ativa, mostrar lista de arquivos
        if (manhwa.download && hasTelegramLink) {
            setIsLoadingFiles(true)
            setShowFiles(true)
            try {
                const response = await fetch(`${API_BASE}/api/manhwas/${manhwa.id}/files`, { headers: authHeaders() })
                const data = await response.json()
                setFiles(data.files || [])
                setCurrentChapter(data.current_chapter || 0)
            } catch (error) {
                console.error('Erro ao buscar arquivos:', error)
                setFiles([])
            } finally {
                setIsLoadingFiles(false)
            }
            return
        }

        // Senão, abre o link normalmente
        if (hasLink) {
            window.open(manhwa.notes!, '_blank', 'noopener,noreferrer')
        }
    }

    const deleteManhwa = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm(`Tem certeza que deseja excluir "${manhwa.title}"?`)) return

        setIsDeleting(true)
        try {
            await fetch(`${API_BASE}/api/manhwas/${manhwa.id}`, {
                method: 'DELETE',
                headers: authHeaders(),
            })
            onUpdate()
        } catch (error) {
            console.error('Erro ao deletar manhwa:', error)
            setIsDeleting(false)
        }
    }

    const toggleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (isTogglingDownload) return

        setIsTogglingDownload(true)
        try {
            await fetch(`${API_BASE}/api/manhwas/${manhwa.id}`, {
                method: 'PUT',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ ...manhwa, download: !manhwa.download }),
            })
            onUpdate()
        } catch (error) {
            console.error('Erro ao alterar download:', error)
        } finally {
            setIsTogglingDownload(false)
        }
    }

    const updateStatus = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        e.stopPropagation()
        const newStatus = e.target.value
        try {
            await fetch(`${API_BASE}/api/manhwas/${manhwa.id}`, {
                method: 'PUT',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ ...manhwa, status: newStatus }),
            })
            onUpdate()
        } catch (error) {
            console.error('Erro ao atualizar status:', error)
        }
    }

    const handleChapterRead = (chapterNum: number) => {
        setCurrentChapter(chapterNum)
    }

    const isChapterRead = (index: number): boolean => {
        return index + 1 <= currentChapter
    }

    const getStatusBadge = () => {
        const badges = {
            reading: { text: 'Lendo', color: 'bg-blue-600' },
            completed: { text: 'Completo', color: 'bg-green-600' },
            plan_to_read: { text: 'Planejo Ler', color: 'bg-yellow-600' },
        }
        const badge = badges[manhwa.status]
        return (
            <span className={`${badge.color} text-xs px-2 py-1 rounded-full`}>
                {badge.text}
            </span>
        )
    }

    const readCount = files.filter((_, i) => isChapterRead(i)).length

    return (
        <>
            <div
                onClick={handleCardClick}
                className={`bg-background-darker rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-all border border-gray-800 ${hasLink || (manhwa.download && hasTelegramLink) ? 'cursor-pointer hover:scale-[1.02] hover:border-gray-600' : ''
                    }`}
            >
                {manhwa.cover_url && (
                    <div className="w-full h-48 sm:h-56 md:h-64 bg-background-dark flex items-center justify-center relative">
                        <img
                            src={manhwa.cover_url}
                            alt={manhwa.title}
                            className="w-full h-full object-cover"
                        />
                        {manhwa.download && hasTelegramLink ? (
                            <div className="absolute top-2 right-2 bg-blue-600/80 rounded-full p-1.5">
                                <FolderOpen size={14} className="text-white" />
                            </div>
                        ) : hasLink ? (
                            <div className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5">
                                <ExternalLink size={14} className="text-white/80" />
                            </div>
                        ) : null}
                    </div>
                )}

                <div className="p-3 sm:p-4">
                    <div className="flex items-start justify-between mb-2 gap-2">
                        <h3 className="text-base sm:text-lg font-bold flex-1 line-clamp-2">{manhwa.title}</h3>
                        <button
                            onClick={deleteManhwa}
                            disabled={isDeleting}
                            className="text-red-500 hover:text-red-400 transition flex-shrink-0"
                        >
                            <Trash2 size={16} className="sm:w-[18px] sm:h-[18px]" />
                        </button>
                    </div>

                    <div className="flex items-center justify-between mb-3 gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {getStatusBadge()}
                            {manhwa.andamento && (
                                <span className={`text-xs px-2 py-1 rounded-full ${manhwa.andamento === 'finalizado'
                                    ? 'bg-purple-600/80'
                                    : 'bg-teal-600/80'
                                    }`}>
                                    {manhwa.andamento === 'finalizado' ? 'Finalizado' : 'Em Andamento'}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {manhwa.medium_reaction !== undefined && manhwa.medium_reaction !== null && manhwa.medium_reaction > 0 && (
                                <div className="flex items-center gap-1 text-rose-400">
                                    <Heart size={14} fill="currentColor" className="sm:w-4 sm:h-4" />
                                    <span className="text-xs sm:text-sm">{manhwa.medium_reaction}</span>
                                </div>
                            )}
                            {manhwa.rating && (
                                <div className="flex items-center gap-1 text-yellow-500">
                                    <Star size={14} fill="currentColor" className="sm:w-4 sm:h-4" />
                                    <span className="text-xs sm:text-sm">{manhwa.rating}/5</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {manhwa.current_chapter !== undefined && (
                        <p className="text-xs sm:text-sm text-gray-400 mb-2">
                            Capítulo: {manhwa.current_chapter}
                            {manhwa.total_chapters && ` / ${manhwa.total_chapters}`}
                        </p>
                    )}

                    {hasTelegramLink && (
                        <div
                            onClick={toggleDownload}
                            className="flex items-center justify-between mb-3 px-2 py-1.5 rounded-md bg-background-dark border border-gray-800 cursor-pointer hover:border-gray-700 transition"
                        >
                            <span className="text-xs text-gray-400">Sincronizar</span>
                            <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${manhwa.download ? 'bg-blue-600' : 'bg-gray-700'}`}>
                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${manhwa.download ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                            </div>
                        </div>
                    )}

                    <select
                        value={manhwa.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={updateStatus}
                        className="w-full bg-background-dark text-white px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm hover:bg-gray-800 transition border border-gray-800"
                    >
                        <option value="plan_to_read">Planejo Ler</option>
                        <option value="reading">Lendo</option>
                        <option value="completed">Completo</option>
                    </select>
                </div>
            </div>

            {/* Modal de arquivos baixados */}
            {showFiles && (
                <div
                    className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
                    onClick={() => setShowFiles(false)}
                >
                    <div
                        className="bg-background-darker rounded-lg max-w-lg w-full max-h-[80vh] flex flex-col border border-gray-800 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between p-4 border-b border-gray-800 gap-4">
                            <h3 className="font-semibold flex items-start gap-2 flex-1">
                                <FolderOpen size={18} className="text-primary-500 mt-0.5 flex-shrink-0" />
                                <span className="line-clamp-2 break-words text-left" title={manhwa.title}>
                                    {manhwa.title}
                                </span>
                            </h3>
                            <button
                                onClick={() => setShowFiles(false)}
                                className="text-gray-400 hover:text-white transition p-1 flex-shrink-0"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 p-4">
                            {isLoadingFiles ? (
                                <div className="text-center py-8 text-gray-400">
                                    <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
                                    Carregando arquivos...
                                </div>
                            ) : files.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    <FileText size={32} className="mx-auto mb-3 opacity-50" />
                                    <p>Nenhum arquivo baixado ainda.</p>
                                    <p className="text-xs mt-1">Clique em "Sincronizar" para baixar os capítulos.</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    <p className="text-xs text-gray-500 mb-3">
                                        {files.length} capítulo{files.length > 1 ? 's' : ''} baixado{files.length > 1 ? 's' : ''}
                                        {readCount > 0 && (
                                            <span className="text-green-400 ml-1.5">
                                                · {readCount} lido{readCount > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </p>
                                    {files.map((file, i) => {
                                        const read = isChapterRead(i)
                                        const chapterNumber = i + 1
                                        return (
                                            <div
                                                key={i}
                                                ref={i === currentChapter ? firstUnreadRef : null}
                                                onClick={() => {
                                                    setShowFiles(false)
                                                    setReadingChapterNum(chapterNumber)
                                                    setReadingFile(file.name)
                                                }}
                                                className={`flex items-center gap-3 px-3 py-2 rounded-md border cursor-pointer transition ${read
                                                        ? 'bg-green-950/20 border-green-800/40 hover:border-green-600/50 hover:bg-green-950/30'
                                                        : 'bg-background-dark border-gray-800/50 hover:border-blue-600/50 hover:bg-blue-950/20'
                                                    }`}
                                            >
                                                {read ? (
                                                    <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
                                                ) : (
                                                    <FileText size={16} className="text-blue-400 flex-shrink-0" />
                                                )}
                                                <span className={`text-sm flex-1 truncate ${read ? 'text-green-300/80' : ''}`}>
                                                    <span className="text-gray-500 mr-2 font-mono text-xs">#{chapterNumber}</span>
                                                    {file.name}
                                                </span>
                                                {read && (
                                                    <span className="text-[10px] text-green-500 flex-shrink-0 uppercase tracking-wider font-medium">
                                                        Lido
                                                    </span>
                                                )}
                                                <span className="text-xs text-gray-500 flex-shrink-0">{file.size_mb} MB</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {readingFile && (
                <CbzReader
                    manhwaId={manhwa.id}
                    filename={readingFile}
                    chapterNumber={readingChapterNum}
                    files={files}
                    onClose={() => {
                        setReadingFile(null)
                        onUpdate()
                    }}
                    onChapterRead={handleChapterRead}
                    onNavigate={(newFilename, newChapterNum) => {
                        setReadingFile(newFilename)
                        setReadingChapterNum(newChapterNum)
                    }}
                />
            )}
        </>
    )
}
