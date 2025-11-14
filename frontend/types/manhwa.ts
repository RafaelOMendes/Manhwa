export interface Manhwa {
  id: number
  title: string
  author?: string
  cover_url?: string
  status: 'reading' | 'completed' | 'plan_to_read'
  current_chapter?: number
  total_chapters?: number
  rating?: number
  notes?: string
  created_at?: string
  updated_at?: string
}

export interface CreateManhwaDto {
  title: string
  author?: string
  cover_url?: string
  status: 'reading' | 'completed' | 'plan_to_read'
  current_chapter?: number
  total_chapters?: number
  rating?: number
  notes?: string
}
