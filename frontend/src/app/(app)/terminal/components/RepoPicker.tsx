'use client'
import { useEffect, useState } from 'react'
import { ArrowLeft, GitBranch, Plus } from 'lucide-react'
import api from '@/lib/api'

interface Repo {
  name: string
  path: string
  isGitRepo: boolean
}

interface RepoPickerProps {
  onSelect: (repo: Repo) => void
  onClone: () => void
  onBack: () => void
}

export function RepoPicker({ onSelect, onClone, onBack }: RepoPickerProps) {
  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    api.get<Repo[]>('/api/terminal/repos')
      .then(r => { setRepos(r.data); setLoading(false) })
      .catch(() => { setError('Failed to load repos'); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={onBack} aria-label="Back" className="text-[#6b7280] hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
          <GitBranch size={18} className="text-[#10b981]" />
          <h2 className="text-white text-sm font-semibold">GitHub Repos</h2>
        </div>

        {loading && <p className="text-[#6b7280] text-xs">Loading repos...</p>}

        {error && (
          <div className="text-center py-4">
            <p className="text-[#ef4444] text-xs mb-3">{error}</p>
            <button
              onClick={load}
              className="px-3 py-1.5 text-xs bg-[#2a2a2a] text-[#e5e7eb] rounded hover:bg-[#3a3a3a] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && repos.length === 0 && (
          <div className="text-center py-6">
            <p className="text-[#6b7280] text-sm mb-4">No repos cloned yet</p>
            <button
              onClick={onClone}
              className="flex items-center gap-1.5 mx-auto px-4 py-2 text-xs bg-[#10b981] text-white rounded hover:bg-[#059669] transition-colors"
            >
              <Plus size={14} />
              Clone Repo
            </button>
          </div>
        )}

        {!loading && !error && repos.length > 0 && (
          <div className="space-y-2">
            {repos.map(repo => (
              <button
                key={repo.path}
                onClick={() => onSelect(repo)}
                className="w-full text-left p-3 rounded-md bg-[#111111] border border-[#2a2a2a] hover:border-[#10b981]/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <p className="text-white text-sm font-medium">{repo.name}</p>
                  {repo.isGitRepo && (
                    <span className="text-[10px] text-[#10b981] bg-[#10b981]/10 px-1.5 py-0.5 rounded font-mono">
                      git
                    </span>
                  )}
                </div>
              </button>
            ))}
            <button
              onClick={onClone}
              className="w-full flex items-center justify-center gap-1.5 p-3 rounded-md border border-dashed border-[#2a2a2a] text-[#6b7280] hover:border-[#10b981]/50 hover:text-[#10b981] transition-colors text-xs mt-1"
            >
              <Plus size={14} />
              Clone Repo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
