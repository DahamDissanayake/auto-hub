'use client'
import { useEffect } from 'react'
import { recordAppVisit } from '@/lib/hooks/useRecentApps'

export default function AppVisitRecorder({ id }: { id: string }) {
  useEffect(() => { recordAppVisit(id) }, [id])
  return null
}
