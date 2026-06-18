'use client'
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  success: (msg: string) => void
  error: (msg: string) => void
  info: (msg: string) => void
}

const ToastContext = createContext<ToastContextValue>({
  success: () => {},
  error: () => {},
  info: () => {},
})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const add = useCallback((message: string, type: ToastType) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const value: ToastContextValue = {
    success: (msg) => add(msg, 'success'),
    error: (msg) => add(msg, 'error'),
    info: (msg) => add(msg, 'info'),
  }

  const styles: Record<ToastType, string> = {
    success: 'border-[#22c55e] text-[#22c55e]',
    error: 'border-[#ef4444] text-[#ef4444]',
    info: 'border-[#3b82f6] text-[#3b82f6]',
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 flex flex-col gap-2 z-50"
        aria-live="polite"
        data-testid="toast-container"
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            role="alert"
            className={`bg-[#1a1a1a] border rounded-md px-4 py-3 text-sm min-w-[260px] ${styles[toast.type]}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
