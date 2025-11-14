'use client'

import { useState } from 'react'
import { Star, Trash2, Edit2 } from 'lucide-react'
import { Manhwa } from '@/types/manhwa'

interface ManhwaCardProps {
  manhwa: Manhwa
  onUpdate: () => void
}

export default function ManhwaCard({ manhwa, onUpdate }: ManhwaCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  const deleteManhwa = async () => {
    if (!confirm(`Tem certeza que deseja excluir "${manhwa.title}"?`)) return

    setIsDeleting(true)
    try {
      await fetch(`http://localhost:8000/api/manhwas/${manhwa.id}`, {
        method: 'DELETE',
      })
      onUpdate()
    } catch (error) {
      console.error('Erro ao deletar manhwa:', error)
      setIsDeleting(false)
    }
  }

  const updateStatus = async (newStatus: string) => {
    try {
      await fetch(`http://localhost:8000/api/manhwas/${manhwa.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...manhwa, status: newStatus }),
      })
      onUpdate()
    } catch (error) {
      console.error('Erro ao atualizar status:', error)
    }
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

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
      {manhwa.cover_url && (
        <div className="w-full h-48 sm:h-56 md:h-64 bg-gray-700 flex items-center justify-center">
          <img
            src={manhwa.cover_url}
            alt={manhwa.title}
            className="w-full h-full object-cover"
          />
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

        {manhwa.author && (
          <p className="text-xs sm:text-sm text-gray-400 mb-2 line-clamp-1">por {manhwa.author}</p>
        )}

        <div className="flex items-center justify-between mb-3 gap-2">
          {getStatusBadge()}
          {manhwa.rating && (
            <div className="flex items-center gap-1 text-yellow-500">
              <Star size={14} fill="currentColor" className="sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm">{manhwa.rating}/5</span>
            </div>
          )}
        </div>

        {manhwa.current_chapter !== undefined && (
          <p className="text-xs sm:text-sm text-gray-400 mb-2">
            Capítulo: {manhwa.current_chapter}
            {manhwa.total_chapters && ` / ${manhwa.total_chapters}`}
          </p>
        )}

        {manhwa.notes && (
          <p className="text-xs sm:text-sm text-gray-300 mb-3 line-clamp-2">
            {manhwa.notes}
          </p>
        )}

        <select
          value={manhwa.status}
          onChange={(e) => updateStatus(e.target.value)}
          className="w-full bg-gray-700 text-white px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm hover:bg-gray-600 transition"
        >
          <option value="plan_to_read">Planejo Ler</option>
          <option value="reading">Lendo</option>
          <option value="completed">Completo</option>
        </select>
      </div>
    </div>
  )
}
