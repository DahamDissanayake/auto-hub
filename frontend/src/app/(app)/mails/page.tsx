'use client'
import { useCampaigns } from '@/lib/hooks/useMails'
import { mailsApi } from '@/lib/mails/api'
import Link from 'next/link'
import { Mail, Plus, Download } from 'lucide-react'
import type { Campaign } from '@/lib/mails/types'

const STATUS_COLORS: Record<string, string> = {
  draft: '#6b7280',
  scheduled: '#f59e0b',
  sending: '#3b82f6',
  paused: '#f97316',
  completed: '#22c55e',
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

export default function MailsDashboard() {
  const { data: campaigns = [], isLoading } = useCampaigns()

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail size={20} className="text-[#8b5cf6]" />
          <h1 className="text-[#e5e7eb] text-lg font-semibold">Mails</h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={mailsApi.templateUrl}
            download
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#9ca3af] border border-[#222222] rounded-lg hover:border-[#8b5cf6] hover:text-[#8b5cf6] transition-colors"
          >
            <Download size={13} />
            Excel Template
          </a>
          <Link
            href="/mails/campaigns/new"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#8b5cf6] text-white rounded-lg hover:bg-[#7c3aed] transition-colors"
          >
            <Plus size={13} />
            New Campaign
          </Link>
        </div>
      </div>

      {/* Settings link */}
      <div className="flex justify-end">
        <Link href="/mails/settings" className="text-xs text-[#6b7280] hover:text-[#8b5cf6]">
          Gmail Accounts →
        </Link>
      </div>

      {/* Campaign table */}
      <div className="bg-[#111111] border border-[#222222] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#1e1e1e]">
          <h2 className="text-[#e5e7eb] font-medium text-sm">Campaigns</h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-[#6b7280] text-sm">Loading…</div>
        ) : campaigns.length === 0 ? (
          <div className="p-8 text-center text-[#6b7280] text-sm">
            No campaigns yet.{' '}
            <Link href="/mails/campaigns/new" className="text-[#8b5cf6] hover:underline">
              Create your first one.
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#6b7280] text-xs border-b border-[#1e1e1e]">
                <th className="text-left px-5 py-2.5 font-medium">Campaign</th>
                <th className="text-right px-4 py-2.5 font-medium">Sent</th>
                <th className="text-right px-4 py-2.5 font-medium">Opened</th>
                <th className="text-right px-4 py-2.5 font-medium">Replied</th>
                <th className="text-right px-4 py-2.5 font-medium">Failed</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-5 py-2.5 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id} className="border-b border-[#1a1a1a] hover:bg-[#161616] transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/mails/campaigns/${c.id}`} className="text-[#e5e7eb] hover:text-[#8b5cf6]">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-[#9ca3af]">{c.stats?.sent ?? 0}</td>
                  <td className="px-4 py-3 text-right text-[#9ca3af]">{c.stats?.opened ?? 0}</td>
                  <td className="px-4 py-3 text-right text-[#9ca3af]">{c.stats?.replied ?? 0}</td>
                  <td className="px-4 py-3 text-right text-[#ef4444]">{c.stats?.failed ?? 0}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-5 py-3 text-right text-[#6b7280] text-xs">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
