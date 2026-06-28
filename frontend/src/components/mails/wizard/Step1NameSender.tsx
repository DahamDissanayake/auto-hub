import type { GmailAccount } from '@/lib/mails/types'

interface Props {
  name: string
  fromAccountId: number | null
  accounts: GmailAccount[]
  onChange: (name: string, fromAccountId: number) => void
}

export function Step1NameSender({ name, fromAccountId, accounts, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-[#9ca3af] mb-1.5">Campaign name</label>
        <input
          value={name}
          onChange={e => onChange(e.target.value, fromAccountId ?? accounts[0]?.id ?? 0)}
          placeholder="e.g. June SaaS Outreach"
          className="w-full bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2 text-sm text-[#e5e7eb] placeholder-[#4b5563] focus:outline-none focus:border-[#8b5cf6]"
        />
      </div>
      <div>
        <label className="block text-xs text-[#9ca3af] mb-1.5">Send from</label>
        {accounts.length === 0 ? (
          <p className="text-xs text-[#ef4444]">
            No Gmail accounts configured.{' '}
            <a href="/mails/settings" className="underline">Add one first →</a>
          </p>
        ) : (
          <select
            value={fromAccountId ?? ''}
            onChange={e => onChange(name, Number(e.target.value))}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2 text-sm text-[#e5e7eb] focus:outline-none focus:border-[#8b5cf6]"
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.displayName} &lt;{a.email}&gt;{a.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}
