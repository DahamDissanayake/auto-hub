'use client'
import { X, Upload, Download, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { Transfer } from '@/lib/transferStore'

function formatSpeed(bps: number): string {
  if (bps === 0) return ''
  const kbps = bps / 1024
  if (kbps < 1024) return `${kbps.toFixed(0)} KB/s`
  return `${(kbps / 1024).toFixed(1)} MB/s`
}

export default function TransferRow({
  transfer,
  onCancel,
}: {
  transfer: Transfer
  onCancel: () => void
}) {
  const { filename, direction, status, bytesWritten, total, speed } = transfer
  const pct = total > 0 ? Math.min(100, Math.round((bytesWritten / total) * 100)) : null
  const indeterminate = pct === null

  const statusIcon = {
    uploading: <Loader2 size={14} className="animate-spin text-[#3b82f6]" />,
    downloading: <Loader2 size={14} className="animate-spin text-[#3b82f6]" />,
    done: <CheckCircle size={14} className="text-[#10b981]" />,
    error: <XCircle size={14} className="text-red-400" />,
  }[status]

  return (
    <div className="flex items-start gap-2 py-2">
      <div className="mt-0.5 shrink-0">
        {direction === 'up'
          ? <Upload size={14} className="text-[#9ca3af]" />
          : <Download size={14} className="text-[#9ca3af]" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[#d1d5db] text-xs truncate">{filename}</span>
          <div className="flex items-center gap-1 shrink-0">
            {statusIcon}
            {(status === 'uploading' || status === 'downloading') && (
              <button
                onClick={onCancel}
                className="text-[#6b7280] hover:text-white transition-colors"
                aria-label="Cancel"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        {status === 'error' && transfer.message && (
          <p className="text-red-400 text-xs mt-0.5">{transfer.message}</p>
        )}
        {(status === 'uploading' || status === 'downloading') && (
          <div className="mt-1.5 space-y-0.5">
            <div className="h-1 bg-[#2a2a2a] rounded-full overflow-hidden">
              {indeterminate ? (
                <div className="h-full w-1/3 bg-[#3b82f6] rounded-full animate-[slide_1.5s_ease-in-out_infinite]" />
              ) : (
                <div
                  className="h-full bg-[#3b82f6] rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              )}
            </div>
            <div className="flex justify-between text-[10px] text-[#6b7280]">
              <span>{pct !== null ? `${pct}%` : ''}</span>
              <span>{formatSpeed(speed)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
