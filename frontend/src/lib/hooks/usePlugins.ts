import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { Plugin, PluginExecution } from '@/lib/types'

export function usePlugins() {
  return useQuery<Plugin[]>({
    queryKey: ['plugins'],
    queryFn: async () => {
      const { data } = await api.get('/api/plugins')
      return data
    },
  })
}

export function usePlugin(id: string) {
  return useQuery<Plugin>({
    queryKey: ['plugins', id],
    queryFn: async () => {
      const { data } = await api.get(`/api/plugins/${id}`)
      return data
    },
    enabled: !!id,
  })
}

export function useExecutions(pluginId: string) {
  return useQuery<PluginExecution[]>({
    queryKey: ['executions', pluginId],
    queryFn: async () => {
      const { data } = await api.get(`/api/plugins/${pluginId}/executions`)
      return data
    },
    enabled: !!pluginId,
  })
}

export function useRunPlugin() {
  const queryClient = useQueryClient()
  return useMutation<PluginExecution, Error, string>({
    mutationFn: async (pluginId: string) => {
      const { data } = await api.post(`/api/plugins/${pluginId}/run`)
      return data
    },
    onSuccess: (_, pluginId) => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
      queryClient.invalidateQueries({ queryKey: ['executions', pluginId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useTogglePlugin() {
  const queryClient = useQueryClient()
  return useMutation<Plugin, Error, string>({
    mutationFn: async (pluginId: string) => {
      const { data } = await api.post(`/api/plugins/${pluginId}/toggle`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useUpdatePluginConfig() {
  const queryClient = useQueryClient()
  return useMutation<Plugin, Error, { id: string; config: Record<string, unknown> }>({
    mutationFn: async ({ id, config }) => {
      const { data } = await api.patch(`/api/plugins/${id}/config`, { config })
      return data
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['plugins', id] })
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
    },
  })
}
