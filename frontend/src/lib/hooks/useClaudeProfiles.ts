'use client'
import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'

export interface ClaudeProfile {
  name: string
  addedAt: string
}

export interface ClaudeProfilesState {
  active: string | null
  profiles: ClaudeProfile[]
}

export function useClaudeProfiles() {
  const [state, setState] = useState<ClaudeProfilesState>({ active: null, profiles: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<ClaudeProfilesState>('/api/terminal/claude-profiles')
      setState(res.data)
      setError(null)
    } catch {
      setError('Failed to load profiles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const activate = useCallback(async (name: string) => {
    await api.post(`/api/terminal/claude-profiles/${encodeURIComponent(name)}/activate`)
    setState(s => ({ ...s, active: name }))
  }, [])

  const startLogin = useCallback(async (name: string) => {
    const res = await api.post<{ sessionId: string; url: string }>(
      '/api/terminal/claude-profiles/login/start',
      { name },
    )
    return res.data
  }, [])

  const completeLogin = useCallback(async (sessionId: string, code: string) => {
    await api.post('/api/terminal/claude-profiles/login/complete', { sessionId, code })
    await refresh()
  }, [refresh])

  const removeProfile = useCallback(async (name: string) => {
    await api.delete(`/api/terminal/claude-profiles/${encodeURIComponent(name)}`)
    setState(s => ({
      active: s.active === name ? null : s.active,
      profiles: s.profiles.filter(p => p.name !== name),
    }))
  }, [])

  return { state, loading, error, activate, startLogin, completeLogin, removeProfile, refresh }
}
