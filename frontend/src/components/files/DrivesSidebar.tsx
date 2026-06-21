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
    <aside className="w-44 shrink-0 bg-[#111111] border-r border-[#2a2a2a] flex flex-col p-2 overflow-y-auto">
      <p className="text-[#4b5563] text-[10px] font-semibold px-2 pt-1 pb-2 uppercase tracking-widest">
        Drives
      </p>
      <div className="flex flex-col gap-0.5">
        {DRIVES.map(({ id, label, sublabel, icon: Icon, color }) => {
          const active = activeRoot === id
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors w-full ${
                active
                  ? 'bg-[#1e1e1e] border border-[#333]'
                  : 'border border-transparent hover:bg-[#181818]'
              }`}
            >
              <div className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: `${color}18` }}>
                <Icon size={15} style={{ color }} />
              </div>
              <div className="min-w-0 flex flex-col">
                <span className="text-[#e5e7eb] text-xs font-medium leading-snug truncate">{label}</span>
                <span className="text-[#4b5563] text-[10px] leading-snug truncate">{sublabel}</span>
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
