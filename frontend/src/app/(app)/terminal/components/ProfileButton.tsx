'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, Check, Plus, UserCircle2, X, Loader2 } from 'lucide-react'
import { useClaudeProfiles } from '@/lib/hooks/useClaudeProfiles'
import { AddAccountModal } from './AddAccountModal'

export function ProfileButton() {
  const { state, activate, startLogin, completeLogin, removeProfile, refresh } = useClaudeProfiles()
  const [open, setOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [confirmSwitch, setConfirmSwitch] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirmSwitch(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const showToast = useCallback((msg: string, ok: boolean) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, ok })
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const handleSwitchClick = useCallback((name: string) => {
    if (name === state.active) return
    setConfirmSwitch(name)
  }, [state.active])

  const handleConfirmSwitch = useCallback(async () => {
    if (!confirmSwitch) return
    const name = confirmSwitch
    setConfirmSwitch(null)
    setOpen(false)
    try {
      await activate(name)
      showToast(`Switched to ${name}`, true)
    } catch {
      showToast('Failed to switch profile', false)
    }
  }, [confirmSwitch, activate, showToast])

  const handleRemove = useCallback(async (e: React.MouseEvent, name: string) => {
    e.stopPropagation()
    setRemoving(name)
    try {
      await removeProfile(name)
      showToast(`Removed ${name}`, true)
    } catch {
      showToast('Failed to remove profile', false)
    } finally {
      setRemoving(null)
    }
  }, [removeProfile, showToast])

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => { setOpen(o => !o); setConfirmSwitch(null) }}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-[#6b7280] hover:text-[#e5e7eb] hover:bg-[#2a2a2a] transition-colors font-mono"
        >
          <UserCircle2 size={12} className="shrink-0" />
          <span className="max-w-[80px] truncate">{state.active ?? 'no account'}</span>
          <ChevronDown size={10} className="shrink-0" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 w-52 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl z-50 py-1 overflow-hidden">
            {confirmSwitch ? (
              <div className="px-3 py-2">
                <p className="text-[#9ca3af] text-xs mb-2">
                  Switch to <span className="text-white font-mono">{confirmSwitch}</span>?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmSwitch(null)}
                    className="flex-1 px-2 py-1.5 rounded text-xs text-[#6b7280] hover:text-white hover:bg-[#2a2a2a] transition-colors border border-[#2a2a2a]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { void handleConfirmSwitch() }}
                    className="flex-1 px-2 py-1.5 rounded text-xs bg-[#10b981] text-white hover:bg-[#059669] transition-colors font-medium"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            ) : (
              <>
                {state.profiles.map(p => (
                  <div key={p.name} className="flex items-center group hover:bg-[#2a2a2a] transition-colors min-w-0">
                    <button
                      onClick={() => handleSwitchClick(p.name)}
                      className="flex items-center gap-2 min-w-0 flex-1 px-3 py-2 text-xs text-left"
                    >
                      <span className="w-3 shrink-0">
                        {state.active === p.name && <Check size={11} className="text-[#10b981]" />}
                      </span>
                      <span className="flex flex-col min-w-0 flex-1">
                        <span className="text-[#e5e7eb] font-mono truncate">{p.name}</span>
                        {p.email && <span className="text-[#6b7280] truncate text-[10px]">{p.email}</span>}
                      </span>
                    </button>
                    <button
                      onClick={(e) => { void handleRemove(e, p.name) }}
                      disabled={removing === p.name}
                      title={`Remove ${p.name}`}
                      className="opacity-0 group-hover:opacity-100 shrink-0 px-2 py-2 text-[#6b7280] hover:text-[#ef4444] transition-all disabled:opacity-50"
                    >
                      {removing === p.name
                        ? <Loader2 size={11} className="animate-spin" />
                        : <X size={11} />}
                    </button>
                  </div>
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
              </>
            )}
          </div>
        )}

        {toast && (
          <div className={`absolute right-0 top-full mt-1 px-3 py-2 rounded-lg text-xs font-mono shadow-xl z-50 whitespace-nowrap ${toast.ok ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30' : 'bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/30'}`}>
            {toast.msg}
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
