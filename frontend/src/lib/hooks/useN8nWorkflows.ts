import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { N8nWorkflow } from '@/lib/types'

export function useN8nWorkflows() {
  return useQuery<N8nWorkflow[]>({
    queryKey: ['n8n-workflows'],
    queryFn: async () => {
      const { data } = await api.get('/api/n8n/workflows')
      return data?.data ?? data ?? []
    },
    retry: false,
  })
}

export function useActivateWorkflow() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      await api.post(`/api/n8n/workflows/${id}/activate`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['n8n-workflows'] }),
  })
}

export function useDeactivateWorkflow() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      await api.post(`/api/n8n/workflows/${id}/deactivate`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['n8n-workflows'] }),
  })
}
