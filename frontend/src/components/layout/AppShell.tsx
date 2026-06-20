'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import { MobileNav } from './MobileNav'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const token = sessionStorage.getItem('autohub_token')
    if (!token) {
      router.replace('/login')
    }
  }, [router])

  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 h-12 bg-[#111111] border-b border-[#2a2a2a] shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <Image
              src="/img/Base Logo - Light.png"
              alt="AutoHub"
              width={36}
              height={20}
              className="object-contain"
              priority
            />
            <span className="text-white font-medium text-sm">AutoHub</span>
          </div>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[#9ca3af] hover:text-white hover:bg-[#1a1a1a] active:bg-[#2a2a2a] transition-colors"
          >
            <Menu size={20} />
          </button>
        </header>

        <main className="flex-1 overflow-auto p-6 min-w-0">
          {children}
        </main>
      </div>

      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  )
}
