'use client'
import { useEffect, useState } from 'react'
import { Plus, Circle, Trash2 } from 'lucide-react'
import api from '@/lib/api'
import { CreateSessionDialog } from './CreateSessionDialog'

export interface Session {
  name: string
  cwd: string
  workspace: 'home' | 'github' | 'auto-hub'
  repoName: string | null
  alive: boolean
  lastActive: string
  createdAt: string
}

interface SessionManagerProps {
  onOpen: (session: Session) => void
  onNew: (name: string) => void
}

export function SessionManager({ onOpen, onNew }: SessionManagerProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = () => {
    setLoading(true)
    setError(null)
    api.get<Session[]>('/api/terminal/sessions')
      .then(r => { setSessions(r.data); setLoading(false) })
      .catch(() => { setError('Failed to load sessions'); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const handleEnd = async (name: string) => {
    try {
      await api.delete(`/api/terminal/sessions/${encodeURIComponent(name)}`)
      setSessions(s => s.filter(x => x.name !== name))
    } catch {
      // ignore — session may already be gone
    }
  }

  const handleCreate = (name: string) => {
    setCreating(false)
    onNew(name)
  }

  if (creating) {
    return (
      <div className="fixed inset-0 bg-[#0d0d0d] flex items-center justify-center p-4">
        <CreateSessionDialog onSubmit={handleCreate} onCancel={() => setCreating(false)} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
          <h2 className="text-white text-sm font-semibold">Code Terminal</h2>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#10b981]/10 text-[#10b981] text-xs font-medium hover:bg-[#10b981]/20 transition-colors"
          >
            <Plus size={13} />
            New Session
          </button>
        </div>

        <div className="divide-y divide-[#2a2a2a] max-h-80 overflow-y-auto">
          {loading && (
            <p className="text-[#6b7280] text-xs text-center py-8">Loading…</p>
          )}
          {error && (
            <div className="p-4 text-center">
              <p className="text-[#ef4444] text-xs mb-2">{error}</p>
              <button onClick={load} className="text-xs text-[#10b981] hover:underline">Retry</button>
            </div>
          )}
          {!loading && !error && sessions.length === 0 && (
            <p className="text-[#6b7280] text-xs text-center py-8">
              No sessions yet — create one to get started
            </p>
          )}
          {sessions.map(s => (
            <div key={s.name} className="flex items-center gap-3 px-4 py-3 hover:bg-[#1f1f1f]">
              <Circle
                size={8}
                className={s.alive
                  ? 'text-[#10b981] fill-[#10b981]'
                  : 'text-[#4b5563] fill-[#4b5563]'}
              />
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{s.name}</p>
                <p className="text-[#6b7280] text-[10px] font-mono truncate">{s.cwd}</p>
              </div>
              <button
                onClick={() => onOpen(s)}
                className="px-2.5 py-1 rounded bg-[#10b981]/10 text-[#10b981] text-xs hover:bg-[#10b981]/20 transition-colors"
              >
                Open
              </button>
              <button
                onClick={() => handleEnd(s.name)}
                aria-label={`End ${s.name}`}
                className="p-1 rounded text-[#6b7280] hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
