'use client'
import { HardDrive, ChevronLeft, ChevronRight } from 'lucide-react'

export interface Drive {
  id: string
  root: string
  label: string
  sublabel: string
  startPath: string
}

export const DRIVES: Drive[] = [
  { id: 'internal',  root: 'internal',  label: 'Internal',   sublabel: '/home/dama',    startPath: '/'             },
  { id: 'auto-hub',  root: 'internal',  label: 'Auto-Hub',   sublabel: 'repo/auto-hub', startPath: '/repo/auto-hub' },
  { id: 'workspace', root: 'workspace', label: 'Workspace',  sublabel: '/workspace',    startPath: '/'             },
  { id: 'data',      root: 'data',      label: 'Data Drive', sublabel: '/mnt/data',     startPath: '/'             },
]

export default function DrivesSidebar({
  activeDriveId,
  onSelect,
  collapsed,
  onToggleCollapse,
}: {
  activeDriveId: string
  onSelect: (drive: Drive) => void
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  return (
    <aside
      className={`hidden md:flex md:flex-col border-r border-[#2a2a2a] shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out ${
        collapsed ? 'w-10' : 'w-40'
      }`}
    >
      {/* Header — same h-10 as toolbar */}
      <div className={`h-10 flex items-center border-b border-[#2a2a2a] shrink-0 ${collapsed ? 'justify-center' : 'px-3 justify-between'}`}>
        {!collapsed && (
          <span className="text-[#4b5563] text-[10px] font-semibold uppercase tracking-widest select-none">
            Drives
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          className="w-7 h-7 flex items-center justify-center rounded-md text-[#4b5563] hover:text-white hover:bg-[#1a1a1a] transition-colors shrink-0"
          title={collapsed ? 'Expand drives' : 'Collapse drives'}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      {/* Drive list */}
      <nav className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {DRIVES.map((drive) => {
          const active = activeDriveId === drive.id
          return (
            <button
              key={drive.id}
              onClick={() => onSelect(drive)}
              title={collapsed ? `${drive.label} — ${drive.sublabel}` : undefined}
              className={`flex items-center w-full rounded-md transition-colors ${
                collapsed ? 'justify-center py-2.5' : 'gap-2.5 px-2 py-2'
              } ${active ? 'bg-[#f59e0b]/10' : 'hover:bg-[#1a1a1a]'}`}
            >
              <HardDrive
                size={14}
                className={`shrink-0 ${active ? 'text-[#f59e0b]' : 'text-[#6b7280]'}`}
              />
              {!collapsed && (
                <div className="min-w-0">
                  <p className={`text-xs font-medium leading-snug truncate ${active ? 'text-white' : 'text-[#d1d5db]'}`}>
                    {drive.label}
                  </p>
                  <p className="text-[10px] text-[#4b5563] leading-snug truncate">{drive.sublabel}</p>
                </div>
              )}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
