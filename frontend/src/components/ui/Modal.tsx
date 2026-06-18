'use client'
import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg w-full max-w-md mx-4 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-base">{title}</h2>
          <button
            onClick={onClose}
            className="text-[#6b7280] hover:text-[#f1f1f1] transition-colors"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
