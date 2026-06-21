'use client'
import Link from 'next/link'
import { LayoutGrid, Terminal, Globe, Database, Settings, Code, Monitor, Container, FolderOpen, type LucideIcon } from 'lucide-react'
import Image from 'next/image'
import { apps } from './apps.config'
import type { AppEntry } from './apps.config'

const LUCIDE_ICONS: Record<string, LucideIcon> = {
  Terminal,
  Globe,
  Database,
  Settings,
  Code,
  Monitor,
  Container,
  FolderOpen,
}

function AppCard({ app }: { app: AppEntry }) {
  const accent = app.color ?? '#3b82f6'
  const Icon = app.lucideIcon ? LUCIDE_ICONS[app.lucideIcon] : null

  return (
    <Link href={`/apps/${app.id}`} className="group flex flex-col items-center gap-2">
      <div
        className="w-full aspect-square rounded-2xl flex items-center justify-center transition-transform group-hover:scale-95"
        style={{ backgroundColor: accent + '22' }}
      >
        {app.iconPath ? (
          <Image src={app.iconPath} alt={app.name} width={40} height={40} className="object-contain" />
        ) : Icon ? (
          <Icon size={36} style={{ color: accent }} />
        ) : (
          <span className="text-2xl font-bold" style={{ color: accent }}>
            {app.name[0].toUpperCase()}
          </span>
        )}
      </div>
      <p className="text-[#d1d5db] text-xs text-center font-medium leading-tight line-clamp-2 w-full">
        {app.name}
      </p>
    </Link>
  )
}

export default function AppsPage() {
  return (
    <div className="space-y-6 max-w-7xl">
      <h1 className="text-white text-xl font-semibold flex items-center gap-2">
        <LayoutGrid size={20} className="text-[#3b82f6]" />
        Apps
      </h1>

      {apps.length === 0 ? (
        <div className="text-[#6b7280] text-sm p-8 text-center border border-[#2a2a2a] rounded-lg">
          No apps configured yet — see{' '}
          <code className="text-[#9ca3af] bg-[#111111] px-1 rounded">appcreator.md</code>{' '}
          to add one.
        </div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4">
          {apps.map(app => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  )
}
