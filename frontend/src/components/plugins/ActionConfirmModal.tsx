'use client'
import { useState } from 'react'
import { useRunPlugin } from '@/lib/hooks/usePlugins'
import { useToast } from '@/components/ui/Toast'
import type { PluginAction } from '@/lib/types'

interface Props {
  pluginId: string
  action: PluginAction
  onClose: () => void
}

export default function ActionConfirmModal({ pluginId, action, onClose }: Props) {
  const [password, setPassword] = useState('')
  const [wrongPassword, setWrongPassword] = useState(false)
  const runPlugin = useRunPlugin()
  const toast = useToast()

  const warningText =
    action.key === 'shutdown'
      ? 'This will immediately shut down the host. You will need physical access to turn it back on.'
      : 'This will immediately restart the host. All active terminal sessions will be lost.'

  const handleConfirm = async () => {
    setWrongPassword(false)
    try {
      const result = await runPlugin.mutateAsync({ id: pluginId, action: action.key, password })
      if (result.status === 'success') {
        toast.success(`${action.label} command sent`)
        onClose()
      } else {
        toast.error(`${action.label} failed`)
        onClose()
      }
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setWrongPassword(true)
      } else {
        toast.error(`Failed to run ${action.label}`)
        onClose()
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 w-full max-w-sm flex flex-col gap-4">
        <h2 className="text-white font-semibold text-base">{action.label} Pi?</h2>
        <p className="text-[#9ca3af] text-sm">{warningText}</p>

        <div className="flex flex-col gap-1.5">
          <input
            type="password"
            placeholder="Dashboard password"
            value={password}
            onChange={e => { setPassword(e.target.value); setWrongPassword(false) }}
            onKeyDown={e => { if (e.key === 'Enter') void handleConfirm() }}
            className="w-full px-3 py-2 text-sm bg-[#0a0a0a] border border-[#2a2a2a] rounded-md text-white placeholder:text-[#4b5563] focus:outline-none focus:border-[#3b82f6]"
            autoFocus
          />
          {wrongPassword && (
            <p className="text-[#ef4444] text-xs">Wrong password</p>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs border border-[#2a2a2a] text-[#9ca3af] rounded-md hover:border-[#3b82f6] hover:text-[#f1f1f1] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={runPlugin.isPending || !password}
            className={`px-4 py-2 text-xs text-white rounded-md transition-colors disabled:opacity-50 ${
              action.danger
                ? 'bg-[#ef4444] hover:bg-[#dc2626]'
                : 'bg-[#3b82f6] hover:bg-[#2563eb]'
            }`}
          >
            {runPlugin.isPending ? 'Running…' : action.label}
          </button>
        </div>
      </div>
    </div>
  )
}
