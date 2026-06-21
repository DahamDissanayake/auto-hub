'use client'
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Plus, UserCircle2 } from 'lucide-react'
import { useClaudeProfiles } from '@/lib/hooks/useClaudeProfiles'
import { AddAccountModal } from './AddAccountModal'

export function ProfileButton() {
  const { state, activate, startLogin, completeLogin, refresh } = useClaudeProfiles()
  const [open, setOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-[#6b7280] hover:text-[#e5e7eb] hover:bg-[#2a2a2a] transition-colors font-mono"
        >
          <UserCircle2 size={12} className="shrink-0" />
          <span className="max-w-[80px] truncate">{state.active ?? 'no account'}</span>
          <ChevronDown size={10} className="shrink-0" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 w-44 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl z-50 py-1">
            {state.profiles.map(p => (
              <button
                key={p.name}
                onClick={() => { void activate(p.name); setOpen(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-[#2a2a2a] transition-colors"
              >
                <span className="w-3 shrink-0">
                  {state.active === p.name && <Check size={11} className="text-[#10b981]" />}
                </span>
                <span className="text-[#e5e7eb] font-mono truncate">{p.name}</span>
              </button>
            ))}
            {state.profiles.length > 0 && (
              <div className="mx-2 my-1 border-t border-[#2a2a2a]" />
            )}
            <button
              onClick={() => { setOpen(false); setShowModal(true) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left text-[#10b981] hover:bg-[#10b981]/10 transition-colors"
            >
              <Plus size={11} className="shrink-0 ml-0.5" />
              Add account
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <AddAccountModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); void refresh() }}
          startLogin={startLogin}
          completeLogin={completeLogin}
        />
      )}
    </>
  )
}
