'use client'
import { useState, useEffect } from 'react'
import { Settings } from 'lucide-react'
import { ExternalLink } from 'lucide-react'
import { useHealth } from '@/lib/hooks/useHealth'
import { useSettings, useUpdateSettings } from '@/lib/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Colombo',        label: 'Asia/Colombo — UTC+5:30 (Sri Lanka)' },
  { value: 'Asia/Kolkata',        label: 'Asia/Kolkata — UTC+5:30 (India)' },
  { value: 'Asia/Dubai',          label: 'Asia/Dubai — UTC+4' },
  { value: 'Asia/Bangkok',        label: 'Asia/Bangkok — UTC+7' },
  { value: 'Asia/Singapore',      label: 'Asia/Singapore — UTC+8' },
  { value: 'Asia/Tokyo',          label: 'Asia/Tokyo — UTC+9' },
  { value: 'Europe/London',       label: 'Europe/London — UTC+0/+1' },
  { value: 'Europe/Paris',        label: 'Europe/Paris — UTC+1/+2' },
  { value: 'Europe/Berlin',       label: 'Europe/Berlin — UTC+1/+2' },
  { value: 'America/New_York',    label: 'America/New_York — UTC-5/-4' },
  { value: 'America/Chicago',     label: 'America/Chicago — UTC-6/-5' },
  { value: 'America/Denver',      label: 'America/Denver — UTC-7/-6' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles — UTC-8/-7' },
  { value: 'America/Sao_Paulo',   label: 'America/Sao_Paulo — UTC-3' },
  { value: 'UTC',                 label: 'UTC — UTC+0' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-5 space-y-3">
      <h2 className="text-white font-medium text-sm">{title}</h2>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm py-1 border-t border-[#2a2a2a] first:border-0">
      <span className="text-[#6b7280]">{label}</span>
      <span className="text-[#9ca3af] font-mono text-xs">{value}</span>
    </div>
  )
}

function ConfiguredBadge({ configured }: { configured: boolean }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
        configured
          ? 'border-[#22c55e]/40 text-[#22c55e] bg-[#22c55e]/5'
          : 'border-[#2a2a2a] text-[#6b7280]'
      }`}
    >
      {configured ? 'Configured' : 'Not configured'}
    </span>
  )
}

export default function SettingsPage() {
  const { data: health, isLoading } = useHealth()
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const toast = useToast()
  const [selectedTz, setSelectedTz] = useState('Asia/Colombo')

  useEffect(() => {
    if (settings?.timezone) setSelectedTz(settings.timezone)
  }, [settings?.timezone])

  const handleSaveTz = async () => {
    try {
      await updateSettings.mutateAsync({ timezone: selectedTz })
      toast.success('Timezone saved')
    } catch {
      toast.error('Failed to save timezone')
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-white text-xl font-semibold flex items-center gap-2">
        <Settings size={20} className="text-[#3b82f6]" />
        Settings
      </h1>

      {isLoading ? (
        <div className="text-[#6b7280] text-sm">Loading…</div>
      ) : (
        <>
          <Section title="System Info">
            <Row label="App version" value={health?.version ?? '—'} />
            <Row label="Node.js" value={health?.nodeVersion ?? '—'} />
            <Row label="Timezone" value={health?.timezone ?? '—'} />
            <Row label="Plugin directory" value={health?.pluginDir ?? '—'} />
          </Section>

          <Section title="Display">
            <div className="flex items-center justify-between text-sm py-1">
              <span className="text-[#6b7280]">Timezone</span>
              <div className="flex items-center gap-2">
                <select
                  value={selectedTz}
                  onChange={e => setSelectedTz(e.target.value)}
                  className="bg-[#0a0a0a] border border-[#2a2a2a] text-[#9ca3af] text-xs rounded-md px-2 py-1.5 focus:outline-none focus:border-[#3b82f6]"
                >
                  {TIMEZONE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleSaveTz}
                  disabled={updateSettings.isPending}
                  className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded-md hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
                >
                  {updateSettings.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </Section>

          <Section title="Notifications">
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-[#9ca3af]">Telegram bot (autohub-serenedge)</p>
                <p className="text-[#6b7280] text-xs mt-0.5">
                  Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env to enable
                </p>
              </div>
              <ConfiguredBadge configured={health?.telegramConfigured ?? false} />
            </div>
          </Section>

          <Section title="Plugin Directory">
            <p className="text-[#9ca3af] text-sm">
              Plugins are loaded from{' '}
              <code className="text-[#f1f1f1] bg-[#111111] px-1.5 py-0.5 rounded text-xs">
                {health?.pluginDir ?? '/app/plugins'}
              </code>
            </p>
            <p className="text-[#6b7280] text-xs">
              Drop a folder with <code>manifest.json</code> and <code>index.js</code> into the
              Docker volume, then restart the backend. The plugin will be auto-registered on startup.
            </p>
          </Section>

          <Section title="n8n">
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-[#9ca3af]">n8n API integration</p>
                <p className="text-[#6b7280] text-xs mt-0.5">
                  Set N8N_API_KEY in .env after creating an API key in n8n
                </p>
              </div>
              <ConfiguredBadge configured={health?.n8nConfigured ?? false} />
            </div>
            <a
              href="/n8n"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#3b82f6] hover:underline"
            >
              <ExternalLink size={12} />
              Open n8n editor
            </a>
          </Section>

          <Section title="Danger Zone">
            <p className="text-[#9ca3af] text-sm">
              To restart all services, run from the project directory:
            </p>
            <code className="block text-xs text-[#f1f1f1] bg-[#111111] border border-[#2a2a2a] rounded px-3 py-2 font-mono">
              docker compose restart
            </code>
            <p className="text-[#6b7280] text-xs">
              Scheduled jobs automatically re-register on backend startup.
            </p>
          </Section>
        </>
      )}
    </div>
  )
}
