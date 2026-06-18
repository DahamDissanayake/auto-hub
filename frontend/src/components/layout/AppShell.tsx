'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const token = sessionStorage.getItem('autohub_token')
    if (!token) {
      router.replace('/login')
    }
  }, [router])

  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6 min-w-0 pb-20 md:pb-6">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
