export interface Manhwa {
  id: number
  title: string
  cover_url?: string
  status: 'reading' | 'completed' | 'plan_to_read'
  andamento?: string
  current_chapter?: number
  total_chapters?: number
  rating?: number
  notes?: string
  download: boolean
  medium_reaction?: number
  created_at?: string
  updated_at?: string
}

export interface CreateManhwaDto {
  title: string
  cover_url?: string
  status: 'reading' | 'completed' | 'plan_to_read'
  andamento?: string
  current_chapter?: number
  total_chapters?: number
  rating?: number
  notes?: string
  download?: boolean
}
