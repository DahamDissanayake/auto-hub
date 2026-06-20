'use client'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'

interface CreateSessionDialogProps {
  onSubmit: (name: string) => void
  onCancel: () => void
}

export function CreateSessionDialog({ onSubmit, onCancel }: CreateSessionDialogProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Session name is required')
      return
    }
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(trimmed)) {
      setError('Only letters, numbers, hyphens and underscores, up to 40 characters')
      return
    }
    onSubmit(trimmed)
  }

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 w-full max-w-sm">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={onCancel} aria-label="Back" className="text-[#6b7280] hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-white text-sm font-semibold">New Session</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-[#6b7280] text-xs mb-1.5 block">Session name</label>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={e => { setName(e.target.value); setError(null) }}
            placeholder="e.g. auto-hub-dev"
            maxLength={40}
            className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-white text-sm font-mono placeholder-[#4b5563] focus:outline-none focus:border-[#10b981]/50"
          />
          {error && <p className="text-[#ef4444] text-xs mt-1.5">{error}</p>}
        </div>

        <button
          type="submit"
          className="w-full py-2.5 text-sm bg-[#10b981] text-white rounded-md hover:bg-[#059669] transition-colors"
        >
          Next: Choose Workspace
        </button>
      </form>
    </div>
  )
}
