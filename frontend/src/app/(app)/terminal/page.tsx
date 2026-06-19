'use client'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import api from '@/lib/api'

interface DirEntry {
  label: string
  path: string
}

const LAST_CWD_KEY = 'terminal.lastCwd'

const KEY_SEQUENCES = [
  { label: 'Tab', seq: '\t' },
  { label: 'Ctrl+C', seq: '\x03' },
  { label: 'Ctrl+D', seq: '\x04' },
  { label: 'Esc', seq: '\x1b' },
  { label: '↑', seq: '\x1b[A' },
  { label: '↓', seq: '\x1b[B' },
  { label: '←', seq: '\x1b[D' },
  { label: '→', seq: '\x1b[C' },
]

export default function TerminalPage() {
  const [dirs, setDirs] = useState<DirEntry[]>([])
  const [cwd, setCwd] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const termContainerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Client-side init: detect mobile, restore last cwd, fetch dirs
  useEffect(() => {
    setIsMobile(window.innerWidth < 768 || navigator.maxTouchPoints > 0)
    const saved = sessionStorage.getItem(LAST_CWD_KEY)
    if (saved) setCwd(saved)
    api.get<DirEntry[]>('/api/terminal/dirs').then(r => setDirs(r.data))
  }, [])

  // Mount xterm.js whenever cwd is set
  useEffect(() => {
    if (!cwd || !termContainerRef.current) return

    let destroyed = false
    let cleanup: (() => void) | undefined

    const init = async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ])

      if (destroyed || !termContainerRef.current) return

      const term = new Terminal({
        fontSize: isMobile ? 15 : 12,
        fontFamily: 'Menlo, "DejaVu Sans Mono", monospace',
        theme: {
          background: '#0d0d0d',
          foreground: '#e5e7eb',
          cursor: '#3b82f6',
        },
        cursorBlink: true,
        scrollback: 5000,
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(termContainerRef.current)
      fitAddon.fit()

      const token = sessionStorage.getItem('autohub_token') ?? ''
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(
        `${proto}//${window.location.host}/terminal-ws/?cwd=${encodeURIComponent(cwd)}&token=${encodeURIComponent(token)}`
      )
      wsRef.current = ws

      ws.onmessage = e => term.write(e.data as string)
      ws.onerror = () => setError('Connection error. Authentication may have failed.')
      ws.onclose = e => {
        wsRef.current = null
        if (e.code === 4401) setError('Authentication failed. Please log in again.')
        else if (e.code === 4400) setError('Invalid working directory.')
        else if (e.code === 4500) setError('Failed to start terminal. Is the terminal service running?')
        else if (e.code === 1000) setSessionEnded(true)
      }

      term.onData(data => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data)
      })

      const fit = () => {
        fitAddon.fit()
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        }
      }

      // ResizeObserver keeps the terminal sized to its container on all screen changes
      const ro = new ResizeObserver(fit)
      ro.observe(termContainerRef.current!)
      // visualViewport fires when the mobile soft keyboard opens/closes
      window.visualViewport?.addEventListener('resize', fit)

      cleanup = () => {
        ro.disconnect()
        window.visualViewport?.removeEventListener('resize', fit)
        ws.close()
        term.dispose()
      }
    }

    init()

    return () => {
      destroyed = true
      wsRef.current?.close()
      wsRef.current = null
      cleanup?.()
    }
  }, [cwd, isMobile])

  const selectDir = (path: string) => {
    sessionStorage.setItem(LAST_CWD_KEY, path)
    setError(null)
    setSessionEnded(false)
    setCwd(path)
  }

  const reconnect = () => {
    const saved = cwd
    setSessionEnded(false)
    setError(null)
    setCwd(null)
    requestAnimationFrame(() => setCwd(saved))
  }

  const clearAndPick = () => {
    setError(null)
    sessionStorage.removeItem(LAST_CWD_KEY)
    setCwd(null)
  }

  // ── Directory picker ──────────────────────────────────────────────────────
  if (!cwd) {
    return (
      <div className="fixed inset-0 bg-[#0d0d0d] flex items-center justify-center p-4 z-50">
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen size={18} className="text-[#10b981]" />
            <h2 className="text-white text-sm font-semibold">Select Working Directory</h2>
          </div>
          {dirs.length === 0 ? (
            <p className="text-[#6b7280] text-xs">Loading directories...</p>
          ) : (
            <div className="space-y-2">
              {dirs.map(d => (
                <button
                  key={d.path}
                  onClick={() => selectDir(d.path)}
                  className="w-full text-left p-3 rounded-md bg-[#111111] border border-[#2a2a2a] hover:border-[#10b981]/50 transition-colors"
                >
                  <p className="text-white text-sm font-medium">{d.label}</p>
                  <p className="text-[#6b7280] text-xs mt-0.5 font-mono">{d.path}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-[#ef4444] text-sm text-center">{error}</p>
        <button
          onClick={clearAndPick}
          className="px-4 py-2 text-xs bg-[#2a2a2a] text-[#e5e7eb] rounded hover:bg-[#3a3a3a] transition-colors"
        >
          Change Directory
        </button>
      </div>
    )
  }

  // ── Session ended ─────────────────────────────────────────────────────────
  if (sessionEnded) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-[#6b7280] text-sm">Session ended.</p>
        <div className="flex gap-2">
          <button
            onClick={reconnect}
            className="px-4 py-2 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors"
          >
            Reconnect
          </button>
          <button
            onClick={clearAndPick}
            className="px-4 py-2 text-xs bg-[#2a2a2a] text-[#e5e7eb] rounded hover:bg-[#3a3a3a] transition-colors"
          >
            Change Directory
          </button>
        </div>
      </div>
    )
  }

  // ── Terminal ──────────────────────────────────────────────────────────────
  // -mx-6 -mt-6 cancel the AppShell's p-6 so the terminal fills edge-to-edge.
  // -mb-20 on mobile cancels pb-20 (AppShell bottom padding for BottomNav).
  // md:-mb-6 cancels md:pb-6 on desktop.
  // height: 100dvh fills the full dynamic viewport height.
  return (
    <div
      className="-mx-6 -mt-6 -mb-20 md:-mb-6 flex flex-col"
      style={{ height: '100dvh' }}
    >
      {isMobile && (
        <div className="h-10 flex gap-1 px-2 items-center bg-[#1a1a1a] border-b border-[#2a2a2a] overflow-x-auto shrink-0">
          {KEY_SEQUENCES.map(k => (
            <button
              key={k.label}
              onPointerDown={e => {
                e.preventDefault() // keep keyboard open; don't blur the terminal
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(k.seq)
                }
              }}
              className="px-3 py-1 rounded text-xs font-mono bg-[#2a2a2a] text-[#e5e7eb] active:bg-[#3b82f6] select-none whitespace-nowrap"
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
      <div ref={termContainerRef} className="flex-1 overflow-hidden" />
    </div>
  )
}
