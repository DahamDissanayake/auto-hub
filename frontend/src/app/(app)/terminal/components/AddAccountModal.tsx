'use client'
import { useState } from 'react'
import { X, Copy, Check, Loader2, AlertTriangle } from 'lucide-react'

interface AddAccountModalProps {
  onClose: () => void
  onSuccess: () => void
  startLogin: (name: string) => Promise<{ sessionId: string; url: string }>
  completeLogin: (sessionId: string, code: string) => Promise<string | undefined>
}

type ModalStep = 'name' | 'url' | 'code'

export function AddAccountModal({ onClose, onSuccess, startLogin, completeLogin }: AddAccountModalProps) {
  const [step, setStep] = useState<ModalStep>('name')
  const [name, setName] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [url, setUrl] = useState('')
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const nameValid = /^[a-zA-Z0-9_-]{1,20}$/.test(name)

  const handleGetLink = async () => {
    if (!nameValid) return
    setBusy(true)
    setError(null)
    try {
      const result = await startLogin(name)
      setSessionId(result.sessionId)
      setUrl(result.url)
      setStep('url')
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to start login'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleVerify = async () => {
    if (!code.trim()) return
    setBusy(true)
    setError(null)
    setWarning(null)
    try {
      const warn = await completeLogin(sessionId, code.trim())
      if (warn) {
        setWarning(warn)
      } else {
        onSuccess()
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Verification failed'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg w-full max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
          <h3 className="text-white text-sm font-semibold">Add Claude Account</h3>
          <button
            aria-label="close"
            onClick={onClose}
            className="text-[#6b7280] hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {step === 'name' && (
            <>
              <div>
                <label className="block text-[#9ca3af] text-xs mb-1.5">Profile name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="work"
                  className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm font-mono placeholder-[#4b5563] focus:outline-none focus:border-[#10b981]"
                />
                <p className="text-[#4b5563] text-[10px] mt-1">Letters, numbers, dash, underscore. Max 20 chars.</p>
              </div>
              {error && <p className="text-[#ef4444] text-xs">{error}</p>}
              <button
                disabled={!nameValid || busy}
                onClick={() => { void handleGetLink() }}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded bg-[#10b981] text-white text-sm font-medium hover:bg-[#059669] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? <><Loader2 size={14} className="animate-spin" /> Getting link…</> : 'Get link'}
              </button>
            </>
          )}

          {step === 'url' && (
            <>
              <p className="text-[#9ca3af] text-xs leading-relaxed">
                Open this link in a browser where you&apos;re logged into Claude, then paste the code below.
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={url}
                  className="flex-1 min-w-0 bg-[#0d0d0d] border border-[#2a2a2a] rounded px-3 py-2 text-[#9ca3af] text-xs font-mono focus:outline-none"
                />
                <button
                  onClick={() => { void handleCopy() }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded bg-[#2a2a2a] text-[#9ca3af] hover:text-white text-xs transition-colors shrink-0"
                >
                  {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                </button>
              </div>
              <button
                onClick={() => setStep('code')}
                className="px-4 py-2 rounded bg-[#3b82f6] text-white text-sm font-medium hover:bg-[#2563eb] transition-colors"
              >
                I&apos;ve authorized — paste code
              </button>
            </>
          )}

          {step === 'code' && !warning && (
            <>
              <div>
                <label className="block text-[#9ca3af] text-xs mb-1.5">Code from browser</label>
                <input
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="Paste code here"
                  className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm font-mono placeholder-[#4b5563] focus:outline-none focus:border-[#10b981]"
                />
              </div>
              {error && <p className="text-[#ef4444] text-xs">{error}</p>}
              <button
                disabled={!code.trim() || busy}
                onClick={() => { void handleVerify() }}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded bg-[#10b981] text-white text-sm font-medium hover:bg-[#059669] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? <><Loader2 size={14} className="animate-spin" /> Verifying…</> : 'Verify'}
              </button>
            </>
          )}

          {step === 'code' && warning && (
            <>
              <div className="flex gap-2 p-3 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded">
                <AlertTriangle size={14} className="text-[#f59e0b] shrink-0 mt-0.5" />
                <p className="text-[#f59e0b] text-xs leading-relaxed">{warning}</p>
              </div>
              <p className="text-[#9ca3af] text-xs">The profile was saved. To use a different account, log in on claude.ai with a different email first.</p>
              <button
                onClick={onSuccess}
                className="px-4 py-2 rounded bg-[#2a2a2a] text-white text-sm font-medium hover:bg-[#3a3a3a] transition-colors"
              >
                OK
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
