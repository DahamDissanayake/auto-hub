import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { ScheduledJob } from '@/lib/types'

export function useSchedules() {
  return useQuery<ScheduledJob[]>({
    queryKey: ['schedules'],
    queryFn: async () => {
      const { data } = await api.get('/api/schedules')
      return data
    },
  })
}

export function useCreateSchedule() {
  const queryClient = useQueryClient()
  return useMutation<
    ScheduledJob,
    Error,
    { pluginId: string; name: string; cron: string }
  >({
    mutationFn: async (payload) => {
      const { data } = await api.post('/api/schedules', payload)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      await api.delete(`/api/schedules/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useToggleSchedule() {
  const queryClient = useQueryClient()
  return useMutation<ScheduledJob, Error, string>({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/api/schedules/${id}/toggle`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
