'use client'
import { X, Upload, Download, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { Transfer } from '@/lib/transferStore'

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function formatSpeed(bps: number): string {
  if (bps <= 0) return ''
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
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
  const active = status === 'uploading' || status === 'downloading'

  return (
    <div className="py-2.5 flex items-start gap-2.5">
      {/* Direction icon */}
      <div className={`mt-0.5 shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${
        status === 'error' ? 'bg-red-900/30' : 'bg-[#1e1e1e]'
      }`}>
        {direction === 'up'
          ? <Upload size={12} className="text-[#3b82f6]" />
          : <Download size={12} className="text-[#10b981]" />
        }
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[#d1d5db] text-xs truncate leading-none">{filename}</span>
          <div className="flex items-center gap-1 shrink-0">
            {active && (
              <Loader2 size={12} className="animate-spin text-[#3b82f6]" />
            )}
            {status === 'done' && (
              <CheckCircle size={12} className="text-[#10b981]" />
            )}
            {status === 'error' && (
              <XCircle size={12} className="text-red-400" />
            )}
            {active && (
              <button
                onClick={onCancel}
                className="text-[#4b5563] hover:text-white transition-colors ml-0.5"
                aria-label="Cancel"
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {status === 'error' && transfer.message && (
          <p className="text-red-400 text-[10px] mt-1 leading-snug">{transfer.message}</p>
        )}

        {active && (
          <div className="mt-1.5 space-y-1">
            <div className="h-[3px] bg-[#222] rounded-full overflow-hidden">
              {indeterminate ? (
                <div className="h-full w-1/3 bg-[#3b82f6] rounded-full animate-[slide_1.5s_ease-in-out_infinite]" />
              ) : (
                <div
                  className="h-full bg-[#3b82f6] rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-[#4b5563]">
              <span>
                {pct !== null ? `${pct}%` : ''}
                {total > 0 && (
                  <span className="ml-1 text-[#374151]">
                    {formatBytes(bytesWritten)} / {formatBytes(total)}
                  </span>
                )}
              </span>
              {speed > 0 && (
                <span className="text-[#6b7280]">{formatSpeed(speed)}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
