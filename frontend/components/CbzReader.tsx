'use client'

import { useState, useEffect } from 'react'
import { X, ChevronUp } from 'lucide-react'

interface CbzReaderProps {
    manhwaId: number
    filename: string
    onClose: () => void
}

export default function CbzReader({ manhwaId, filename, onClose }: CbzReaderProps) {
    const [totalPages, setTotalPages] = useState(0)
    const [loading, setLoading] = useState(true)
    const [showUI, setShowUI] = useState(true)

    useEffect(() => {
        const fetchInfo = async () => {
            try {
                const res = await fetch(`http://localhost:8000/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}`)
                const data = await res.json()
                setTotalPages(data.total_pages)
            } catch (error) {
                console.error('Erro ao carregar CBZ:', error)
            } finally {
                setLoading(false)
            }
        }
        fetchInfo()
    }, [manhwaId, filename])

    // Auto-hide UI after 3 seconds
    useEffect(() => {
        if (!showUI) return
        const timer = setTimeout(() => setShowUI(false), 3000)
        return () => clearTimeout(timer)
    }, [showUI])

    // ESC to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    // Lock body scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = '' }
    }, [])

    const toggleUI = () => setShowUI(prev => !prev)

    const scrollToTop = () => {
        document.getElementById('cbz-scroll-container')?.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const pageUrl = (page: number) =>
        `http://localhost:8000/api/manhwas/${manhwaId}/read/${encodeURIComponent(filename)}/page/${page}`

    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
            {/* Header — aparece/desaparece com animação */}
            <div
                className={`absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 transition-all duration-300 ${
                    showUI
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 -translate-y-full pointer-events-none'
                }`}
                style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)' }}
            >
                <h3 className="text-sm font-medium text-white/90 truncate flex-1 mr-4">
                    {filename.replace('.cbz', '')}
                </h3>
                <button
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="text-white/70 hover:text-white transition p-1.5 rounded-full hover:bg-white/10"
                >
                    <X size={22} />
                </button>
            </div>

            {/* Botão voltar ao topo — aparece com a UI */}
            <div
                className={`absolute bottom-6 right-6 z-10 transition-all duration-300 ${
                    showUI
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
                id="cbz-scroll-container"
                className="flex-1 overflow-y-auto overflow-x-hidden"
                onClick={toggleUI}
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
                                key={i}
                                src={pageUrl(i)}
                                alt={`Página ${i + 1}`}
                                className="w-full max-w-3xl select-none"
                                loading="lazy"
                                draggable={false}
                                style={{ display: 'block' }}
                            />
                        ))}
                        <div className="py-12" />
                    </div>
                )}
            </div>
        </div>
    )
}
