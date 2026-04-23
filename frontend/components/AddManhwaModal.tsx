'use client'

import { useState } from 'react'
import { X, Star } from 'lucide-react'
import { CreateManhwaDto } from '@/types/manhwa'

interface AddManhwaModalProps {
  onClose: () => void
  onAdd: () => void
}

export default function AddManhwaModal({ onClose, onAdd }: AddManhwaModalProps) {
  const [formData, setFormData] = useState<CreateManhwaDto>({
    title: '',
    cover_url: '',
    status: 'plan_to_read',
    current_chapter: 0,
    total_chapters: undefined,
    rating: undefined,
    notes: '',
  })
  const [hoveredStar, setHoveredStar] = useState(0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      await fetch('http://localhost:8000/api/manhwas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })
      onAdd()
      onClose()
    } catch (error) {
      console.error('Erro ao adicionar manhwa:', error)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-background-darker rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-800">
        <div className="sticky top-0 bg-background-darker border-b border-gray-800 p-3 sm:p-4 flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-bold">Adicionar Manhwa</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition"
          >
            <X size={20} className="sm:w-6 sm:h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3 sm:space-y-4">
          <div>
            <label className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">
              Título <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full bg-background-dark text-white px-3 sm:px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base border border-gray-800"
            />
          </div>



          <div>
            <label className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">URL da Capa</label>
            <input
              type="url"
              value={formData.cover_url}
              onChange={(e) => setFormData({ ...formData, cover_url: e.target.value })}
              className="w-full bg-background-dark text-white px-3 sm:px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base border border-gray-800"
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className="w-full bg-background-dark text-white px-3 sm:px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base border border-gray-800"
            >
              <option value="plan_to_read">Planejo Ler</option>
              <option value="reading">Lendo</option>
              <option value="completed">Completo</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">Capítulo Atual</label>
              <input
                type="number"
                min="0"
                value={formData.current_chapter || ''}
                onChange={(e) => setFormData({ ...formData, current_chapter: parseInt(e.target.value) || 0 })}
                className="w-full bg-background-dark text-white px-3 sm:px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base border border-gray-800"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">Total de Capítulos</label>
              <input
                type="number"
                min="0"
                value={formData.total_chapters || ''}
                onChange={(e) => setFormData({ ...formData, total_chapters: parseInt(e.target.value) || undefined })}
                className="w-full bg-background-dark text-white px-3 sm:px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base border border-gray-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">Avaliação</label>
            <div className="flex gap-1 sm:gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setFormData({ ...formData, rating: star })}
                  onMouseEnter={() => setHoveredStar(star)}
                  onMouseLeave={() => setHoveredStar(0)}
                  className="text-yellow-500 hover:scale-110 transition"
                >
                  <Star
                    size={24}
                    className="sm:w-8 sm:h-8"
                    fill={(hoveredStar || formData.rating || 0) >= star ? 'currentColor' : 'none'}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">Notas</label>
            <textarea
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full bg-background-dark text-white px-3 sm:px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm sm:text-base resize-none sm:rows-4 border border-gray-800"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2 sm:pt-4">
            <button
              type="submit"
              className="flex-1 bg-primary-500 hover:bg-primary-600 px-4 py-2.5 rounded-lg transition font-medium text-sm sm:text-base order-1 sm:order-1"
            >
              Adicionar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-background-dark hover:bg-gray-800 px-4 py-2.5 rounded-lg transition font-medium text-sm sm:text-base order-2 sm:order-2"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
