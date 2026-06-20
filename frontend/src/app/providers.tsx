'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, ReactNode } from 'react'
import { ToastProvider } from '@/components/ui/Toast'
import { TimezoneProvider } from '@/lib/context/TimezoneContext'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 10_000 },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TimezoneProvider>{children}</TimezoneProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
