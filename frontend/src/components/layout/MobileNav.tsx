'use client'
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Zap, LayoutGrid, Calendar,
  GitBranch, Settings, LogOut, X,
} from 'lucide-react'
import { useRecentApps } from '@/lib/hooks/useRecentApps'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/plugins', label: 'Shortcuts', icon: Zap },
  { href: '/apps', label: 'Apps', icon: LayoutGrid },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/n8n-workflows', label: 'n8n Workflows', icon: GitBranch },
]

interface MobileNavProps {
  open: boolean
  onClose: () => void
}

export function MobileNav({ open, onClose }: MobileNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const drawerRef = useRef<HTMLDivElement>(null)
  const recentApps = useRecentApps()

  // Close on route change
  useEffect(() => { onClose() }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleLogout = () => {
    sessionStorage.removeItem('autohub_token')
    router.replace('/login')
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={`md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`md:hidden fixed top-0 right-0 bottom-0 z-50 w-72 bg-[#111111] border-l border-[#2a2a2a] flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a2a]">
          <div className="flex items-center gap-2.5">
            <Image
              src="/img/Base Logo - Light.png"
              alt="AutoHub"
              width={36}
              height={20}
              className="object-contain"
              priority
            />
            <span className="text-white font-semibold text-sm">AutoHub</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#6b7280] hover:text-white hover:bg-[#2a2a2a] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href
            return (
              <div key={href}>
                <Link
                  href={href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'text-[#3b82f6] bg-[#3b82f6]/10 border-l-2 border-[#3b82f6] pl-[14px]'
                      : 'text-[#9ca3af] hover:text-[#f1f1f1] hover:bg-[#1a1a1a] active:bg-[#1a1a1a]'
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </Link>
                {href === '/apps' && recentApps.length > 0 && (
                  <div className="mt-0.5 space-y-0.5 pl-4">
                    {recentApps.map(app => {
                      const isAppActive = pathname === `/apps/${app.id}`
                      return (
                        <Link
                          key={app.id}
                          href={`/apps/${app.id}`}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors ${
                            isAppActive
                              ? 'text-[#3b82f6] bg-[#3b82f6]/10'
                              : 'text-[#6b7280] hover:text-[#f1f1f1] hover:bg-[#1a1a1a]'
                          }`}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: app.color ?? '#3b82f6' }}
                          />
                          <span className="truncate">{app.name}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Bottom — Settings + Logout */}
        <div className="p-3 border-t border-[#2a2a2a] space-y-0.5">
          <Link
            href="/settings"
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
              pathname === '/settings'
                ? 'text-[#3b82f6] bg-[#3b82f6]/10 border-l-2 border-[#3b82f6] pl-[14px]'
                : 'text-[#9ca3af] hover:text-[#f1f1f1] hover:bg-[#1a1a1a]'
            }`}
          >
            <Settings size={18} />
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-[#9ca3af] hover:text-[#ef4444] hover:bg-[#1a1a1a] w-full transition-colors"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </div>
    </>
  )
}
