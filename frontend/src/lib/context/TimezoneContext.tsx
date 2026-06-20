'use client'
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useSettings } from '@/lib/hooks/useSettings'

const TimezoneContext = createContext('Asia/Colombo')

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const { data: settings } = useSettings()
  const tz = settings?.timezone ?? 'Asia/Colombo'
  return <TimezoneContext.Provider value={tz}>{children}</TimezoneContext.Provider>
}

export function useTimezone() {
  return useContext(TimezoneContext)
}
