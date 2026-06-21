'use client'
import { useEffect, useRef, useState } from 'react'
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react'
import { useTransferStore } from '@/lib/transferStore'
import TransferRow from './TransferRow'

interface SpeedSample {
  bytes: number
  time: number
  smoothed: number
}

export default function TransferTray() {
  const { transfers, updateTransfer, removeTransfer } = useTransferStore()
  const [open, setOpen] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const lastBytes = useRef<Record<string, SpeedSample>>({})

  // Auto-open when a new active transfer starts
  useEffect(() => {
    const active = transfers.filter((t) => t.status === 'uploading' || t.status === 'downloading')
    if (active.length > 0) setOpen(true)
  }, [transfers.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // SSE connection for server-pushed upload progress
  useEffect(() => {
    if (typeof window === 'undefined') return
    const token = sessionStorage.getItem('autohub_token')
    if (!token) return

    const connect = () => {
      esRef.current?.close()
      const es = new EventSource(`/files-api/events?token=${encodeURIComponent(token)}`)

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as {
            transferId: string
            bytesWritten?: number
            total?: number
            status: string
            message?: string
          }

          const now = Date.now()
          const prev = lastBytes.current[event.transferId]

          // EMA smoothed speed — only recalculate when at least 500ms have passed
          let speed = prev?.smoothed ?? 0
          if (prev && event.bytesWritten !== undefined && event.bytesWritten > prev.bytes) {
            const dt = (now - prev.time) / 1000
            if (dt >= 0.5) {
              const instant = (event.bytesWritten - prev.bytes) / dt
              // alpha=0.25: heavy smoothing, less jitter
              speed = prev.smoothed > 0 ? 0.25 * instant + 0.75 * prev.smoothed : instant
              lastBytes.current[event.transferId] = {
                bytes: event.bytesWritten,
                time: now,
                smoothed: speed,
              }
            }
            // If < 500ms, don't update speed — keep previous smoothed value
          } else if (event.bytesWritten !== undefined) {
            lastBytes.current[event.transferId] = { bytes: event.bytesWritten, time: now, smoothed: speed }
          }

          updateTransfer(event.transferId, {
            ...(event.bytesWritten !== undefined && { bytesWritten: event.bytesWritten }),
            ...(event.total !== undefined && { total: event.total }),
            ...(event.status === 'done' && { status: 'done', completedAt: Date.now() }),
            ...(event.status === 'error' && { status: 'error', message: event.message }),
            speed,
          })

          if (event.status === 'done') {
            delete lastBytes.current[event.transferId]
            setTimeout(() => removeTransfer(event.transferId), 5000)
          }
        } catch {}
      }

      es.onerror = () => {
        es.close()
        setTimeout(connect, 3000)
      }

      esRef.current = es
    }

    connect()
    return () => { esRef.current?.close() }
  }, [updateTransfer, removeTransfer])

  if (transfers.length === 0) return null

  const activeCount = transfers.filter(
    (t) => t.status === 'uploading' || t.status === 'downloading'
  ).length

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 shadow-2xl rounded-xl overflow-hidden border border-[#2a2a2a] bg-[#141414]">
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full px-3.5 py-2.5 hover:bg-[#1c1c1c] transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-[#3b82f6]/15 flex items-center justify-center">
            <ArrowUpDown size={11} className="text-[#3b82f6]" />
          </div>
          <span className="text-[#d1d5db] text-xs font-medium">
            {activeCount > 0 ? `${activeCount} transferring…` : 'Transfers'}
          </span>
          {activeCount > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
          )}
        </div>
        {open
          ? <ChevronUp size={13} className="text-[#4b5563]" />
          : <ChevronDown size={13} className="text-[#4b5563]" />
        }
      </button>

      {/* Transfer list */}
      {open && (
        <div className="border-t border-[#222] divide-y divide-[#1f1f1f] max-h-64 overflow-y-auto px-3">
          {transfers.map((t) => (
            <TransferRow
              key={t.id}
              transfer={t}
              onCancel={() => {
                t.abort?.()
                removeTransfer(t.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
