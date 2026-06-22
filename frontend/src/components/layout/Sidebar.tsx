'use client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Zap, LayoutGrid, Calendar,
  GitBranch, Settings, LogOut,
} from 'lucide-react'
import { useRecentApps } from '@/lib/hooks/useRecentApps'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/plugins', label: 'Shortcuts', icon: Zap },
  { href: '/apps', label: 'Apps', icon: LayoutGrid },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/n8n-workflows', label: 'n8n Workflows', icon: GitBranch },
]

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
}: {
  href: string
  label: string
  icon: typeof LayoutDashboard
  isActive: boolean
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
        isActive
          ? 'text-[#3b82f6] bg-[#3b82f6]/10 border-l-2 border-[#3b82f6] pl-[10px]'
          : 'text-[#9ca3af] hover:text-[#f1f1f1] hover:bg-[#1a1a1a]'
      }`}
    >
      <Icon size={16} />
      {label}
    </Link>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const recentApps = useRecentApps()

  const handleLogout = () => {
    sessionStorage.removeItem('autohub_token')
    router.replace('/login')
  }

  return (
    <aside className="hidden md:flex w-56 bg-[#111111] border-r border-[#2a2a2a] flex-col h-screen sticky top-0 shrink-0">
      <div className="p-4 border-b border-[#2a2a2a] flex items-center gap-2">
        <Image
          src="/img/Base Logo - Light.png"
          alt="AutoHub logo"
          width={44}
          height={24}
          className="object-contain"
          priority
        />
        <span className="text-white font-medium text-sm">AutoHub</span>
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <div key={item.href}>
            <NavLink
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={pathname === item.href}
            />
            {item.href === '/apps' && recentApps.length > 0 && (
              <div className="mt-0.5 space-y-0.5 pl-3">
                {recentApps.map(app => {
                  const isAppActive = pathname === `/apps/${app.id}`
                  return (
                    <Link
                      key={app.id}
                      href={`/apps/${app.id}`}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
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
        ))}
      </nav>

      <div className="p-2 border-t border-[#2a2a2a] space-y-0.5">
        <NavLink
          href="/settings"
          label="Settings"
          icon={Settings}
          isActive={pathname === '/settings'}
        />
        <button
          onClick={handleLogout}
          data-testid="logout-button"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[#9ca3af] hover:text-[#ef4444] hover:bg-[#1a1a1a] w-full transition-colors"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  )
}
