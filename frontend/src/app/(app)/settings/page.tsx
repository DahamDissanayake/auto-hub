'use client'
import { useState, useEffect } from 'react'
import { Settings, Shield, ChevronDown, ChevronUp, ExternalLink, Monitor, Clock, Trash2, X } from 'lucide-react'
import { useHealth } from '@/lib/hooks/useHealth'
import { useSettings, useUpdateSettings } from '@/lib/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import {
  useAuthSessions, useUpdateDevice, useRevokeSession,
  useLogoutAll, useDeleteDevice, type LoginEventRow,
} from '@/lib/hooks/useAuthSessions'

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

const EVENT_LABELS: Record<string, { icon: string; color: string; label: string }> = {
  password_ok:    { icon: '✓', color: '#22c55e', label: 'Password accepted' },
  otp_ok:         { icon: '✓', color: '#22c55e', label: 'OTP accepted' },
  session_issued: { icon: '◉', color: '#3b82f6', label: 'Login' },
  password_fail:  { icon: '✗', color: '#ef4444', label: 'Wrong password' },
  otp_fail:       { icon: '✗', color: '#ef4444', label: 'Wrong OTP' },
  otp_locked:     { icon: '⚠', color: '#f59e0b', label: 'OTP locked' },
  logout:         { icon: '↩', color: '#6b7280', label: 'Logout' },
  revoked:        { icon: '✗', color: '#ef4444', label: 'Revoked' },
  otp_sent:       { icon: '→', color: '#3b82f6', label: 'OTP sent' },
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#111111] border border-[#222222] rounded-xl overflow-hidden ${className}`}>
      {children}
    </div>
  )
}

function CardHeader({ title, icon, action }: { title: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1e1e1e]">
      <div className="flex items-center gap-2">
        {icon && <span className="text-[#3b82f6]">{icon}</span>}
        <h2 className="text-[#e5e7eb] font-medium text-sm">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-5 border-b border-[#1a1a1a] last:border-0">
      <span className="text-[#6b7280] text-xs">{label}</span>
      <span className="text-[#9ca3af] font-mono text-xs">{value}</span>
    </div>
  )
}

function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'green' | 'blue' }) {
  const styles = {
    default: 'border-[#2a2a2a] text-[#6b7280]',
    green: 'border-[#22c55e]/40 text-[#22c55e] bg-[#22c55e]/5',
    blue: 'border-[#3b82f6]/40 text-[#3b82f6] bg-[#3b82f6]/10',
  }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${styles[variant]}`}>
      {children}
    </span>
  )
}

function SessionsSection() {
  const [historyPage, setHistoryPage] = useState(1)
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false)
  const [confirmTerminateId, setConfirmTerminateId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showAllDevices, setShowAllDevices] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [accumulatedEvents, setAccumulatedEvents] = useState<LoginEventRow[]>([])

  const { data, isLoading } = useAuthSessions(historyPage)
  const updateDevice = useUpdateDevice()
  const revokeSession = useRevokeSession()
  const deleteDevice = useDeleteDevice()
  const logoutAll = useLogoutAll()
  const currentDeviceToken = typeof window !== 'undefined' ? localStorage.getItem('autohub_device') : null

  useEffect(() => {
    if (!data?.events) return
    if (historyPage === 1) {
      setAccumulatedEvents(data.events)
    } else {
      setAccumulatedEvents(prev => [...prev, ...data.events])
    }
  }, [data?.events, historyPage])

  const handleLogoutAll = async () => {
    if (!confirmRevokeAll) { setConfirmRevokeAll(true); return }
    await logoutAll.mutateAsync()
    window.location.href = '/login'
  }

  const handleTerminate = async (deviceId: string, isCurrentDevice: boolean) => {
    if (isCurrentDevice && confirmTerminateId !== deviceId) {
      setConfirmTerminateId(deviceId)
      return
    }
    await revokeSession.mutateAsync(deviceId)
    if (isCurrentDevice) window.location.href = '/login'
    else setConfirmTerminateId(null)
  }

  const handleDelete = async (deviceId: string) => {
    if (confirmDeleteId !== deviceId) { setConfirmDeleteId(deviceId); return }
    await deleteDevice.mutateAsync(deviceId)
    setConfirmDeleteId(null)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="Sessions & Devices" icon={<Monitor size={14} />} />
        <div className="px-5 py-8 text-center text-[#4b5563] text-xs">Loading…</div>
      </Card>
    )
  }

  const devices = data?.devices ?? []
  const visibleDevices = showAllDevices ? devices : devices.slice(0, 3)
  const hiddenCount = devices.length - 3
  const visibleEvents = showAllHistory ? accumulatedEvents : accumulatedEvents.slice(0, 6)

  return (
    <div className="space-y-4">
      {/* Devices card */}
      <Card>
        <CardHeader
          title="Sessions & Devices"
          icon={<Monitor size={14} />}
          action={
            <button
              onClick={handleLogoutAll}
              disabled={logoutAll.isPending}
              className={`text-[10px] px-2.5 py-1 rounded-lg border transition-colors ${
                confirmRevokeAll
                  ? 'border-[#ef4444]/60 text-[#ef4444] bg-[#ef4444]/10'
                  : 'border-[#2a2a2a] text-[#6b7280] hover:text-[#ef4444] hover:border-[#ef4444]/40'
              }`}
            >
              {confirmRevokeAll ? 'Confirm revoke all?' : 'Revoke All'}
            </button>
          }
        />

        {devices.length === 0 ? (
          <div className="px-5 py-8 text-center text-[#4b5563] text-xs">No devices recorded yet.</div>
        ) : (
          <>
            {/* Top 3 always visible */}
            <div>
              {visibleDevices.map((device, i) => {
                const isCurrentDevice = device.token === currentDeviceToken
                return (
                  <div
                    key={device.id}
                    className={`flex items-center gap-3 px-5 py-3 ${i > 0 ? 'border-t border-[#1a1a1a]' : ''}`}
                  >
                    {/* Status dot */}
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${device.hasActiveSession ? 'bg-[#22c55e]' : 'bg-[#2a2a2a]'}`} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-[#e5e7eb] truncate">
                          {[device.browser, device.os].filter(Boolean).join(' · ') || 'Unknown device'}
                        </span>
                        {isCurrentDevice && <Badge variant="blue">This device</Badge>}
                        {device.isPermanent && <Badge variant="green">Trusted</Badge>}
                      </div>
                      <div className="text-[10px] text-[#4b5563] mt-0.5">
                        {device.ip} · {new Date(device.lastSeen).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => updateDevice.mutate({ id: device.id, isPermanent: !device.isPermanent })}
                        disabled={updateDevice.isPending}
                        title={device.isPermanent ? 'Remove trusted status' : 'Mark as trusted (skip OTP)'}
                        className={`text-[10px] px-2 py-1 rounded-lg border transition-colors ${
                          device.isPermanent
                            ? 'border-[#22c55e]/40 text-[#22c55e] bg-[#22c55e]/5 hover:bg-[#22c55e]/10'
                            : 'border-[#2a2a2a] text-[#6b7280] hover:text-white hover:border-[#3a3a3a]'
                        }`}
                      >
                        {device.isPermanent ? 'Trusted ✓' : 'Trust'}
                      </button>

                      {device.hasActiveSession && (
                        <button
                          onClick={() => void handleTerminate(device.id, isCurrentDevice)}
                          disabled={revokeSession.isPending}
                          className={`text-[10px] px-2 py-1 rounded-lg border transition-colors ${
                            confirmTerminateId === device.id
                              ? 'border-[#ef4444] text-[#ef4444] bg-[#ef4444]/10'
                              : 'border-[#2a2a2a] text-[#6b7280] hover:text-[#ef4444] hover:border-[#ef4444]/40'
                          }`}
                        >
                          {confirmTerminateId === device.id ? 'Confirm?' : 'Terminate'}
                        </button>
                      )}

                      {!device.hasActiveSession && (
                        <button
                          onClick={() => void handleDelete(device.id)}
                          disabled={deleteDevice.isPending}
                          title="Remove this device record"
                          className={`text-[10px] px-2 py-1 rounded-lg border transition-colors ${
                            confirmDeleteId === device.id
                              ? 'border-[#ef4444] text-[#ef4444] bg-[#ef4444]/10'
                              : 'border-[#2a2a2a] text-[#4b5563] hover:text-[#ef4444] hover:border-[#ef4444]/40'
                          }`}
                        >
                          {confirmDeleteId === device.id ? 'Confirm?' : <span className="flex items-center gap-1"><Trash2 size={9} />Remove</span>}
                        </button>
                      )}

                      {/* Cancel confirm states */}
                      {(confirmTerminateId === device.id || confirmDeleteId === device.id) && (
                        <button
                          onClick={() => { setConfirmTerminateId(null); setConfirmDeleteId(null) }}
                          className="text-[#4b5563] hover:text-[#9ca3af] transition-colors"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Scrollable overflow for > 3 devices */}
            {!showAllDevices && hiddenCount > 0 && (
              <div className="border-t border-[#1a1a1a]">
                <button
                  onClick={() => setShowAllDevices(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[10px] text-[#4b5563] hover:text-[#6b7280] transition-colors"
                >
                  <ChevronDown size={11} />
                  Show {hiddenCount} more device{hiddenCount !== 1 ? 's' : ''}
                </button>
              </div>
            )}
            {showAllDevices && hiddenCount > 0 && (
              <div className="border-t border-[#1a1a1a]">
                <button
                  onClick={() => setShowAllDevices(false)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[10px] text-[#4b5563] hover:text-[#6b7280] transition-colors"
                >
                  <ChevronUp size={11} />
                  Show less
                </button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Login History card */}
      <Card>
        <CardHeader title="Login History" icon={<Clock size={14} />} />

        {accumulatedEvents.length === 0 ? (
          <div className="px-5 py-8 text-center text-[#4b5563] text-xs">No events yet.</div>
        ) : (
          <>
            <div>
              {visibleEvents.map((event, i) => {
                const meta = EVENT_LABELS[event.eventType] ?? { icon: '·', color: '#6b7280', label: event.eventType }
                return (
                  <div
                    key={event.id}
                    className={`flex items-center gap-3 px-5 py-2.5 ${i > 0 ? 'border-t border-[#1a1a1a]' : ''}`}
                  >
                    <span style={{ color: meta.color }} className="text-xs font-mono w-3 text-center shrink-0">
                      {meta.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-[#9ca3af]">{meta.label}</span>
                      {(event.browser || event.os) && (
                        <span className="text-[10px] text-[#4b5563]">
                          {' · '}{[event.browser, event.os].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-[#4b5563]">
                        {new Date(event.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-[10px] text-[#374151]">{event.ip}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Show more / Load more */}
            {(accumulatedEvents.length > 6 || (data && accumulatedEvents.length < data.total)) && (
              <div className="border-t border-[#1a1a1a]">
                {!showAllHistory && accumulatedEvents.length > 6 ? (
                  <button
                    onClick={() => setShowAllHistory(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[10px] text-[#4b5563] hover:text-[#3b82f6] transition-colors"
                  >
                    <ChevronDown size={11} />
                    Show {accumulatedEvents.length - 6} more
                  </button>
                ) : showAllHistory && data && accumulatedEvents.length < data.total ? (
                  <button
                    onClick={() => setHistoryPage(p => p + 1)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[10px] text-[#4b5563] hover:text-[#3b82f6] transition-colors"
                  >
                    <ChevronDown size={11} />
                    Load more
                  </button>
                ) : showAllHistory ? (
                  <button
                    onClick={() => setShowAllHistory(false)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[10px] text-[#4b5563] hover:text-[#6b7280] transition-colors"
                  >
                    <ChevronUp size={11} />
                    Show less
                  </button>
                ) : null}
              </div>
            )}
          </>
        )}
      </Card>
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
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-[#e5e7eb] text-lg font-semibold flex items-center gap-2">
        <Settings size={18} className="text-[#3b82f6]" />
        Settings
      </h1>

      {isLoading ? (
        <div className="text-[#4b5563] text-xs">Loading…</div>
      ) : (
        <>
          {/* System Info */}
          <Card>
            <CardHeader title="System" />
            <InfoRow label="App version"     value={health?.version ?? '—'} />
            <InfoRow label="Node.js"         value={health?.nodeVersion ?? '—'} />
            <InfoRow label="Timezone"        value={health?.timezone ?? '—'} />
            <InfoRow label="Plugin directory" value={health?.pluginDir ?? '—'} />
          </Card>

          {/* Display */}
          <Card>
            <CardHeader title="Display" />
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-[#6b7280] text-xs">Timezone</span>
              <div className="flex items-center gap-2">
                <select
                  value={selectedTz}
                  onChange={e => setSelectedTz(e.target.value)}
                  className="bg-[#0d0d0d] border border-[#222222] text-[#9ca3af] text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#3b82f6] transition-colors"
                >
                  {TIMEZONE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  onClick={handleSaveTz}
                  disabled={updateSettings.isPending}
                  className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
                >
                  {updateSettings.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </Card>

          {/* Integrations */}
          <Card>
            <CardHeader title="Integrations" />
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a1a1a]">
              <div>
                <p className="text-xs text-[#9ca3af]">Telegram notifications</p>
                <p className="text-[10px] text-[#4b5563] mt-0.5">Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env</p>
              </div>
              <Badge variant={health?.telegramConfigured ? 'green' : 'default'}>
                {health?.telegramConfigured ? 'Active' : 'Not configured'}
              </Badge>
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-xs text-[#9ca3af]">n8n automation</p>
                <p className="text-[10px] text-[#4b5563] mt-0.5">Set N8N_API_KEY in .env after creating an API key</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={health?.n8nConfigured ? 'green' : 'default'}>
                  {health?.n8nConfigured ? 'Active' : 'Not configured'}
                </Badge>
                <a
                  href="/n8n"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
                  title="Open n8n editor"
                >
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </Card>

          {/* Plugins */}
          <Card>
            <CardHeader title="Plugins" />
            <div className="px-5 py-3">
              <p className="text-xs text-[#6b7280]">
                Drop a folder with <code className="text-[#e5e7eb] bg-[#1a1a1a] px-1 py-0.5 rounded text-[10px]">manifest.json</code> and{' '}
                <code className="text-[#e5e7eb] bg-[#1a1a1a] px-1 py-0.5 rounded text-[10px]">index.js</code> into{' '}
                <code className="text-[#e5e7eb] bg-[#1a1a1a] px-1 py-0.5 rounded text-[10px]">{health?.pluginDir ?? '/app/plugins'}</code>,
                then restart the backend.
              </p>
            </div>
          </Card>

          {/* Sessions & Devices + Login History */}
          <SessionsSection />

          {/* Danger Zone */}
          <Card>
            <CardHeader title="Danger Zone" />
            <div className="px-5 py-3">
              <p className="text-xs text-[#6b7280] mb-2">To restart all services, run from the project directory:</p>
              <code className="block text-[10px] text-[#e5e7eb] bg-[#0d0d0d] border border-[#222222] rounded-lg px-4 py-2.5 font-mono">
                docker compose restart
              </code>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
