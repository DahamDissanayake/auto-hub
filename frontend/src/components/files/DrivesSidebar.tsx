'use client'
import { HardDrive, Briefcase, Database } from 'lucide-react'

const DRIVES = [
  { id: 'internal', label: 'Internal', sublabel: '/home/dama', icon: HardDrive, color: '#10b981' },
  { id: 'workspace', label: 'Workspace', sublabel: '/workspace', icon: Briefcase, color: '#8b5cf6' },
  { id: 'data', label: 'Data Drive', sublabel: '/mnt/data', icon: Database, color: '#f59e0b' },
]

export default function DrivesSidebar({
  activeRoot,
  onSelect,
}: {
  activeRoot: string
  onSelect: (root: string) => void
}) {
  return (
    <aside className="w-48 shrink-0 bg-[#111111] border-r border-[#2a2a2a] flex flex-col gap-1 p-2 overflow-y-auto">
      <p className="text-[#6b7280] text-xs font-medium px-2 py-1 uppercase tracking-wider">Drives</p>
      {DRIVES.map(({ id, label, sublabel, icon: Icon, color }) => {
        const active = activeRoot === id
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors w-full ${
              active
                ? 'bg-[#1a1a1a] border border-[#3a3a3a]'
                : 'hover:bg-[#1a1a1a] border border-transparent'
            }`}
          >
            <Icon size={18} style={{ color }} />
            <div className="min-w-0">
              <p className="text-[#f1f1f1] text-sm font-medium leading-tight">{label}</p>
              <p className="text-[#6b7280] text-xs truncate leading-tight">{sublabel}</p>
            </div>
          </button>
        )
      })}
    </aside>
  )
}
