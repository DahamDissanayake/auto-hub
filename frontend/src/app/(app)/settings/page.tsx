'use client'
import { Settings, ExternalLink } from 'lucide-react'
import { useHealth } from '@/lib/hooks/useHealth'

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
