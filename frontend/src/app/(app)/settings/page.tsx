'use client'
import { useState, useEffect } from 'react'
import { Settings, Shield } from 'lucide-react'
import { ExternalLink } from 'lucide-react'
import { useHealth } from '@/lib/hooks/useHealth'
import { useSettings, useUpdateSettings } from '@/lib/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import { useAuthSessions, useUpdateDevice, useRevokeSession, useLogoutAll } from '@/lib/hooks/useAuthSessions'

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

const EVENT_LABELS: Record<string, { icon: string; color: string; label: string }> = {
  password_ok:    { icon: '✓', color: '#22c55e', label: 'Password accepted' },
  otp_ok:         { icon: '✓', color: '#22c55e', label: 'OTP accepted' },
  session_issued: { icon: '✓', color: '#22c55e', label: 'Login' },
  password_fail:  { icon: '✗', color: '#ef4444', label: 'Wrong password' },
  otp_fail:       { icon: '✗', color: '#ef4444', label: 'Wrong OTP' },
  otp_locked:     { icon: '⚠', color: '#f59e0b', label: 'OTP locked' },
  logout:         { icon: '↩', color: '#6b7280', label: 'Logout' },
  revoked:        { icon: '✗', color: '#ef4444', label: 'Revoked' },
  otp_sent:       { icon: '→', color: '#3b82f6', label: 'OTP sent' },
}

function SessionsSection() {
  const [historyPage, setHistoryPage] = useState(1)
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false)
  const { data, isLoading } = useAuthSessions(historyPage)
  const updateDevice = useUpdateDevice()
  const revokeSession = useRevokeSession()
  const logoutAll = useLogoutAll()
  const currentDeviceToken = typeof window !== 'undefined' ? localStorage.getItem('autohub_device') : null

  const handleLogoutAll = async () => {
    if (!confirmRevokeAll) { setConfirmRevokeAll(true); return }
    await logoutAll.mutateAsync()
    window.location.href = '/login'
  }

  if (isLoading) return <div className="text-[#6b7280] text-sm">Loading sessions…</div>

  return (
    <div className="space-y-4">
      {/* Devices */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-medium text-sm flex items-center gap-2">
            <Shield size={15} className="text-[#3b82f6]" />
            Sessions & Devices
          </h2>
          <button
            onClick={handleLogoutAll}
            disabled={logoutAll.isPending}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              confirmRevokeAll
                ? 'border-[#ef4444] text-[#ef4444] hover:bg-[#ef4444]/10'
                : 'border-[#2a2a2a] text-[#6b7280] hover:text-white hover:border-[#3a3a3a]'
            }`}
          >
            {confirmRevokeAll ? 'Confirm revoke all?' : 'Revoke All'}
          </button>
        </div>

        {(data?.devices ?? []).length === 0 && (
          <p className="text-[#6b7280] text-sm">No devices recorded yet.</p>
        )}

        {(data?.devices ?? []).map((device) => {
          const isCurrentDevice = device.token === currentDeviceToken
          return (
            <div
              key={device.id}
              className="flex items-center justify-between py-2 border-t border-[#2a2a2a] first:border-0 gap-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    device.hasActiveSession ? 'bg-[#22c55e]' : 'bg-[#374151]'
                  }`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm text-[#f1f1f1]">
                    <span className="truncate">
                      {[device.browser, device.os].filter(Boolean).join(' · ') || 'Unknown device'}
                    </span>
                    {isCurrentDevice && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30 shrink-0">
                        This device
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#6b7280] mt-0.5">
                    {device.ip} · Last seen {new Date(device.lastSeen).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => updateDevice.mutate({ id: device.id, isPermanent: !device.isPermanent })}
                  disabled={updateDevice.isPending}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    device.isPermanent
                      ? 'border-[#22c55e]/40 text-[#22c55e] bg-[#22c55e]/5 hover:bg-[#22c55e]/10'
                      : 'border-[#2a2a2a] text-[#6b7280] hover:text-white hover:border-[#3a3a3a]'
                  }`}
                >
                  {device.isPermanent ? 'Permanent ✓' : 'Make Permanent'}
                </button>
                {device.hasActiveSession && !isCurrentDevice && (
                  <button
                    onClick={() => revokeSession.mutate(device.id)}
                    disabled={revokeSession.isPending}
                    className="text-xs px-2.5 py-1 rounded-md border border-[#2a2a2a] text-[#6b7280] hover:text-[#ef4444] hover:border-[#ef4444]/40 transition-colors"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Login History */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-5 space-y-2">
        <h2 className="text-white font-medium text-sm">Login History</h2>
        {(data?.events ?? []).length === 0 && (
          <p className="text-[#6b7280] text-sm">No events yet.</p>
        )}
        {(data?.events ?? []).map((event) => {
          const meta = EVENT_LABELS[event.eventType] ?? { icon: '·', color: '#6b7280', label: event.eventType }
          return (
            <div key={event.id} className="flex items-start gap-3 py-1.5 border-t border-[#2a2a2a] first:border-0 text-xs">
              <span style={{ color: meta.color }} className="shrink-0 w-4 text-center font-mono mt-0.5">
                {meta.icon}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-[#9ca3af]">{meta.label}</span>
                {(event.browser || event.os) && (
                  <span className="text-[#6b7280]">
                    {' · '}{[event.browser, event.os].filter(Boolean).join(' · ')}
                  </span>
                )}
                <span className="text-[#6b7280]"> · {event.ip}</span>
              </div>
              <span className="text-[#4b5563] shrink-0">
                {new Date(event.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )
        })}
        {data && data.total > (data?.events?.length ?? 0) && (
          <button
            onClick={() => setHistoryPage((p) => p + 1)}
            className="text-xs text-[#3b82f6] hover:underline mt-1"
          >
            Load more
          </button>
        )}
      </div>
    </div>
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

          <SessionsSection />
        </>
      )}
    </div>
  )
}
