import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { HealthData } from '@/lib/types'

export function useHealth() {
  return useQuery<HealthData>({
    queryKey: ['health'],
    queryFn: async () => {
      const { data } = await api.get('/api/health')
      return data
    },
  })
}
