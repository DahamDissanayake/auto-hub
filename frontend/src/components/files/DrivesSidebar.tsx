'use client'
import { HardDrive } from 'lucide-react'

const DRIVES = [
  { id: 'internal',   label: 'Internal',    sublabel: '/home/dama' },
  { id: 'workspace',  label: 'Workspace',   sublabel: '/workspace'  },
  { id: 'data',       label: 'Data Drive',  sublabel: '/mnt/data'   },
]

export default function DrivesSidebar({
  activeRoot,
  onSelect,
}: {
  activeRoot: string
  onSelect: (root: string) => void
}) {
  return (
    <aside className="w-40 shrink-0 border-r border-[#2a2a2a] flex flex-col">
      {/* Header row — same h-10 as the toolbar so they align */}
      <div className="h-10 flex items-center px-3 border-b border-[#2a2a2a] shrink-0">
        <span className="text-[#4b5563] text-[10px] font-semibold uppercase tracking-widest select-none">
          Drives
        </span>
      </div>

      {/* Drive list */}
      <nav className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {DRIVES.map(({ id, label, sublabel }) => {
          const active = activeRoot === id
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-left transition-colors ${
                active
                  ? 'bg-[#f59e0b]/10 text-white'
                  : 'text-[#9ca3af] hover:bg-[#1a1a1a] hover:text-white'
              }`}
            >
              <HardDrive
                size={14}
                className={`shrink-0 ${active ? 'text-[#f59e0b]' : 'text-[#6b7280]'}`}
              />
              <div className="min-w-0">
                <p className={`text-xs font-medium leading-snug truncate ${active ? 'text-white' : 'text-[#d1d5db]'}`}>
                  {label}
                </p>
                <p className="text-[10px] text-[#4b5563] leading-snug truncate">{sublabel}</p>
              </div>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
