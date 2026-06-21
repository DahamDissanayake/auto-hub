'use client'
import { useRef } from 'react'
import { Folder, FileText, Image, Film, Music, FileArchive, File } from 'lucide-react'
import type { DirEntry } from '@/lib/filesApi'

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return Image
  if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return Film
  if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) return Music
  if (['zip', 'tar', 'gz', 'bz2', '7z', 'rar'].includes(ext)) return FileArchive
  if (['txt', 'md', 'json', 'ts', 'tsx', 'js', 'py', 'sh', 'yaml', 'yml'].includes(ext)) return FileText
  return File
}

const LONG_PRESS_MS = 500

export default function FileGrid({
  entries,
  onOpenFolder,
  onContextMenu,
}: {
  entries: DirEntry[]
  onOpenFolder: (name: string) => void
  onContextMenu: (e: React.MouseEvent, entry: DirEntry) => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longFiredRef = useRef(false)

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-[#6b7280] text-sm">
        Empty folder
      </div>
    )
  }

  const startLongPress = (e: React.TouchEvent, entry: DirEntry) => {
    longFiredRef.current = false
    const touch = e.touches[0]
    timerRef.current = setTimeout(() => {
      longFiredRef.current = true
      onContextMenu(
        { clientX: touch.clientX, clientY: touch.clientY } as React.MouseEvent,
        entry,
      )
    }, LONG_PRESS_MS)
  }

  const cancelLongPress = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-1 p-1">
      {entries.map((entry) => {
        const Icon = entry.type === 'dir' ? Folder : fileIcon(entry.name)
        const color = entry.type === 'dir' ? '#f59e0b' : '#6b7280'

        return (
          <button
            key={entry.name}
            // Desktop: double-click opens folder — avoids double-navigation
            // that onClick causes (each click of a double-click fires separately)
            onDoubleClick={() => { if (entry.type === 'dir') onOpenFolder(entry.name) }}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry) }}
            onTouchStart={(e) => startLongPress(e, entry)}
            onTouchEnd={(e) => {
              cancelLongPress()
              // Mobile: single tap opens folder; preventDefault stops the
              // synthetic click/dblclick that fires after touch events
              if (!longFiredRef.current && entry.type === 'dir') {
                e.preventDefault()
                onOpenFolder(entry.name)
              }
            }}
            onTouchMove={cancelLongPress}
            className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-[#1a1a1a] active:bg-[#222] transition-colors group text-center select-none"
          >
            <div className="w-10 h-10 flex items-center justify-center">
              <Icon size={34} style={{ color }} />
            </div>
            <span className="text-[#d1d5db] text-[10px] leading-tight line-clamp-2 w-full group-hover:text-white break-all">
              {entry.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
