'use client'
import { useEffect, useRef, useState } from 'react'
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react'
import { useTransferStore } from '@/lib/transferStore'
import TransferRow from './TransferRow'

export default function TransferTray() {
  const { transfers, updateTransfer, removeTransfer } = useTransferStore()
  const [open, setOpen] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const lastBytes = useRef<Record<string, { bytes: number; time: number }>>({})

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
          let speed = 0
          if (prev && event.bytesWritten !== undefined) {
            const dt = (now - prev.time) / 1000
            speed = dt > 0 ? (event.bytesWritten - prev.bytes) / dt : 0
          }
          if (event.bytesWritten !== undefined) {
            lastBytes.current[event.transferId] = { bytes: event.bytesWritten, time: now }
          }
          updateTransfer(event.transferId, {
            ...(event.bytesWritten !== undefined && { bytesWritten: event.bytesWritten }),
            ...(event.total !== undefined && { total: event.total }),
            ...(event.status === 'done' && { status: 'done', completedAt: Date.now() }),
            ...(event.status === 'error' && { status: 'error', message: event.message }),
            speed,
          })
          if (event.status === 'done') {
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
    <div
      className="fixed bottom-4 right-4 z-50 w-72 shadow-2xl rounded-xl overflow-hidden border border-[#2a2a2a]"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        const active = transfers.filter(t => t.status === 'uploading' || t.status === 'downloading')
        if (active.length === 0) setOpen(false)
      }}
    >
      {/* Header chip */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full px-3 py-2 bg-[#1a1a1a] hover:bg-[#222] transition-colors"
      >
        <div className="flex items-center gap-2">
          <ArrowUpDown size={14} className="text-[#3b82f6]" />
          <span className="text-[#d1d5db] text-sm font-medium">
            {activeCount > 0 ? `${activeCount} transferring…` : 'Transfers'}
          </span>
        </div>
        {open ? <ChevronUp size={14} className="text-[#6b7280]" /> : <ChevronDown size={14} className="text-[#6b7280]" />}
      </button>

      {/* Transfer list */}
      {open && (
        <div className="bg-[#111111] px-3 divide-y divide-[#1a1a1a] max-h-72 overflow-y-auto">
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
