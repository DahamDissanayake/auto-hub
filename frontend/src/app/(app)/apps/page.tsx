'use client'
import Link from 'next/link'
import { ExternalLink, LayoutGrid } from 'lucide-react'
import Image from 'next/image'
import { apps } from './apps.config'
import type { AppEntry } from './apps.config'

function AppCard({ app }: { app: AppEntry }) {
  const accent = app.color ?? '#3b82f6'
  const isInternal = app.url.startsWith('/')

  const inner = (
    <>
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-white font-semibold text-sm"
        style={{ backgroundColor: accent + '22', color: accent }}
      >
        {app.iconPath ? (
          <Image src={app.iconPath} alt={app.name} width={28} height={28} className="object-contain" />
        ) : (
          app.name[0].toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[#f1f1f1] text-sm font-medium truncate">{app.name}</p>
          {!isInternal && (
            <ExternalLink size={12} className="text-[#6b7280] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
        <p className="text-[#6b7280] text-xs mt-0.5 line-clamp-2">{app.description}</p>
      </div>
    </>
  )

  const cardClass =
    'group bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 flex items-start gap-3 hover:border-[#3b82f6]/50 transition-colors'

  if (isInternal) {
    return (
      <Link href={app.url} className={cardClass}>
        {inner}
      </Link>
    )
  }

  return (
    <a href={app.url} target="_blank" rel="noopener noreferrer" className={cardClass}>
      {inner}
    </a>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map(app => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  )
}
