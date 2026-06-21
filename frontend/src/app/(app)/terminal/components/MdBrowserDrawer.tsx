'use client'
import { useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FolderOpen, FileText, File, X, ChevronLeft } from 'lucide-react'
import { apiLs } from '@/lib/filesApi'
import type { DirEntry } from '@/lib/filesApi'

export interface MdBrowserDrawerProps {
  root: string
  startPath: string
  onClose: () => void
}

type View = 'browse' | 'viewer'

export function MdBrowserDrawer({ root, startPath, onClose }: MdBrowserDrawerProps) {
  const [view, setView] = useState<View>('browse')
  const [currentPath, setCurrentPath] = useState(startPath)
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mdContent, setMdContent] = useState<string | null>(null)
  const [mdTitle, setMdTitle] = useState('')
  const [mdLoading, setMdLoading] = useState(false)
  const [mdError, setMdError] = useState<string | null>(null)

  const loadDir = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiLs(root, path)
      const sorted = [...result.entries].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setEntries(sorted)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load directory')
    } finally {
      setLoading(false)
    }
  }, [root])

  useEffect(() => { void loadDir(currentPath) }, [currentPath, loadDir])

  const openFolder = (name: string) => setCurrentPath(p => `${p}/${name}`)

  const goUp = () => {
    if (currentPath === startPath) return
    const parts = currentPath.split('/')
    setCurrentPath(parts.slice(0, -1).join('/') || startPath)
  }

  const openMd = useCallback(async (entry: DirEntry) => {
    const filePath = `${currentPath}/${entry.name}`
    setMdTitle(entry.name)
    setMdContent(null)
    setMdError(null)
    setMdLoading(true)
    setView('viewer')
    try {
      const token = sessionStorage.getItem('autohub_token') ?? ''
      const res = await fetch(
        `/files-api/download?root=${encodeURIComponent(root)}&path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(token)}`
      )
      if (!res.ok) throw new Error(`Failed to load file (${res.status})`)
      setMdContent(await res.text())
    } catch (e) {
      setMdError(e instanceof Error ? e.message : 'Failed to load file')
    } finally {
      setMdLoading(false)
    }
  }, [root, currentPath])

  const goBackToBrowse = () => {
    setView('browse')
    setMdContent(null)
    setMdError(null)
  }

  const breadcrumb = currentPath.startsWith(startPath)
    ? currentPath.slice(startPath.length).split('/').filter(Boolean)
    : []

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center pt-8 px-4 pb-8"
      onClick={onClose}
    >
      <div
        className="bg-[#111] rounded-lg w-full max-w-lg flex flex-col overflow-hidden border border-[#2a2a2a]"
        style={{ maxHeight: 'calc(100dvh - 4rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {view === 'browse' ? (
          <>
            {/* Browse header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2a2a2a] shrink-0">
              <button
                onClick={goUp}
                disabled={currentPath === startPath}
                aria-label="Go up"
                className="p-1 rounded text-[#9ca3af] hover:text-[#e5e7eb] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex-1 flex items-center gap-1 text-xs text-[#6b7280] min-w-0 truncate">
                <span className="text-[#e5e7eb] font-medium shrink-0">
                  {startPath.split('/').pop()}
                </span>
                {breadcrumb.map((seg, i) => (
                  <span key={i} className="flex items-center gap-1 shrink-0">
                    <span>/</span>
                    <span className={i === breadcrumb.length - 1 ? 'text-[#e5e7eb]' : ''}>{seg}</span>
                  </span>
                ))}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-1 rounded text-[#9ca3af] hover:text-[#e5e7eb] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Browse content */}
            <div className="flex-1 overflow-y-auto">
              {loading && (
                <div className="flex items-center justify-center py-12 text-[#6b7280] text-sm">
                  Loading…
                </div>
              )}
              {!loading && error && (
                <div className="flex flex-col items-center gap-3 py-12">
                  <p className="text-[#ef4444] text-sm text-center px-4">{error}</p>
                  <button
                    onClick={() => void loadDir(currentPath)}
                    className="px-3 py-1.5 text-xs bg-[#2a2a2a] text-[#e5e7eb] rounded hover:bg-[#3a3a3a] transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )}
              {!loading && !error && entries.length === 0 && (
                <div className="flex items-center justify-center py-12 text-[#6b7280] text-sm">
                  No files found
                </div>
              )}
              {!loading && !error && entries.map(entry => {
                const isDir = entry.type === 'dir'
                const isMd = !isDir && entry.name.toLowerCase().endsWith('.md')
                return (
                  <button
                    key={entry.name}
                    onClick={() => {
                      if (isDir) openFolder(entry.name)
                      else if (isMd) void openMd(entry)
                    }}
                    disabled={!isDir && !isMd}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors border-b border-[#1a1a1a] last:border-0 ${
                      isDir || isMd
                        ? 'hover:bg-[#1e1e1e] cursor-pointer'
                        : 'cursor-default opacity-40'
                    }`}
                  >
                    {isDir && <FolderOpen size={16} className="shrink-0 text-[#f59e0b]" />}
                    {isMd && <FileText size={16} className="shrink-0 text-[#3b82f6]" />}
                    {!isDir && !isMd && <File size={16} className="shrink-0 text-[#6b7280]" />}
                    <span className={isDir ? 'text-[#e5e7eb]' : isMd ? 'text-[#3b82f6]' : 'text-[#6b7280]'}>
                      {entry.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <>
            {/* Viewer header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2a2a2a] shrink-0">
              <button
                onClick={goBackToBrowse}
                className="flex items-center gap-1 text-xs text-[#9ca3af] hover:text-[#e5e7eb] px-2 py-1 rounded hover:bg-[#1e1e1e] transition-colors"
              >
                <ChevronLeft size={14} />
                <span>Back</span>
              </button>
              <span className="flex-1 text-center text-sm font-medium text-[#e5e7eb] truncate px-2">
                {mdTitle}
              </span>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-1 rounded text-[#9ca3af] hover:text-[#e5e7eb] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Viewer content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {mdLoading && (
                <div className="flex items-center justify-center py-12 text-[#6b7280] text-sm">
                  Loading…
                </div>
              )}
              {!mdLoading && mdError && (
                <p className="text-[#ef4444] text-sm text-center py-12 px-4">{mdError}</p>
              )}
              {!mdLoading && mdContent !== null && (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-2xl font-bold text-[#e5e7eb] mb-4 mt-6 first:mt-0 border-b border-[#2a2a2a] pb-2">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-xl font-semibold text-[#e5e7eb] mb-3 mt-5">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-lg font-semibold text-[#d1d5db] mb-2 mt-4">{children}</h3>
                    ),
                    h4: ({ children }) => (
                      <h4 className="text-base font-semibold text-[#d1d5db] mb-2 mt-3">{children}</h4>
                    ),
                    p: ({ children }) => (
                      <p className="text-[#d1d5db] text-sm leading-relaxed mb-3">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc list-outside text-[#d1d5db] text-sm mb-3 space-y-1 pl-5">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal list-outside text-[#d1d5db] text-sm mb-3 space-y-1 pl-5">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => <li className="text-[#d1d5db]">{children}</li>,
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        className="text-[#3b82f6] hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {children}
                      </a>
                    ),
                    pre: ({ children }) => (
                      <pre className="bg-[#0d0d0d] p-4 rounded-md overflow-x-auto mb-3 border border-[#2a2a2a] text-xs font-mono text-[#e5e7eb]">
                        {children}
                      </pre>
                    ),
                    code: ({ className, children }) => {
                      const isBlock = Boolean(className)
                      if (isBlock) {
                        return (
                          <code className="text-[#e5e7eb] text-xs font-mono">{children}</code>
                        )
                      }
                      return (
                        <code className="bg-[#1e1e1e] text-[#f87171] text-xs font-mono px-1.5 py-0.5 rounded">
                          {children}
                        </code>
                      )
                    },
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-[#3b82f6] pl-4 my-3 text-[#9ca3af] italic">
                        {children}
                      </blockquote>
                    ),
                    hr: () => <hr className="border-[#2a2a2a] my-4" />,
                    table: ({ children }) => (
                      <div className="overflow-x-auto mb-3">
                        <table className="text-sm text-[#d1d5db] border-collapse w-full">
                          {children}
                        </table>
                      </div>
                    ),
                    th: ({ children }) => (
                      <th className="border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-left font-semibold text-[#e5e7eb]">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="border border-[#2a2a2a] px-3 py-1.5 text-[#d1d5db]">
                        {children}
                      </td>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-[#e5e7eb]">{children}</strong>
                    ),
                    em: ({ children }) => (
                      <em className="italic text-[#d1d5db]">{children}</em>
                    ),
                    img: ({ src, alt }) => {
                      const safe = typeof src === 'string' && /^(https?:\/\/|\/)/.test(src)
                      if (!safe) return <span className="text-[#6b7280] text-xs italic">[image]</span>
                      return <img src={src} alt={alt ?? ''} className="max-w-full rounded my-2" />
                    },
                  }}
                >
                  {mdContent}
                </ReactMarkdown>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
