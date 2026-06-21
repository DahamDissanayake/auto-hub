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
import { GridView } from './components/GridView'
import { Clipboard, ClipboardPaste, MousePointer, MoveVertical } from 'lucide-react'

interface Repo {
  name: string
  path: string
  isGitRepo: boolean
}

type Step = 'loading' | 'session' | 'workspace' | 'repo' | 'clone' | 'terminal'

const LAST_SESSION_KEY = 'autohub_last_terminal_session'
type Workspace = 'home' | 'github' | 'auto-hub'
type PasteFeedback = 'idle' | 'ok' | 'denied'

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

// Hide xterm's native scrollbar — we render a custom React scrollbar instead,
// which is always visible regardless of OS overlay-scrollbar settings.
const HIDE_NATIVE_SCROLLBAR_CSS = `
  .xterm .xterm-viewport { overflow-y: scroll !important; scrollbar-width: none; }
  .xterm .xterm-viewport::-webkit-scrollbar { display: none; width: 0; }
`

export default function TerminalPage() {
  const [step, setStep] = useState<Step>('loading')
  const [sessionName, setSessionName] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [repoName, setRepoName] = useState<string | null>(null)
  const [pendingName, setPendingName] = useState<string | null>(null)
  const [openTabs, setOpenTabs] = useState<TabSession[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showSessionOverlay, setShowSessionOverlay] = useState(false)
  const [touchMode, setTouchMode] = useState<'scroll' | 'select'>('scroll')
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [pasteFeedback, setPasteFeedback] = useState<PasteFeedback>('idle')
  const [gridView, setGridView] = useState(false)

  // Custom scrollbar state: shown only when xterm has its own scrollback (non-tmux mode)
  const [sbVisible, setSbVisible] = useState(false)
  const [sbThumb, setSbThumb] = useState({ top: 0, height: 0 })

  const termContainerRef = useRef<HTMLDivElement>(null)
  const scrollbarTrackRef = useRef<HTMLDivElement>(null)
  const sbDragRef = useRef({ active: false, startY: 0, startST: 0 })
  const wsRef = useRef<WebSocket | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const touchModeRef = useRef<'scroll' | 'select'>('scroll')

  useEffect(() => { touchModeRef.current = touchMode }, [touchMode])

  useEffect(() => {
    setIsMobile(window.innerWidth < 768 || navigator.maxTouchPoints > 0)
  }, [])

  // On mount: fetch all existing sessions, pre-populate tabs, restore last active
  useEffect(() => {
    const init = async () => {
      try {
        const res = await api.get<Session[]>('/api/terminal/sessions')
        const sessions = res.data
        if (sessions.length === 0) { setStep('session'); return }
        const tabs: TabSession[] = sessions.map(s => ({
          name: s.name, workspace: s.workspace, repoName: s.repoName,
        }))
        setOpenTabs(tabs)
        const lastName = localStorage.getItem(LAST_SESSION_KEY)
        const target = sessions.find(s => s.name === lastName) ?? sessions[sessions.length - 1]
        setWorkspace(target.workspace)
        setRepoName(target.repoName)
        setSessionName(target.name)
        setStep('terminal')
      } catch {
        setStep('session')
      }
    }
    void init()
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
        fontSize: isMobile ? 15 : 13,
        fontFamily: 'Menlo, "DejaVu Sans Mono", "Cascadia Code", monospace',
        theme: { background: '#0d0d0d', foreground: '#e5e7eb', cursor: '#3b82f6' },
        cursorBlink: true,
        scrollback: 5000,
        scrollOnUserInput: true,
      })

      termRef.current = term

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(termContainerRef.current)
      fitAddon.fit()

      const el = termContainerRef.current!

      // Scrollbar is only meaningful when xterm has its own scrollback (non-tmux sessions).
      // In tmux mode the alternate screen always gives buf.length === t.rows (no scrollback).
      const updateScrollbar = () => {
        const t = termRef.current
        if (!t) return
        const buf = t.buffer.active
        const totalLines = buf.length
        const viewRows = t.rows
        if (totalLines <= viewRows) {
          setSbVisible(false)
          return
        }
        setSbVisible(true)
        const track = scrollbarTrackRef.current
        if (!track || track.clientHeight === 0) return
        const trackH = track.clientHeight
        const maxY = totalLines - viewRows
        const thumbH = Math.max(40, (viewRows / totalLines) * trackH)
        const thumbT = maxY > 0 ? (buf.viewportY / maxY) * (trackH - thumbH) : 0
        setSbThumb({ top: Math.max(0, thumbT), height: thumbH })
      }

      // term.onScroll fires whenever xterm changes ydisp (any scroll path).
      const scrollDisp = term.onScroll(() => requestAnimationFrame(updateScrollbar))

      const token = sessionStorage.getItem('autohub_token') ?? ''
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(
        `${proto}//${window.location.host}/terminal-ws/?session=${encodeURIComponent(sessionName)}&token=${encodeURIComponent(token)}`
      )
      wsRef.current = ws

      // After each data chunk, update the thumb — scrollback grows with new output.
      ws.onmessage = e => {
        term.write(e.data as string)
        requestAnimationFrame(updateScrollbar)
      }
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
        updateScrollbar()
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        }
      }

      ws.onopen = () => {
        fit()
        setTimeout(updateScrollbar, 200)
      }

      const ro = new ResizeObserver(fit)
      ro.observe(termContainerRef.current!)
      window.visualViewport?.addEventListener('resize', fit)

      // Wheel: prevent browser page scroll; let xterm handle the event natively.
      // With tmux `mouse on`, tmux sends \x1b[?1000h putting xterm in mouse-tracking mode.
      // xterm then encodes wheel events as PTY mouse sequences (\x1b[<64/65;X;YM) which
      // tmux receives and uses to scroll its own copy-mode buffer — no scrollLines() needed.
      const onWheel = (e: WheelEvent) => { e.preventDefault() }
      el.addEventListener('wheel', onWheel, { passive: false, capture: true })

      // Touch (Scroll mode): synthesize WheelEvents on the xterm viewport so xterm forwards
      // them to the PTY as mouse sequences the same way real wheel events are handled.
      // Firing one event per TOUCH_PX_PER_WHEEL pixels gives natural speed control.
      const TOUCH_PX_PER_WHEEL = 20
      let touchY = 0
      let touchAccum = 0
      const onTouchStart = (e: TouchEvent) => {
        if (touchModeRef.current === 'scroll') {
          touchY = e.touches[0].clientY
          touchAccum = 0
        }
      }
      const onTouchMove = (e: TouchEvent) => {
        if (touchModeRef.current !== 'scroll') return
        e.preventDefault()
        const dy = touchY - e.touches[0].clientY   // positive = swipe up = scroll to older
        touchY = e.touches[0].clientY
        touchAccum += dy
        const vp = el.querySelector('.xterm-viewport')
        if (!vp) return
        while (Math.abs(touchAccum) >= TOUCH_PX_PER_WHEEL) {
          const dir = touchAccum > 0 ? 1 : -1
          vp.dispatchEvent(new WheelEvent('wheel', { deltaY: dir * TOUCH_PX_PER_WHEEL, deltaMode: 0, bubbles: true }))
          touchAccum -= dir * TOUCH_PX_PER_WHEEL
        }
      }
      el.addEventListener('touchstart', onTouchStart, { passive: true })
      el.addEventListener('touchmove', onTouchMove, { passive: false })

      // tmux 'mouse on' puts xterm into mouse-tracking mode, which forwards every
      // mouse event to the PTY instead of building a text selection. xterm.js v6
      // honours Shift to bypass mouse tracking for selection. We intercept drag
      // gestures (mousedown + move > threshold) and re-dispatch with shiftKey=true
      // so selection works naturally. Single clicks pass through unchanged so tmux
      // still receives cursor-positioning events.
      const DRAG_PX = 4
      let mdX = 0, mdY = 0, mdTarget: EventTarget | null = null
      let dragSelecting = false
      let reinjecting = false

      const shiftClone = (type: string, src: MouseEvent, extra: Partial<MouseEventInit> = {}) =>
        new MouseEvent(type, {
          bubbles: true, cancelable: true, view: window,
          clientX: src.clientX, clientY: src.clientY,
          screenX: src.screenX, screenY: src.screenY,
          ctrlKey: src.ctrlKey, altKey: src.altKey, metaKey: src.metaKey,
          shiftKey: true, button: src.button, buttons: src.buttons,
          ...extra,
        })

      const onCaptureMD = (e: MouseEvent) => {
        if (reinjecting || e.shiftKey || e.button !== 0) return
        mdX = e.clientX; mdY = e.clientY; mdTarget = e.target
        dragSelecting = false
      }

      const onCaptureMM = (e: MouseEvent) => {
        if (reinjecting || e.shiftKey || !(e.buttons & 1)) return
        if (!dragSelecting) {
          if (Math.abs(e.clientX - mdX) < DRAG_PX && Math.abs(e.clientY - mdY) < DRAG_PX) return
          dragSelecting = true
          // Retroactively anchor selection at the original click position
          e.stopPropagation(); e.preventDefault()
          reinjecting = true
          ;(mdTarget as Element | null)?.dispatchEvent(
            shiftClone('mousedown', e, { clientX: mdX, clientY: mdY, buttons: 1 })
          )
          reinjecting = false
        }
        e.stopPropagation(); e.preventDefault()
        reinjecting = true
        ;(e.target as Element).dispatchEvent(shiftClone('mousemove', e))
        reinjecting = false
      }

      const onCaptureMU = (e: MouseEvent) => {
        if (reinjecting || e.shiftKey || e.button !== 0 || !dragSelecting) return
        dragSelecting = false
        e.stopPropagation(); e.preventDefault()
        reinjecting = true
        ;(e.target as Element).dispatchEvent(shiftClone('mouseup', e))
        reinjecting = false
        // Copy immediately — term.write() from incoming PTY data clears selection within ms
        const sel = termRef.current?.getSelection()
        if (sel) navigator.clipboard.writeText(sel).catch(() => {})
      }

      el.addEventListener('mousedown', onCaptureMD, { capture: true })
      el.addEventListener('mousemove', onCaptureMM, { capture: true })
      el.addEventListener('mouseup', onCaptureMU, { capture: true })

      cleanup = () => {
        ro.disconnect()
        window.visualViewport?.removeEventListener('resize', fit)
        el.removeEventListener('wheel', onWheel, { capture: true })
        el.removeEventListener('touchstart', onTouchStart)
        el.removeEventListener('touchmove', onTouchMove)
        el.removeEventListener('mousedown', onCaptureMD, { capture: true })
        el.removeEventListener('mousemove', onCaptureMM, { capture: true })
        el.removeEventListener('mouseup', onCaptureMU, { capture: true })
        scrollDisp.dispose()
        ws.close()
        term.dispose()
        termRef.current = null
        setSbVisible(false)
        setSbThumb({ top: 0, height: 0 })
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

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(text)
        setPasteFeedback('ok')
        setTimeout(() => setPasteFeedback('idle'), 1200)
      }
    } catch {
      setPasteFeedback('denied')
      setTimeout(() => setPasteFeedback('idle'), 2500)
    }
  }, [])

  const copySelection = useCallback(async () => {
    const term = termRef.current
    if (!term) return
    const text = term.getSelection()
    if (!text) {
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

  // Custom scrollbar handlers — use xterm buffer API for metrics, term.scrollLines() for movement
  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (sbDragRef.current.active) return
    const t = termRef.current
    const track = scrollbarTrackRef.current
    if (!t || !track) return
    const buf = t.buffer.active
    const maxY = buf.length - t.rows
    if (maxY <= 0) return
    const rect = track.getBoundingClientRect()
    const ratio = (e.clientY - rect.top) / track.clientHeight
    const targetLine = Math.round(ratio * maxY)
    const delta = targetLine - buf.viewportY
    if (delta !== 0) t.scrollLines(delta)
  }, [])

  const handleThumbPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const t = termRef.current
    if (!t) return
    // startST = line index at drag start (0=top, maxY=bottom)
    sbDragRef.current = { active: true, startY: e.clientY, startST: t.buffer.active.viewportY }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleThumbPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!sbDragRef.current.active) return
    const t = termRef.current
    const track = scrollbarTrackRef.current
    if (!t || !track) return
    const buf = t.buffer.active
    const maxY = buf.length - t.rows
    if (maxY <= 0) return
    const trackH = track.clientHeight
    const thumbH = Math.max(40, (t.rows / buf.length) * trackH)
    const dy = e.clientY - sbDragRef.current.startY
    // Absolute target from drag start — no drift accumulation
    const targetLine = Math.max(0, Math.min(maxY,
      sbDragRef.current.startST + (dy / Math.max(1, trackH - thumbH)) * maxY
    ))
    const delta = Math.round(targetLine) - buf.viewportY
    if (delta !== 0) t.scrollLines(delta)
  }, [])

  const handleThumbPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    sbDragRef.current.active = false
    e.currentTarget.releasePointerCapture(e.pointerId)
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
    localStorage.setItem(LAST_SESSION_KEY, name)
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
    localStorage.setItem(LAST_SESSION_KEY, session.name)
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
    localStorage.setItem(LAST_SESSION_KEY, name)
  }

  const handleEndTab = async (name: string) => {
    try {
      await api.delete(`/api/terminal/sessions/${encodeURIComponent(name)}`)
    } catch { /* session may already be dead */ }
    const remaining = openTabs.filter(t => t.name !== name)
    setOpenTabs(remaining)
    if (sessionName === name) {
      if (remaining.length > 0) {
        const next = remaining[remaining.length - 1]
        setWorkspace(next.workspace)
        setRepoName(next.repoName)
        setError(null)
        setSessionEnded(false)
        setSessionName(null)
        localStorage.setItem(LAST_SESSION_KEY, next.name)
        requestAnimationFrame(() => setSessionName(next.name))
      } else {
        setSessionName(null)
        setStep('session')
        localStorage.removeItem(LAST_SESSION_KEY)
      }
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

  const handleExitGrid = (focusName?: string) => {
    setGridView(false)
    const target = focusName ?? sessionName
    const tab = openTabs.find(t => t.name === target)
    if (tab) {
      setSessionName(null)
      setWorkspace(tab.workspace)
      setRepoName(tab.repoName)
      setError(null)
      setSessionEnded(false)
      requestAnimationFrame(() => setSessionName(target))
    }
  }

  if (step === 'loading') return null

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

  const thumbStyle: React.CSSProperties = {
    top: sbThumb.top,
    height: sbThumb.height,
    minHeight: 40,
  }

  return (
    <>
      <style>{HIDE_NATIVE_SCROLLBAR_CSS}</style>

      <div
        className="-mx-4 -mt-4 -mb-4 md:-mx-6 md:-mt-6 md:-mb-6 flex flex-col"
        style={{ height: isMobile ? 'calc(100dvh - 3rem)' : '100dvh' }}
      >
        {gridView ? (
          <GridView
            tabs={openTabs}
            onBack={() => handleExitGrid()}
            onFocus={name => handleExitGrid(name)}
          />
        ) : (
        <>
        <SessionTabs
          tabs={openTabs}
          activeTab={sessionName ?? ''}
          onSwitch={handleSwitchTab}
          onEnd={name => { void handleEndTab(name) }}
          onNew={() => setShowSessionOverlay(true)}
          onGrid={() => setGridView(true)}
          gridActive={gridView}
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

            <div className="w-px h-5 bg-[#3a3a3a] shrink-0 mx-1" />

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

            <button
              onClick={() => { void copySelection() }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono select-none whitespace-nowrap shrink-0 transition-colors ${
                copyFeedback
                  ? 'bg-[#10b981] text-white'
                  : 'bg-[#2a2a2a] text-[#e5e7eb] active:bg-[#10b981]'
              }`}
            >
              <Clipboard size={11} />
              {copyFeedback ? 'Copied!' : 'Copy'}
            </button>

            <button
              onClick={() => { void pasteFromClipboard() }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono select-none whitespace-nowrap shrink-0 transition-colors ${
                pasteFeedback === 'ok'
                  ? 'bg-[#10b981] text-white'
                  : pasteFeedback === 'denied'
                    ? 'bg-[#b45309] text-white'
                    : 'bg-[#2a2a2a] text-[#e5e7eb] active:bg-[#3b82f6]'
              }`}
            >
              <ClipboardPaste size={11} />
              {pasteFeedback === 'ok'
                ? 'Pasted!'
                : pasteFeedback === 'denied'
                  ? 'Tap Allow ↑'
                  : 'Paste'}
            </button>
          </div>
        )}

        {/* Terminal + custom scrollbar side by side */}
        <div className="flex-1 flex overflow-hidden">
          <div ref={termContainerRef} className="flex-1 overflow-hidden min-w-0" />

          {/* Custom scrollbar — shown only when xterm has its own scrollback buffer
              (i.e. non-tmux sessions). In tmux mode the alternate screen provides no
              xterm scrollback, so the bar is hidden and tmux handles scrolling itself. */}
          {sbVisible && (
            <div
              ref={scrollbarTrackRef}
              className="w-3 shrink-0 bg-[#0d0d0d] border-l border-[#2a2a2a] relative overflow-hidden select-none cursor-pointer"
              onClick={handleTrackClick}
            >
              <div
                className="absolute left-0.5 right-0.5 rounded-sm bg-[#4b5563] hover:bg-[#6b7280] transition-colors"
                style={thumbStyle}
                onPointerDown={handleThumbPointerDown}
                onPointerMove={handleThumbPointerMove}
                onPointerUp={handleThumbPointerUp}
                onPointerCancel={handleThumbPointerUp}
                onClick={e => e.stopPropagation()}
              />
            </div>
          )}
        </div>

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
        </>
        )}
      </div>
    </>
  )
}
