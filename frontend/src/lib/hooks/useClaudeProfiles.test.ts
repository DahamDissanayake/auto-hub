import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useClaudeProfiles } from './useClaudeProfiles'
import api from '@/lib/api'

vi.mock('@/lib/api')

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

const PROFILES_DATA = {
  active: 'work',
  profiles: [
    { name: 'work', addedAt: '2026-01-01T00:00:00.000Z' },
    { name: 'personal', addedAt: '2026-01-02T00:00:00.000Z' },
  ],
}

describe('useClaudeProfiles', () => {
  beforeEach(() => {
    mockApi.get = vi.fn()
    mockApi.post = vi.fn()
    mockApi.delete = vi.fn()
  })

  it('fetches profiles on mount and sets state', async () => {
    mockApi.get.mockResolvedValue({ data: PROFILES_DATA })
    const { result } = renderHook(() => useClaudeProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.state.active).toBe('work')
    expect(result.current.state.profiles).toHaveLength(2)
    expect(mockApi.get).toHaveBeenCalledWith('/api/terminal/claude-profiles')
  })

  it('sets error when fetch fails', async () => {
    mockApi.get.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useClaudeProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
  })

  it('activate calls POST and optimistically updates active', async () => {
    mockApi.get.mockResolvedValue({ data: PROFILES_DATA })
    mockApi.post.mockResolvedValue({ data: { ok: true } })
    const { result } = renderHook(() => useClaudeProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.activate('personal') })
    expect(mockApi.post).toHaveBeenCalledWith('/api/terminal/claude-profiles/personal/activate')
    expect(result.current.state.active).toBe('personal')
  })

  it('startLogin returns sessionId and url', async () => {
    mockApi.get.mockResolvedValue({ data: { active: null, profiles: [] } })
    mockApi.post.mockResolvedValue({ data: { sessionId: 'abc', url: 'https://claude.ai/oauth' } })
    const { result } = renderHook(() => useClaudeProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))
    let loginData: { sessionId: string; url: string } | undefined
    await act(async () => { loginData = await result.current.startLogin('work') })
    expect(mockApi.post).toHaveBeenCalledWith('/api/terminal/claude-profiles/login/start', { name: 'work' })
    expect(loginData?.sessionId).toBe('abc')
    expect(loginData?.url).toBe('https://claude.ai/oauth')
  })

  it('completeLogin calls POST and refreshes state', async () => {
    mockApi.get.mockResolvedValue({ data: PROFILES_DATA })
    mockApi.post.mockResolvedValue({ data: { ok: true } })
    const { result } = renderHook(() => useClaudeProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.completeLogin('abc', 'mycode') })
    expect(mockApi.post).toHaveBeenCalledWith('/api/terminal/claude-profiles/login/complete', {
      sessionId: 'abc',
      code: 'mycode',
    })
    expect(mockApi.get).toHaveBeenCalledTimes(2) // initial + refresh
  })

  it('removeProfile calls DELETE and removes from state', async () => {
    mockApi.get.mockResolvedValue({ data: PROFILES_DATA })
    mockApi.delete = vi.fn().mockResolvedValue({ data: { ok: true } })
    const { result } = renderHook(() => useClaudeProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.removeProfile('personal') })
    expect(mockApi.delete).toHaveBeenCalledWith('/api/terminal/claude-profiles/personal')
    expect(result.current.state.profiles).toHaveLength(1)
    expect(result.current.state.profiles[0].name).toBe('work')
  })

  it('removeProfile clears active when the active profile is removed', async () => {
    mockApi.get.mockResolvedValue({ data: PROFILES_DATA })
    mockApi.delete = vi.fn().mockResolvedValue({ data: { ok: true } })
    const { result } = renderHook(() => useClaudeProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.removeProfile('work') })
    expect(result.current.state.active).toBeNull()
  })
})
