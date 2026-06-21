'use client'
import { useEffect, useRef } from 'react'
import type { Terminal } from '@xterm/xterm'

interface TerminalCellProps {
  sessionName: string
  fontSize?: number
}

export function TerminalCell({ sessionName, fontSize = 10 }: TerminalCellProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)

  useEffect(() => {
    if (!sessionName || !containerRef.current) return
    let destroyed = false
    let cleanup: (() => void) | undefined

    const init = async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ])
      if (destroyed || !containerRef.current) return

      const term = new Terminal({
        fontSize,
        fontFamily: 'Menlo, "DejaVu Sans Mono", "Cascadia Code", monospace',
        theme: { background: '#0d0d0d', foreground: '#e5e7eb', cursor: '#3b82f6' },
        cursorBlink: false,
        scrollback: 500,
      })
      termRef.current = term

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(containerRef.current)
      fitAddon.fit()

      const el = containerRef.current!
      const token = sessionStorage.getItem('autohub_token') ?? ''
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(
        `${proto}//${window.location.host}/terminal-ws/?session=${encodeURIComponent(sessionName)}&token=${encodeURIComponent(token)}`
      )

      ws.onmessage = e => term.write(e.data as string)
      term.onData(data => { if (ws.readyState === WebSocket.OPEN) ws.send(data) })

      const fit = () => {
        fitAddon.fit()
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        }
      }
      ws.onopen = () => fit()

      const ro = new ResizeObserver(fit)
      ro.observe(containerRef.current!)

      const onWheel = (e: WheelEvent) => { e.preventDefault() }
      el.addEventListener('wheel', onWheel, { passive: false, capture: true })

      let touchY = 0
      const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0].clientY }
      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault()
        const dy = touchY - e.touches[0].clientY
        touchY = e.touches[0].clientY
        const vp = el.querySelector('.xterm-viewport')
        if (vp) vp.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, deltaMode: 0, bubbles: true }))
      }
      el.addEventListener('touchstart', onTouchStart, { passive: true })
      el.addEventListener('touchmove', onTouchMove, { passive: false })

      cleanup = () => {
        ro.disconnect()
        el.removeEventListener('wheel', onWheel, { capture: true })
        el.removeEventListener('touchstart', onTouchStart)
        el.removeEventListener('touchmove', onTouchMove)
        ws.close()
        term.dispose()
        termRef.current = null
      }
    }

    void init()
    return () => {
      destroyed = true
      cleanup?.()
    }
  }, [sessionName, fontSize])

  return <div ref={containerRef} className="w-full h-full overflow-hidden" />
}
