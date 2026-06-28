'use client'

interface Props {
  scheduledAt: string | null
  ratePerHour: number | null
  totalContacts: number
  onChange: (scheduledAt: string | null, ratePerHour: number | null) => void
}

function estimatedCompletion(total: number, ratePerHour: number | null, scheduledAt: string | null): string {
  const startMs = scheduledAt ? new Date(scheduledAt).getTime() : Date.now()
  const rate = ratePerHour ?? 2400
  const durationMs = (total / rate) * 3_600_000
  return new Date(startMs + durationMs).toLocaleString()
}

export function Step4SendOptions({ scheduledAt, ratePerHour, totalContacts, onChange }: Props) {
  const isScheduled = scheduledAt !== null

  return (
    <div className="space-y-5">
      {/* Immediate vs scheduled */}
      <div>
        <label className="block text-xs text-[#9ca3af] mb-2">When to send</label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onChange(null, ratePerHour)}
            className={`flex-1 py-2.5 rounded-lg text-sm border transition-colors ${!isScheduled ? 'bg-[#8b5cf6]/10 border-[#8b5cf6] text-[#8b5cf6]' : 'border-[#222] text-[#6b7280] hover:border-[#444]'}`}
          >
            Send immediately
          </button>
          <button
            type="button"
            onClick={() => onChange(new Date(Date.now() + 3_600_000).toISOString().slice(0, 16), ratePerHour)}
            className={`flex-1 py-2.5 rounded-lg text-sm border transition-colors ${isScheduled ? 'bg-[#8b5cf6]/10 border-[#8b5cf6] text-[#8b5cf6]' : 'border-[#222] text-[#6b7280] hover:border-[#444]'}`}
          >
            Schedule for later
          </button>
        </div>
      </div>

      {/* Date picker (scheduled only) */}
      {isScheduled && (
        <div>
          <label className="block text-xs text-[#9ca3af] mb-1.5">Send at</label>
          <input
            type="datetime-local"
            value={scheduledAt?.slice(0, 16)}
            onChange={e => onChange(e.target.value, ratePerHour)}
            className="bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2 text-sm text-[#e5e7eb] focus:outline-none focus:border-[#8b5cf6]"
          />
        </div>
      )}

      {/* Rate cap */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-[#9ca3af]">Rate cap</label>
          <span className="text-xs text-[#8b5cf6]">
            {ratePerHour ? `${ratePerHour} emails/hour` : 'No cap (1.5s delay)'}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={500}
          step={10}
          value={ratePerHour ?? 0}
          onChange={e => onChange(scheduledAt, Number(e.target.value) || null)}
          className="w-full accent-[#8b5cf6]"
        />
        <div className="flex justify-between text-xs text-[#4b5563] mt-1">
          <span>No cap</span><span>500/hr</span>
        </div>
      </div>

      {/* Warning + estimate */}
      {totalContacts > 500 && (
        <div className="p-3 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-lg text-xs text-[#f59e0b]">
          ⚠ {totalContacts} contacts exceeds Gmail free tier limit (~500/day). Consider spreading across multiple days using the rate cap.
        </div>
      )}

      {totalContacts > 0 && (
        <p className="text-xs text-[#6b7280]">
          Sending to <span className="text-[#e5e7eb]">{totalContacts} contacts</span>.
          Estimated completion: <span className="text-[#e5e7eb]">{estimatedCompletion(totalContacts, ratePerHour, scheduledAt)}</span>
        </p>
      )}
    </div>
  )
}
