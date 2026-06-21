'use client'
import { useEffect, useRef } from 'react'
import { Download, Pencil, Trash2 } from 'lucide-react'
import type { DirEntry } from '@/lib/filesApi'

export default function ContextMenu({
  x,
  y,
  entry,
  onDownload,
  onRename,
  onDelete,
  onClose,
}: {
  x: number
  y: number
  entry: DirEntry
  onDownload: () => void
  onRename: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Clamp to viewport so menu never clips off-screen
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const { innerWidth, innerHeight } = window
    const { offsetWidth, offsetHeight } = el
    el.style.left = `${Math.min(x, innerWidth  - offsetWidth  - 8)}px`
    el.style.top  = `${Math.min(y, innerHeight - offsetHeight - 8)}px`
  }, [x, y])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{ top: y, left: x }}
      className="fixed z-50 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl py-1 w-40"
    >
      {entry.type === 'file' && (
        <button
          onClick={() => { onDownload(); onClose() }}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[#d1d5db] hover:bg-[#2a2a2a] transition-colors"
        >
          <Download size={14} />
          Download
        </button>
      )}
      <button
        onClick={() => { onRename(); onClose() }}
        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[#d1d5db] hover:bg-[#2a2a2a] transition-colors"
      >
        <Pencil size={14} />
        Rename
      </button>
      <button
        onClick={() => { onDelete(); onClose() }}
        className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-400 hover:bg-[#2a2a2a] transition-colors"
      >
        <Trash2 size={14} />
        Delete
      </button>
    </div>
  )
}
