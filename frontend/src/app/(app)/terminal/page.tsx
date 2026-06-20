'use client'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState, useCallback } from 'react'
import type { Terminal } from '@xterm/xterm'
import api from '@/lib/api'
import { SessionManager, Session } from './components/SessionManager'
import { WorkspacePicker } from './components/WorkspacePicker'
import { RepoPicker } from './components/RepoPicker'
import { CloneDialog } from './components/CloneDialog'
import { SessionTabs, TabSession } from './components/SessionTabs'
import { TerminalBreadcrumb } from './components/TerminalBreadcrumb'
import { Clipboard, MousePointer, MoveVertical } from 'lucide-react'

interface Repo {
  name: string
  path: string
  isGitRepo: boolean
}

type Step = 'session' | 'workspace' | 'repo' | 'clone' | 'terminal'
type Workspace = 'home' | 'github' | 'auto-hub'

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
  const [step, setStep] = useState<Step>('session')
  const [sessionName, setSessionName] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [repoName, setRepoName] = useState<string | null>(null)
  const [pendingName, setPendingName] = useState<string | null>(null)
  const [openTabs, setOpenTabs] = useState<TabSession[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showSessionOverlay, setShowSessionOverlay] = useState(false)
  // scroll = touch scrolls the buffer; select = touch selects text for copying
  const [touchMode, setTouchMode] = useState<'scroll' | 'select'>('scroll')
  const [copyFeedback, setCopyFeedback] = useState(false)

  const termContainerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const touchModeRef = useRef<'scroll' | 'select'>('scroll')

  useEffect(() => { touchModeRef.current = touchMode }, [touchMode])

  useEffect(() => {
    setIsMobile(window.innerWidth < 768 || navigator.maxTouchPoints > 0)
  }, [])

  useEffect(() => {
    if (!sessionName || !termContainerRef.current) return

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
        theme: { background: '#0d0d0d', foreground: '#e5e7eb', cursor: '#3b82f6' },
        cursorBlink: true,
        scrollback: 5000,
      })

      termRef.current = term

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(termContainerRef.current)
      fitAddon.fit()

      const token = sessionStorage.getItem('autohub_token') ?? ''
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(
        `${proto}//${window.location.host}/terminal-ws/?session=${encodeURIComponent(sessionName)}&token=${encodeURIComponent(token)}`
      )
      wsRef.current = ws

      ws.onmessage = e => term.write(e.data as string)
      ws.onerror = () => setError('Connection error. Authentication may have failed.')
      ws.onclose = e => {
        wsRef.current = null
        if (e.code === 4401) setError('Authentication failed. Please log in again.')
        else if (e.code === 4400) setError('Session not found.')
        else if (e.code === 4500) setError('Session ended or failed to start.')
        else if (e.code === 1000) setSessionEnded(true)
      }

      term.onData(data => { if (ws.readyState === WebSocket.OPEN) ws.send(data) })

      const fit = () => {
        fitAddon.fit()
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        }
      }

      ws.onopen = () => fit()

      const ro = new ResizeObserver(fit)
      ro.observe(termContainerRef.current!)
      window.visualViewport?.addEventListener('resize', fit)

      const el = termContainerRef.current!

      // Desktop: capture wheel in the capture phase (fires before xterm's own
      // listener on its canvas) then stopPropagation so xterm never sees it.
      // Without capture:true, xterm processes first and may send ↑/↓ cursor keys
      // to the pty (shell history navigation) before our handler even runs.
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        e.stopPropagation()
        let delta = e.deltaY
        if (e.deltaMode === 1) delta *= 15       // DOM_DELTA_LINE → pixels
        else if (e.deltaMode === 2) delta *= 300  // DOM_DELTA_PAGE → pixels
        const lineH = (term.options.fontSize ?? 12) * 1.2
        const lines = Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / lineH))
        term.scrollLines(lines)
      }
      el.addEventListener('wheel', onWheel, { passive: false, capture: true })

      // Mobile touch scroll: accumulate sub-pixel movement for smooth scrolling.
      // Direction: swipe UP (dy > 0) → scrollLines(-N) = scroll up = older content.
      let touchY = 0
      let scrollRemainder = 0
      const onTouchStart = (e: TouchEvent) => {
        if (touchModeRef.current === 'scroll') {
          touchY = e.touches[0].clientY
          scrollRemainder = 0
        }
      }
      const onTouchMove = (e: TouchEvent) => {
        if (touchModeRef.current !== 'scroll') return
        e.preventDefault()
        const dy = touchY - e.touches[0].clientY
        touchY = e.touches[0].clientY
        scrollRemainder += dy
        const lineH = (term.options.fontSize ?? 15) * 1.2
        const lines = Math.trunc(scrollRemainder / lineH)
        if (lines !== 0) {
          scrollRemainder -= lines * lineH
          term.scrollLines(-lines)
        }
      }
      el.addEventListener('touchstart', onTouchStart, { passive: true })
      el.addEventListener('touchmove', onTouchMove, { passive: false })

      cleanup = () => {
        ro.disconnect()
        window.visualViewport?.removeEventListener('resize', fit)
        el.removeEventListener('wheel', onWheel, { capture: true })
        el.removeEventListener('touchstart', onTouchStart)
        el.removeEventListener('touchmove', onTouchMove)
        ws.close()
        term.dispose()
        termRef.current = null
      }
    }

    init()

    return () => {
      destroyed = true
      wsRef.current?.close()
      wsRef.current = null
      cleanup?.()
    }
  }, [sessionName, isMobile])

  const copySelection = useCallback(async () => {
    const term = termRef.current
    if (!term) return
    const text = term.getSelection()
    if (!text) {
      // Nothing selected — select all and copy
      term.selectAll()
      const all = term.getSelection()
      term.clearSelection()
      if (!all) return
      await navigator.clipboard.writeText(all)
    } else {
      await navigator.clipboard.writeText(text)
    }
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 1200)
  }, [])

  const createAndOpenSession = async (
    name: string,
    cwd: string,
    ws: Workspace,
    repo: string | null,
  ) => {
    try {
      await api.post('/api/terminal/sessions', { name, cwd, workspace: ws, repoName: repo })
    } catch (e) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to create session'
      setError(msg)
      setStep('session')
      return
    }
    const tab: TabSession = { name, workspace: ws, repoName: repo }
    setOpenTabs(tabs => [...tabs, tab])
    setWorkspace(ws)
    setRepoName(repo)
    setSessionName(name)
    setError(null)
    setSessionEnded(false)
    setStep('terminal')
  }

  const handleSessionOpen = (session: Session) => {
    if (session.name === sessionName && step === 'terminal') return
    setWorkspace(session.workspace)
    setRepoName(session.repoName)
    if (!openTabs.some(t => t.name === session.name)) {
      setOpenTabs(tabs => [
        ...tabs,
        { name: session.name, workspace: session.workspace, repoName: session.repoName },
      ])
    }
    setError(null)
    setSessionEnded(false)
    setSessionName(session.name)
    setStep('terminal')
  }

  const handleNewSessionName = (name: string) => {
    setPendingName(name)
    setStep('workspace')
  }

  const handleWorkspaceSelect = async (ws: Workspace) => {
    setWorkspace(ws)
    if (ws === 'home') {
      await createAndOpenSession(pendingName!, '/workspace/data', ws, null)
    } else if (ws === 'auto-hub') {
      await createAndOpenSession(pendingName!, '/workspace/auto-hub', ws, null)
    } else {
      setStep('repo')
    }
  }

  const handleRepoSelect = async (repo: Repo) => {
    setRepoName(repo.name)
    await createAndOpenSession(pendingName!, repo.path, 'github', repo.name)
  }

  const handleCloneSuccess = async (repoPath: string, name: string) => {
    setRepoName(name)
    await createAndOpenSession(pendingName!, repoPath, 'github', name)
  }

  const handleSwitchTab = (name: string) => {
    if (name === sessionName) return
    const tab = openTabs.find(t => t.name === name)
    if (!tab) return
    setSessionName(null)
    setWorkspace(tab.workspace)
    setRepoName(tab.repoName)
    setError(null)
    setSessionEnded(false)
    requestAnimationFrame(() => setSessionName(name))
  }

  const handleEndTab = async (name: string) => {
    try {
      await api.delete(`/api/terminal/sessions/${encodeURIComponent(name)}`)
    } catch {
      // session may already be dead
    }
    setOpenTabs(tabs => tabs.filter(t => t.name !== name))
    if (sessionName === name) {
      setSessionName(null)
      setStep('session')
    }
  }

  const handleChangeDir = () => {
    setSessionName(null)
    setWorkspace(null)
    setRepoName(null)
    setError(null)
    setSessionEnded(false)
    setStep('session')
  }

  const reconnect = () => {
    const saved = sessionName
    setSessionEnded(false)
    setError(null)
    setSessionName(null)
    requestAnimationFrame(() => setSessionName(saved))
  }

  if (step === 'session') {
    return <SessionManager onOpen={handleSessionOpen} onNew={handleNewSessionName} />
  }
  if (step === 'workspace') {
    return <WorkspacePicker onSelect={handleWorkspaceSelect} onBack={() => setStep('session')} />
  }
  if (step === 'repo') {
    return (
      <RepoPicker
        onSelect={repo => { void handleRepoSelect(repo) }}
        onClone={() => setStep('clone')}
        onBack={() => setStep('workspace')}
      />
    )
  }
  if (step === 'clone') {
    return (
      <CloneDialog
        onSuccess={(path, name) => { void handleCloneSuccess(path, name) }}
        onBack={() => setStep('repo')}
      />
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-[#ef4444] text-sm text-center">{error}</p>
        <button
          onClick={handleChangeDir}
          className="px-4 py-2 text-xs bg-[#2a2a2a] text-[#e5e7eb] rounded hover:bg-[#3a3a3a] transition-colors"
        >
          Sessions
        </button>
      </div>
    )
  }

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
            onClick={handleChangeDir}
            className="px-4 py-2 text-xs bg-[#2a2a2a] text-[#e5e7eb] rounded hover:bg-[#3a3a3a] transition-colors"
          >
            Sessions
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="-mx-6 -mt-6 -mb-6 flex flex-col" style={{ height: isMobile ? 'calc(100dvh - 3rem)' : '100dvh' }}>
      <SessionTabs
        tabs={openTabs}
        activeTab={sessionName ?? ''}
        onSwitch={handleSwitchTab}
        onEnd={name => { void handleEndTab(name) }}
        onNew={() => setShowSessionOverlay(true)}
      />
      <TerminalBreadcrumb
        sessionName={sessionName ?? ''}
        workspace={workspace!}
        repoName={repoName}
        onChangeDir={handleChangeDir}
      />
      {isMobile && (
        <div className="flex gap-1 px-2 py-1 items-center bg-[#1a1a1a] border-b border-[#2a2a2a] overflow-x-auto shrink-0">
          {KEY_SEQUENCES.map(k => (
            <button
              key={k.label}
              onPointerDown={e => {
                e.preventDefault()
                if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(k.seq)
              }}
              className="px-3 py-1.5 rounded text-xs font-mono bg-[#2a2a2a] text-[#e5e7eb] active:bg-[#3b82f6] select-none whitespace-nowrap shrink-0"
            >
              {k.label}
            </button>
          ))}
          {/* divider */}
          <div className="w-px h-5 bg-[#3a3a3a] shrink-0 mx-1" />
          {/* scroll/select mode toggle */}
          <button
            onPointerDown={e => {
              e.preventDefault()
              setTouchMode(m => m === 'scroll' ? 'select' : 'scroll')
            }}
            title={touchMode === 'scroll' ? 'Switch to select mode' : 'Switch to scroll mode'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono select-none whitespace-nowrap shrink-0 transition-colors ${
              touchMode === 'select'
                ? 'bg-[#3b82f6] text-white'
                : 'bg-[#2a2a2a] text-[#9ca3af]'
            }`}
          >
            {touchMode === 'scroll'
              ? <><MoveVertical size={11} /> Scroll</>
              : <><MousePointer size={11} /> Select</>
            }
          </button>
          {/* copy button */}
          <button
            onPointerDown={e => { e.preventDefault(); void copySelection() }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono select-none whitespace-nowrap shrink-0 transition-colors ${
              copyFeedback
                ? 'bg-[#10b981] text-white'
                : 'bg-[#2a2a2a] text-[#e5e7eb] active:bg-[#10b981]'
            }`}
          >
            <Clipboard size={11} />
            {copyFeedback ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
      <div ref={termContainerRef} className="flex-1 overflow-hidden" />
      {showSessionOverlay && (
        <div
          className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center"
          onClick={() => setShowSessionOverlay(false)}
        >
          <div onClick={e => e.stopPropagation()}>
            <SessionManager
              onOpen={session => { setShowSessionOverlay(false); handleSessionOpen(session) }}
              onNew={name => { setPendingName(name); setShowSessionOverlay(false); setStep('workspace') }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
