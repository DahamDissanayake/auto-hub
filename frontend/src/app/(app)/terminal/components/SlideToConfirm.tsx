'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

const TRACK_W = 140
const THUMB_W = 28
const MAX_DRAG = TRACK_W - THUMB_W - 4 // 4px padding (2px each side)

interface SlideToConfirmProps {
  onConfirm: () => void
  label: string
  triggerAriaLabel: string
  triggerContent: React.ReactNode
  triggerClassName: string
}

export function SlideToConfirm({
  onConfirm,
  label,
  triggerAriaLabel,
  triggerContent,
  triggerClassName,
}: SlideToConfirmProps) {
  const [armed, setArmed] = useState(false)
  const [dragPct, setDragPct] = useState(0)
  const [confirmed, setConfirmed] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const startClientXRef = useRef(0)
  const startThumbXRef = useRef(0)

  const disarm = useCallback(() => {
    setArmed(false)
    setDragPct(0)
    setConfirmed(false)
    draggingRef.current = false
  }, [])

  // Outside-click reset
  useEffect(() => {
    if (!armed) return
    const handler = (e: MouseEvent) => {
      if (trackRef.current && !trackRef.current.contains(e.target as Node)) {
        disarm()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [armed, disarm])

  // Auto-reset after 4 seconds
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(disarm, 4000)
    return () => clearTimeout(timer)
  }, [armed, disarm])

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    draggingRef.current = true
    startClientXRef.current = e.clientX
    startThumbXRef.current = dragPct * MAX_DRAG
    if ((e.currentTarget as HTMLElement).setPointerCapture) {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (!draggingRef.current) return
    const delta = e.clientX - startClientXRef.current
    const rawX = startThumbXRef.current + delta
    const clampedX = Math.max(0, Math.min(MAX_DRAG, rawX))
    setDragPct(clampedX / MAX_DRAG)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (!draggingRef.current) return
    draggingRef.current = false
    // Calculate the final drag percentage
    const delta = e.clientX - startClientXRef.current
    const rawX = startThumbXRef.current + delta
    const clampedX = Math.max(0, Math.min(MAX_DRAG, rawX))
    const finalDragPct = clampedX / MAX_DRAG

    if (finalDragPct >= 0.95) {
      setConfirmed(true)
      setTimeout(() => {
        disarm()
        onConfirm()
      }, 150)
    } else {
      disarm()
    }
  }

  const thumbX = Math.round(dragPct * MAX_DRAG)
  const thumbColor = confirmed
    ? 'bg-[#10b981]'
    : dragPct >= 0.7
    ? 'bg-[#dc2626]'
    : 'bg-[#ef4444]'

  if (!armed) {
    return (
      <button
        aria-label={triggerAriaLabel}
        onClick={e => { e.stopPropagation(); setArmed(true) }}
        className={triggerClassName}
      >
        {triggerContent}
      </button>
    )
  }

  return (
    <div
      ref={trackRef}
      onClick={e => e.stopPropagation()}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ width: TRACK_W }}
      className="relative h-6 rounded-full bg-[#2a2a2a] flex items-center shrink-0"
    >
      <span className="absolute inset-0 flex items-center justify-center text-[10px] text-[#6b7280] pointer-events-none select-none">
        slide to {label} →
      </span>
      <div
        role="slider"
        aria-label={`Slide to confirm ${label}`}
        aria-valuenow={Math.round(dragPct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        onPointerDown={handlePointerDown}
        style={{ transform: `translateX(${thumbX}px)` }}
        className={`absolute left-[2px] top-[2px] w-7 h-5 rounded-full cursor-grab active:cursor-grabbing ${thumbColor} transition-colors duration-100 touch-none`}
      />
    </div>
  )
}
