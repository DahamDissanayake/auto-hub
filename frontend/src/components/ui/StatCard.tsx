import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: number | string
  icon: LucideIcon
  accent?: 'red' | 'green' | 'blue'
}

const accentStyles = {
  red: 'border-[#ef4444]/40 bg-[#ef4444]/5',
  green: 'border-[#22c55e]/40 bg-[#22c55e]/5',
  blue: 'border-[#3b82f6]/40 bg-[#3b82f6]/5',
}

const iconStyles = {
  red: 'text-[#ef4444]',
  green: 'text-[#22c55e]',
  blue: 'text-[#3b82f6]',
}

export default function StatCard({ label, value, icon: Icon, accent }: StatCardProps) {
  return (
    <div
      className={`bg-[#1a1a1a] border rounded-lg p-4 flex items-center gap-4 ${
        accent ? accentStyles[accent] : 'border-[#2a2a2a]'
      }`}
      data-testid="stat-card"
    >
      <div
        className={`p-2 rounded-md bg-[#111111] ${
          accent ? iconStyles[accent] : 'text-[#3b82f6]'
        }`}
      >
        <Icon size={20} />
      </div>
      <div>
        <p className="text-[#9ca3af] text-xs uppercase tracking-wide">{label}</p>
        <p className="text-white text-2xl font-semibold leading-tight">{value}</p>
      </div>
    </div>
  )
}
