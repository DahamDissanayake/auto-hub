import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { recordAppVisit, useRecentApps } from './useRecentApps'

vi.mock('@/app/(app)/apps/apps.config', () => ({
  apps: [
    { id: 'app-a', name: 'App A', description: '', url: '/a', color: '#ff0000' },
    { id: 'app-b', name: 'App B', description: '', url: '/b', color: '#00ff00' },
    { id: 'app-c', name: 'App C', description: '', url: '/c', color: '#0000ff' },
    { id: 'app-d', name: 'App D', description: '', url: '/d', color: '#ffff00' },
    { id: 'app-e', name: 'App E', description: '', url: '/e', color: '#ff00ff' },
    { id: 'app-f', name: 'App F', description: '', url: '/f', color: '#00ffff' },
  ],
}))

beforeEach(() => localStorage.clear())

describe('recordAppVisit', () => {
  it('records a visit', () => {
    recordAppVisit('app-a')
    const raw = JSON.parse(localStorage.getItem('autohub_recent_apps') ?? '[]')
    expect(raw[0].id).toBe('app-a')
    expect(typeof raw[0].lastUsed).toBe('number')
  })

  it('moves an existing entry to front on revisit', () => {
    recordAppVisit('app-a')
    recordAppVisit('app-b')
    recordAppVisit('app-a')
    const raw = JSON.parse(localStorage.getItem('autohub_recent_apps') ?? '[]')
    expect(raw[0].id).toBe('app-a')
    expect(raw[1].id).toBe('app-b')
    expect(raw).toHaveLength(2)
  })

  it('caps at 5 entries', () => {
    ;['app-a', 'app-b', 'app-c', 'app-d', 'app-e', 'app-f'].forEach(recordAppVisit)
    const raw = JSON.parse(localStorage.getItem('autohub_recent_apps') ?? '[]')
    expect(raw).toHaveLength(5)
    expect(raw[0].id).toBe('app-f') // most recent
    expect(raw[4].id).toBe('app-b') // oldest kept
  })
})

describe('useRecentApps', () => {
  it('returns empty array when nothing recorded', () => {
    const { result } = renderHook(() => useRecentApps())
    expect(result.current).toEqual([])
  })

  it('returns resolved AppEntry objects newest-first', () => {
    recordAppVisit('app-a')
    recordAppVisit('app-b')
    const { result } = renderHook(() => useRecentApps())
    expect(result.current[0].id).toBe('app-b')
    expect(result.current[1].id).toBe('app-a')
    expect(result.current[0].name).toBe('App B')
  })

  it('filters out ids not present in apps config', () => {
    recordAppVisit('ghost-app')
    recordAppVisit('app-a')
    const { result } = renderHook(() => useRecentApps())
    expect(result.current).toHaveLength(1)
    expect(result.current[0].id).toBe('app-a')
  })
})
