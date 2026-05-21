'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, ChevronUp, ChevronLeft, ChevronRight, CheckCircle, SkipForward } from 'lucide-react'
import { API_BASE, authHeaders, withToken } from '@/lib/api'

interface ChapterFile {
    name: string
    chapter_number: number
}

interface CbzReaderProps {
    manhwaId: number
    filename: string
    chapterNumber?: number
    files?: ChapterFile[]
    onClose: () => void
    onChapterRead?: (chapterNumber: number) => void
    onNavigate?: (filename: string, chapterNumber: number) => void
}

function extractChapterNumber(filename: string): number {
    const m = filename.match(/(?:cap(?:[ií]tulo)?\.?\s*|chapter\s*|ch\.?\s*|ep\.?\s*|#)(\d+(?:\.\d+)?)/i)
    if (m) return Math.floor(parseFloat(m[1]))
    const nums = filename.match(/(\d+(?:\.\d+)?)/g)
    if (nums && nums.length > 0) return Math.floor(parseFloat(nums[nums.length - 1]))
    return 0
}

export default function CbzReader({ manhwaId, filename, chapterNumber, files, onClose, onChapterRead, onNavigate }: CbzReaderProps) {
    const [totalPages, setTotalPages] = useState(0)
    const [loading, setLoading] = useState(true)
    const [showUI, setShowUI] = useState(true)
    const [markedAsRead, setMarkedAsRead] = useState(false)
    const [showToast, setShowToast] = useState(false)
    const [reachedEnd, setReachedEnd] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const hasMarkedRef = useRef(false)

    // Find current index and prev/next chapters
    const currentIndex = files?.findIndex(f => f.name === filename) ?? -1
    const prevChapter = files && currentIndex > 0 ? files[currentIndex - 1] : null
    const nextChapter = files && currentIndex >= 0 && currentIndex < files.length - 1 ? files[currentIndex + 1] : null

    const chapNum = files && currentIndex >= 0 ? currentIndex + 1 : (chapterNumber ?? extractChapterNumber(filename))

    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const userHasInteracted = useRef(false)

    useEffect(() => {
        setLoading(true)
        setReachedEnd(false)
        hasMarkedRef.current = false
        setMarkedAsRead(false)
        userHasInteracted.current = false
        const fetchInfo = async () => {
            try {
                // Fetch info
                const res = await fetch(`${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}`, { headers: authHeaders() })
                const data = await res.json()
                setTotalPages(data.total_pages)

                // Fetch scroll
                const scrollRes = await fetch(`${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}/scroll`, { headers: authHeaders() })
                const scrollData = await scrollRes.json()
                if (scrollData.scroll_position > 0) {
                    scrollRef.current?.setAttribute('data-saved-scroll', scrollData.scroll_position.toString())
                }
            } catch (error) {
                console.error('Erro ao carregar CBZ:', error)
            } finally {
                setLoading(false)
            }
        }
        fetchInfo()
    }, [manhwaId, filename])

    // Restore scroll position after loading
    useEffect(() => {
        if (!loading && totalPages > 0) {
            setTimeout(() => {
                const savedScrollAttr = scrollRef.current?.getAttribute('data-saved-scroll')
                const savedScroll = savedScrollAttr ? parseInt(savedScrollAttr, 10) : 0

                if (savedScroll > 0 && scrollRef.current) {
                    scrollRef.current.scrollTo({ top: savedScroll })
                } else if (scrollRef.current) {
                    scrollRef.current.scrollTo({ top: 0 })
                }

                scrollRef.current?.removeAttribute('data-saved-scroll')
            }, 50)
        }
    }, [loading, totalPages, manhwaId, filename])

    // Mark chapter as read when scrolled to bottom
    const markChapterAsRead = useCallback(async () => {
        if (hasMarkedRef.current || chapNum <= 0) return
        hasMarkedRef.current = true
        setMarkedAsRead(true)

        try {
            await fetch(`${API_BASE}/api/manhwas/${manhwaId}/current-chapter`, {
                method: 'PATCH',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ current_chapter: chapNum }),
            })
            onChapterRead?.(chapNum)
            setShowToast(true)
            setTimeout(() => setShowToast(false), 3000)
        } catch (error) {
            console.error('Erro ao marcar capítulo como lido:', error)
            hasMarkedRef.current = false
            setMarkedAsRead(false)
        }
    }, [manhwaId, chapNum, onChapterRead])

    // Scroll detection and saving
    useEffect(() => {
        const container = scrollRef.current
        if (!container || loading || totalPages === 0) return

        const handleScroll = () => {
            // Ignora eventos de scroll programáticos (ao abrir o capítulo)
            if (!userHasInteracted.current) return

            const { scrollTop, scrollHeight, clientHeight } = container

            // Save scroll position with a debounce to avoid performance issues
            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
            scrollTimeoutRef.current = setTimeout(() => {
                fetch(`${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}/scroll`, {
                    method: 'PUT',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ scroll_position: Math.floor(scrollTop) })
                }).catch(err => console.error('Erro ao salvar scroll:', err))
            }, 500)

            const distanceToBottom = scrollHeight - scrollTop - clientHeight
            // Trigger when user is within 200px of the bottom AND has actually scrolled down
            if (distanceToBottom < 200 && scrollTop > 100) {
                markChapterAsRead()
                setReachedEnd(true)
            } else {
                setReachedEnd(false)
            }
        }

        container.addEventListener('scroll', handleScroll, { passive: true })
        return () => container.removeEventListener('scroll', handleScroll)
    }, [loading, totalPages, markChapterAsRead, manhwaId, filename])

    // Auto-hide UI after 3 seconds
    useEffect(() => {
        if (!showUI) return
        const timer = setTimeout(() => setShowUI(false), 3000)
        return () => clearTimeout(timer)
    }, [showUI])

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowLeft' && prevChapter && onNavigate) {
                onNavigate(prevChapter.name, prevChapter.chapter_number)
            }
            if (e.key === 'ArrowRight' && nextChapter && onNavigate) {
                onNavigate(nextChapter.name, nextChapter.chapter_number)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose, prevChapter, nextChapter, onNavigate])

    // Lock body scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = '' }
    }, [])

    const toggleUI = () => setShowUI(prev => !prev)

    const scrollToTop = () => {
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const goToChapter = (file: ChapterFile) => {
        onNavigate?.(file.name, file.chapter_number)
    }

    const pageUrl = (page: number) =>
        withToken(`${API_BASE}/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}/page/${page}`)

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
            {/* Header — aparece/desaparece com animação */}
            <div
                className={`absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-3 transition-all duration-300 ${showUI
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 -translate-y-full pointer-events-none'
                    }`}
                style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)' }}
            >
                {/* Botão capítulo anterior */}
                <button
                    onClick={(e) => { e.stopPropagation(); prevChapter && goToChapter(prevChapter) }}
                    disabled={!prevChapter}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm transition flex-shrink-0 ${prevChapter
                            ? 'text-white/80 hover:text-white hover:bg-white/10'
                            : 'text-white/20 cursor-not-allowed'
                        }`}
                >
                    <ChevronLeft size={18} />
                    <span className="hidden sm:inline">Anterior</span>
                </button>

                {/* Título do capítulo */}
                <h3 className="text-sm font-medium text-white/90 truncate mx-3 text-center flex-1">
                    {filename.replace('.cbz', '')}
                    {files && files.length > 0 && (
                        <span className="text-white/40 ml-2 text-xs">
                            ({currentIndex + 1}/{files.length})
                        </span>
                    )}
                </h3>

                <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Botão próximo capítulo */}
                    <button
                        onClick={(e) => { e.stopPropagation(); nextChapter && goToChapter(nextChapter) }}
                        disabled={!nextChapter}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm transition ${nextChapter
                                ? 'text-white/80 hover:text-white hover:bg-white/10'
                                : 'text-white/20 cursor-not-allowed'
                            }`}
                    >
                        <span className="hidden sm:inline">Próximo</span>
                        <ChevronRight size={18} />
                    </button>

                    {/* Botão fechar */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        className="text-white/70 hover:text-white transition p-1.5 rounded-full hover:bg-white/10 ml-1"
                    >
                        <X size={22} />
                    </button>
                </div>
            </div>

            {/* Toast — capítulo marcado como lido */}
            <div
                className={`absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-600/90 backdrop-blur-sm text-white text-sm font-medium shadow-lg transition-all duration-500 ${showToast
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 -translate-y-4 pointer-events-none'
                    }`}
            >
                <CheckCircle size={16} />
                <span>Capítulo {chapNum} marcado como lido!</span>
            </div>

            {/* Botão voltar ao topo — aparece com a UI */}
            <div
                className={`absolute bottom-6 right-6 z-10 transition-all duration-300 ${showUI && !reachedEnd
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 translate-y-4 pointer-events-none'
                    }`}
            >
                <button
                    onClick={(e) => { e.stopPropagation(); scrollToTop(); }}
                    className="bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white p-3 rounded-full transition shadow-lg"
                >
                    <ChevronUp size={20} />
                </button>
            </div>

            {/* Área de leitura — clique toggle UI */}
            <div
                ref={scrollRef}
                id="cbz-scroll-container"
                className="flex-1 overflow-y-auto overflow-x-hidden"
                onClick={toggleUI}
                onTouchStart={() => { userHasInteracted.current = true }}
                onWheel={() => { userHasInteracted.current = true }}
                onKeyDown={() => { userHasInteracted.current = true }}
                onMouseDown={() => { userHasInteracted.current = true }}
            >
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full" />
                    </div>
                ) : totalPages === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-gray-600">Nenhuma página encontrada.</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center">
                        {Array.from({ length: totalPages }, (_, i) => (
                            <img
                                key={`${filename}-${i}`}
                                src={pageUrl(i)}
                                alt={`Página ${i + 1}`}
                                className="w-full max-w-3xl select-none min-h-[500px] bg-background-darker/50"
                                loading="lazy"
                                draggable={false}
                                style={{ display: 'block' }}
                            />
                        ))}

                        {/* End-of-chapter area */}
                        <div className="w-full max-w-3xl py-16 px-6 flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()}>
                            {/* Divider */}
                            <div className="w-full flex items-center gap-4">
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                                <span className="text-white/30 text-xs uppercase tracking-widest">Fim do capítulo</span>
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                            </div>

                            {/* Navigation buttons */}
                            <div className="flex items-center gap-3 w-full max-w-md">
                                {prevChapter && (
                                    <button
                                        onClick={() => goToChapter(prevChapter)}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all duration-200"
                                    >
                                        <ChevronLeft size={18} />
                                        <span className="text-sm">Anterior</span>
                                    </button>
                                )}

                                {nextChapter ? (
                                    <button
                                        onClick={() => goToChapter(nextChapter)}
                                        className="flex-1 flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all duration-200 shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98]"
                                    >
                                        <SkipForward size={18} />
                                        <span>Próximo Capítulo</span>
                                    </button>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-white/30">
                                        <CheckCircle size={18} />
                                        <span className="text-sm">Último capítulo disponível</span>
                                    </div>
                                )}
                            </div>

                            <div className="h-8" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
