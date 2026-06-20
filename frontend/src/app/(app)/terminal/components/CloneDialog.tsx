'use client'
import { useState } from 'react'
import { ArrowLeft, GitFork, Loader2 } from 'lucide-react'
import api from '@/lib/api'

interface CloneDialogProps {
  onSuccess: (repoPath: string, repoName: string) => void
  onBack: () => void
}

export function CloneDialog({ onSuccess, onBack }: CloneDialogProps) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const derivedName = name.trim() || url.split('/').pop()?.replace(/\.git$/, '') || ''

  const handleClone = async () => {
    setLoading(true)
    setError(null)
    try {
      const body: { url: string; name?: string } = { url }
      if (name.trim()) body.name = name.trim()
      const res = await api.post<{ path: string }>('/api/terminal/clone', body)
      onSuccess(res.data.path, derivedName)
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Clone failed'
      setError(msg)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={onBack}
            aria-label="Back"
            className="text-[#6b7280] hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <GitFork size={18} className="text-[#10b981]" />
          <h2 className="text-white text-sm font-semibold">Clone Repository</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[#6b7280] text-xs mb-1.5 block">Git URL</label>
            <input
              type="text"
              placeholder="https://github.com/user/repo"
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-white text-sm font-mono placeholder-[#4b5563] focus:outline-none focus:border-[#10b981]/50"
            />
            <p className="text-[#4b5563] text-xs mt-1.5">
              For private repos, set up SSH keys on the Pi first
            </p>
          </div>

          <div>
            <label className="text-[#6b7280] text-xs mb-1.5 block">
              Folder name <span className="text-[#4b5563]">(optional)</span>
            </label>
            <input
              type="text"
              placeholder={derivedName ? `${derivedName} (auto-derived)` : 'auto-derived from URL'}
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-white text-sm font-mono placeholder-[#4b5563] focus:outline-none focus:border-[#10b981]/50"
            />
          </div>

          {error && <p className="text-[#ef4444] text-xs">{error}</p>}

          <button
            onClick={handleClone}
            disabled={!url.trim() || loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm bg-[#10b981] text-white rounded-md hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Cloning…
              </>
            ) : (
              'Clone'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
