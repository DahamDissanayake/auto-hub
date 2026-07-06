'use client'
import Link from 'next/link'
import { ArrowLeft, Mail, Pause, Play, RefreshCw } from 'lucide-react'
import {
  useCampaign,
  useLogs,
  usePauseCampaign,
  useResumeCampaign,
  useRetryFailed,
} from '@/lib/hooks/useMails'
import type { Campaign, SendLog } from '@/lib/mails/types'

const STATUS_COLORS: Record<string, string> = {
  draft: '#6b7280',
  scheduled: '#f59e0b',
  sending: '#3b82f6',
  paused: '#f97316',
  completed: '#22c55e',
}

const LOG_STATUS_COLORS: Record<string, string> = {
  pending: '#6b7280',
  sent: '#22c55e',
  failed: '#ef4444',
}

function StatusBadge({ status }: { status: Campaign['status'] }) {
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: STATUS_COLORS[status] + '22', color: STATUS_COLORS[status] }}
    >
      {status}
    </span>
  )
}

function LogStatusDot({ status }: { status: SendLog['status'] }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full"
      style={{ background: LOG_STATUS_COLORS[status] }}
    />
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-[#111111] border border-[#222222] rounded-xl px-4 py-3 text-center">
      <div className="text-xl font-semibold" style={{ color: color ?? '#e5e7eb' }}>{value}</div>
      <div className="text-xs text-[#6b7280] mt-0.5">{label}</div>
    </div>
  )
}

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  const campaignId = Number(params.id)

  const { data: campaign, isLoading: loadingCampaign } = useCampaign(campaignId)
  const { data: logs = [], isLoading: loadingLogs } = useLogs(campaignId)
  const pause = usePauseCampaign()
  const resume = useResumeCampaign()
  const retry = useRetryFailed()

  const failedCount = logs.filter(l => l.status === 'failed').length

  if (loadingCampaign) {
    return <div className="p-6 text-sm text-[#6b7280]">Loading…</div>
  }

  if (!campaign) {
    return (
      <div className="p-6 text-sm text-[#ef4444]">
        Campaign not found.{' '}
        <Link href="/mails" className="underline">Back to Mails</Link>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/mails" className="text-[#6b7280] hover:text-[#e5e7eb]">
            <ArrowLeft size={16} />
          </Link>
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-[#8b5cf6]" />
            <h1 className="text-[#e5e7eb] font-semibold">{campaign.name}</h1>
          </div>
          <StatusBadge status={campaign.status} />
        </div>

        <div className="flex items-center gap-2">
          {campaign.status === 'sending' && (
            <button
              onClick={() => pause.mutate(campaignId)}
              disabled={pause.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#f97316]/40 text-[#f97316] rounded-lg hover:bg-[#f97316]/10 disabled:opacity-50"
            >
              <Pause size={12} /> Pause
            </button>
          )}
          {campaign.status === 'paused' && (
            <button
              onClick={() => resume.mutate(campaignId)}
              disabled={resume.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#22c55e]/40 text-[#22c55e] rounded-lg hover:bg-[#22c55e]/10 disabled:opacity-50"
            >
              <Play size={12} /> Resume
            </button>
          )}
          {failedCount > 0 && (
            <button
              onClick={() => retry.mutate(campaignId)}
              disabled={retry.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#ef4444]/40 text-[#ef4444] rounded-lg hover:bg-[#ef4444]/10 disabled:opacity-50"
            >
              <RefreshCw size={12} /> Retry {failedCount} failed
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {campaign.stats && (
        <div className="grid grid-cols-5 gap-3">
          <StatCard label="Total" value={campaign.stats.total} />
          <StatCard label="Sent" value={campaign.stats.sent} color="#22c55e" />
          <StatCard label="Opened" value={campaign.stats.opened} color="#3b82f6" />
          <StatCard label="Replied" value={campaign.stats.replied} color="#8b5cf6" />
          <StatCard label="Failed" value={campaign.stats.failed} color="#ef4444" />
        </div>
      )}

      {/* Campaign info */}
      <div className="bg-[#111111] border border-[#222222] rounded-xl p-5 space-y-2 text-sm">
        <div className="flex gap-2">
          <span className="text-[#6b7280] w-24">Subject</span>
          <span className="text-[#e5e7eb]">{campaign.subject}</span>
        </div>
        {campaign.scheduledAt && (
          <div className="flex gap-2">
            <span className="text-[#6b7280] w-24">Scheduled</span>
            <span className="text-[#e5e7eb]">{new Date(campaign.scheduledAt).toLocaleString()}</span>
          </div>
        )}
        {campaign.ratePerHour && (
          <div className="flex gap-2">
            <span className="text-[#6b7280] w-24">Rate cap</span>
            <span className="text-[#e5e7eb]">{campaign.ratePerHour}/hr</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="text-[#6b7280] w-24">Created</span>
          <span className="text-[#9ca3af] text-xs self-center">{new Date(campaign.createdAt).toLocaleString()}</span>
        </div>
      </div>

      {/* Send logs */}
      <div className="bg-[#111111] border border-[#222222] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#1e1e1e] flex items-center justify-between">
          <h2 className="text-[#e5e7eb] font-medium text-sm">Send Logs</h2>
          <span className="text-xs text-[#4b5563]">Auto-refreshes every 5s</span>
        </div>

        {loadingLogs ? (
          <div className="p-6 text-sm text-[#6b7280]">Loading logs…</div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-sm text-[#6b7280]">No logs yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#6b7280] text-xs border-b border-[#1e1e1e]">
                  <th className="text-left px-5 py-2.5 font-medium">Contact</th>
                  <th className="text-left px-4 py-2.5 font-medium">Email</th>
                  <th className="text-center px-4 py-2.5 font-medium">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium">Sent</th>
                  <th className="text-right px-4 py-2.5 font-medium">Opened</th>
                  <th className="text-right px-5 py-2.5 font-medium">Replied</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-b border-[#1a1a1a] hover:bg-[#161616]">
                    <td className="px-5 py-2.5 text-[#e5e7eb]">
                      {[log.contact.firstName, log.contact.lastName].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-[#9ca3af]">{log.contact.email}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="flex items-center justify-center gap-1.5">
                        <LogStatusDot status={log.status} />
                        <span
                          className="text-xs"
                          style={{ color: LOG_STATUS_COLORS[log.status] }}
                        >
                          {log.status}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-[#6b7280]">
                      {log.sentAt ? new Date(log.sentAt).toLocaleTimeString() : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-[#3b82f6]">
                      {log.openedAt ? new Date(log.openedAt).toLocaleTimeString() : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-right text-xs text-[#8b5cf6]">
                      {log.repliedAt ? new Date(log.repliedAt).toLocaleTimeString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
