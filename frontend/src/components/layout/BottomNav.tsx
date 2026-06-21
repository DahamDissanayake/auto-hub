'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ListTodo, LayoutGrid, Calendar, GitBranch } from 'lucide-react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/plugins', label: 'Tasks', icon: ListTodo },
  { href: '/apps', label: 'Apps', icon: LayoutGrid },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/n8n-workflows', label: 'n8n', icon: GitBranch },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Mobile navigation" className="flex md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#111111] border-t border-[#2a2a2a]">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-col items-center justify-center flex-1 py-2 gap-1 text-[10px] transition-colors ${
              isActive ? 'text-[#3b82f6]' : 'text-[#6b7280]'
            }`}
          >
            <Icon size={20} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
