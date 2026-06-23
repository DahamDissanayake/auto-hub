import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

export interface DeviceSession {
  id: string
  token: string
  browser: string | null
  os: string | null
  ip: string | null
  isPermanent: boolean
  firstSeen: string
  lastSeen: string
  hasActiveSession: boolean
}

export interface LoginEventRow {
  id: string
  deviceId: string | null
  ip: string
  browser: string | null
  os: string | null
  eventType: string
  createdAt: string
}

export interface SessionsData {
  devices: DeviceSession[]
  events: LoginEventRow[]
  total: number
}

export function useAuthSessions(page = 1) {
  return useQuery<SessionsData>({
    queryKey: ['auth-sessions', page],
    queryFn: async () => {
      const { data } = await api.get(`/api/auth/sessions?page=${page}&limit=20`)
      return data
    },
  })
}

export function useUpdateDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isPermanent }: { id: string; isPermanent: boolean }) =>
      api.patch(`/api/auth/devices/${id}`, { isPermanent }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth-sessions'] }),
  })
}

export function useRevokeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deviceId: string) => api.delete(`/api/auth/sessions/${deviceId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth-sessions'] }),
  })
}

export function useLogoutAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/api/auth/logout-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth-sessions'] }),
  })
}

export function useDeleteDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/auth/devices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth-sessions'] }),
  })
}
