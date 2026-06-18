'use client'
import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { useUpdatePluginConfig } from '@/lib/hooks/usePlugins'
import { useToast } from '@/components/ui/Toast'
import type { Plugin } from '@/lib/types'

interface ConfigModalProps {
  plugin: Plugin
  isOpen: boolean
  onClose: () => void
}

export default function ConfigModal({ plugin, isOpen, onClose }: ConfigModalProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      plugin.configSchema.map(item => [
        item.key,
        String(plugin.config[item.key] ?? ''),
      ]),
    ),
  )
  const updateConfig = useUpdatePluginConfig()
  const toast = useToast()

  const handleSave = async () => {
    try {
      await updateConfig.mutateAsync({ id: plugin.id, config: values })
      toast.success('Configuration saved')
      onClose()
    } catch {
      toast.error('Failed to save configuration')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Configure ${plugin.name}`}>
      <div className="space-y-4">
        {plugin.configSchema.map(item => (
          <div key={item.key}>
            <label className="block text-sm text-[#9ca3af] mb-1">
              {item.label}
              {item.required && <span className="text-[#ef4444] ml-1">*</span>}
            </label>
            <input
              type={item.secret ? 'password' : 'text'}
              value={values[item.key] ?? ''}
              onChange={e => setValues(prev => ({ ...prev, [item.key]: e.target.value }))}
              placeholder={item.secret ? '••••••••' : item.label}
              className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-sm text-[#f1f1f1] focus:outline-none focus:border-[#3b82f6]"
              data-testid={`config-input-${item.key}`}
            />
          </div>
        ))}
        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#9ca3af] hover:text-[#f1f1f1] rounded-md border border-[#2a2a2a] hover:border-[#3b82f6] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={updateConfig.isPending}
            className="px-4 py-2 text-sm bg-[#3b82f6] text-white rounded-md hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
          >
            {updateConfig.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
