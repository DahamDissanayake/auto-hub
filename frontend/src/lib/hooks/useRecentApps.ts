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

export function recordAppVisit(id: string): void {
  try {
    const entries = readEntries().filter(e => e.id !== id)
    entries.unshift({ id, lastUsed: Date.now() })
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)))
  } catch {
    // localStorage unavailable (SSR, private mode) — silently ignore
  }
}

export function useRecentApps(): AppEntry[] {
  const [recent, setRecent] = useState<AppEntry[]>([])

  useEffect(() => {
    const entries = readEntries()
    const resolved = entries
      .map(e => apps.find(a => a.id === e.id))
      .filter((a): a is AppEntry => a !== undefined)
    setRecent(resolved)
  }, [])

  return recent
}
