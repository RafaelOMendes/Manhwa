'use client'

import { useState, useEffect } from 'react'
import { BookOpen, Star, Plus } from 'lucide-react'
import ManhwaCard from '@/components/ManhwaCard'
import AddManhwaModal from '@/components/AddManhwaModal'
import { Manhwa } from '@/types/manhwa'

export default function Home() {
  const [manhwas, setManhwas] = useState<Manhwa[]>([])
  const [filter, setFilter] = useState<'all' | 'reading' | 'completed' | 'plan_to_read'>('all')
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    fetchManhwas()
  }, [])

  const fetchManhwas = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/manhwas')
      const data = await response.json()
      setManhwas(data)
    } catch (error) {
      console.error('Erro ao buscar manhwas:', error)
    }
  }

  const filteredManhwas = manhwas.filter(manhwa => 
    filter === 'all' ? true : manhwa.status === filter
  )

  return (
    <main className="min-h-screen bg-gradient-to-b from-background-dark to-background-darker text-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <header className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <BookOpen size={32} className="text-primary-500 sm:w-10 sm:h-10" />
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">Manhwa Tracker</h1>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 px-3 sm:px-4 py-2 rounded-lg transition text-sm sm:text-base w-full sm:w-auto justify-center"
            >
              <Plus size={18} className="sm:w-5 sm:h-5" />
              <span className="sm:inline">Adicionar Manhwa</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 sm:px-4 py-2 rounded-lg transition text-sm sm:text-base flex-1 sm:flex-none ${
                filter === 'all' ? 'bg-primary-500' : 'bg-background-darker hover:bg-gray-800'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilter('reading')}
              className={`px-3 sm:px-4 py-2 rounded-lg transition text-sm sm:text-base flex-1 sm:flex-none ${
                filter === 'reading' ? 'bg-primary-500' : 'bg-background-darker hover:bg-gray-800'
              }`}
            >
              Lendo
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`px-3 sm:px-4 py-2 rounded-lg transition text-sm sm:text-base flex-1 sm:flex-none ${
                filter === 'completed' ? 'bg-primary-500' : 'bg-background-darker hover:bg-gray-800'
              }`}
            >
              Completos
            </button>
            <button
              onClick={() => setFilter('plan_to_read')}
              className={`px-3 sm:px-4 py-2 rounded-lg transition text-sm sm:text-base flex-1 sm:flex-none ${
                filter === 'plan_to_read' ? 'bg-primary-500' : 'bg-background-darker hover:bg-gray-800'
              }`}
            >
              Planejo Ler
            </button>
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
