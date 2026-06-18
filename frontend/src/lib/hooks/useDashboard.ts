import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { DashboardData } from '@/lib/types'

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/api/dashboard')
      return data
    },
    refetchInterval: 30_000,
  })
}
