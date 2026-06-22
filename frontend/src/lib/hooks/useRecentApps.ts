'use client'
import { useState, useEffect } from 'react'
import { apps } from '@/app/(app)/apps/apps.config'
import type { AppEntry } from '@/app/(app)/apps/apps.config'

const KEY = 'autohub_recent_apps'
const MAX = 5

interface RecentEntry { id: string; lastUsed: number }

function readEntries(): RecentEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

const UPDATED_EVENT = 'autohub:recent-apps-updated'

export function recordAppVisit(id: string): void {
  try {
    const entries = readEntries().filter(e => e.id !== id)
    entries.unshift({ id, lastUsed: Date.now() })
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)))
    window.dispatchEvent(new Event(UPDATED_EVENT))
  } catch {
    // localStorage unavailable (SSR, private mode) — silently ignore
  }
}

function resolveRecent(): AppEntry[] {
  return readEntries()
    .map(e => apps.find(a => a.id === e.id))
    .filter((a): a is AppEntry => a !== undefined)
}

export function useRecentApps(): AppEntry[] {
  const [recent, setRecent] = useState<AppEntry[]>([])

  useEffect(() => {
    setRecent(resolveRecent())

    const refresh = () => setRecent(resolveRecent())
    window.addEventListener(UPDATED_EVENT, refresh)
    // also sync across tabs
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(UPDATED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return recent
}
