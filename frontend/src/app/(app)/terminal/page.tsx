'use client'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState } from 'react'
import { WorkspacePicker } from './components/WorkspacePicker'
import { RepoPicker } from './components/RepoPicker'
import { CloneDialog } from './components/CloneDialog'
import { TerminalBreadcrumb } from './components/TerminalBreadcrumb'

interface Repo {
  name: string
  path: string
  isGitRepo: boolean
}

type Step = 'workspace' | 'repo' | 'clone' | 'terminal'

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
  const [step, setStep] = useState<Step>('workspace')
  const [workspace, setWorkspace] = useState<'home' | 'github' | null>(null)
  const [repoName, setRepoName] = useState<string | null>(null)
  const [cwd, setCwd] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const termContainerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    setIsMobile(window.innerWidth < 768 || navigator.maxTouchPoints > 0)
  }, [])

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
        theme: { background: '#0d0d0d', foreground: '#e5e7eb', cursor: '#3b82f6' },
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

  const handleWorkspaceSelect = (ws: 'home' | 'github') => {
    setWorkspace(ws)
    if (ws === 'home') {
      setRepoName(null)
      setCwd('/workspace/claude-home')
      setStep('terminal')
    } else {
      setStep('repo')
    }
  }

  const handleRepoSelect = (repo: Repo) => {
    setRepoName(repo.name)
    setCwd(repo.path)
    setStep('terminal')
  }

  const handleCloneSuccess = (repoPath: string, name: string) => {
    setRepoName(name)
    setCwd(repoPath)
    setStep('terminal')
  }

  const handleChangeDir = () => {
    setCwd(null)
    setWorkspace(null)
    setRepoName(null)
    setError(null)
    setSessionEnded(false)
    setStep('workspace')
  }

  const reconnect = () => {
    const saved = cwd
    setSessionEnded(false)
    setError(null)
    setCwd(null)
    requestAnimationFrame(() => setCwd(saved))
  }

  if (step === 'workspace') return <WorkspacePicker onSelect={handleWorkspaceSelect} />
  if (step === 'repo') return <RepoPicker onSelect={handleRepoSelect} onClone={() => setStep('clone')} onBack={() => setStep('workspace')} />
  if (step === 'clone') return <CloneDialog onSuccess={handleCloneSuccess} onBack={() => setStep('repo')} />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-[#ef4444] text-sm text-center">{error}</p>
        <button
          onClick={handleChangeDir}
          className="px-4 py-2 text-xs bg-[#2a2a2a] text-[#e5e7eb] rounded hover:bg-[#3a3a3a] transition-colors"
        >
          Change Directory
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
            Change Directory
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="-mx-6 -mt-6 -mb-20 md:-mb-6 flex flex-col" style={{ height: '100dvh' }}>
      <TerminalBreadcrumb workspace={workspace!} repoName={repoName} onChangeDir={handleChangeDir} />
      {isMobile && (
        <div className="h-10 flex gap-1 px-2 items-center bg-[#1a1a1a] border-b border-[#2a2a2a] overflow-x-auto shrink-0">
          {KEY_SEQUENCES.map(k => (
            <button
              key={k.label}
              onPointerDown={e => {
                e.preventDefault()
                if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(k.seq)
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
