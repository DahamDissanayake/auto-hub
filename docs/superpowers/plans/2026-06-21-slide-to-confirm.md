# Slide-to-Confirm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a slide-to-confirm gesture to the two destructive buttons in the terminal app (session delete in SessionManager, tab close in SessionTabs) to prevent accidental deletions.

**Architecture:** A single shared `SlideToConfirm` component manages idle/armed/confirmed state via pointer events. It replaces the existing trash and X buttons in-place; clicking arms it, a full-width drag confirms, early release or outside click resets. Existing tests are shielded by a vi.mock of the component.

**Tech Stack:** Next.js 14, React 18, TypeScript, Vitest + @testing-library/react, Tailwind CSS, lucide-react.

## Global Constraints

- No new npm packages — React built-ins (`useState`, `useRef`, `useEffect`, `useCallback`) and pointer events only.
- `'use client'` at the top of `SlideToConfirm.tsx`.
- All colours from the existing dark theme: `#0d0d0d`, `#1a1a1a`, `#2a2a2a`, `#ef4444`, `#dc2626`, `#10b981`, `#6b7280`.
- Track width: `140px`. Thumb width: `28px`. Track height: `24px`. Confirm threshold: `>= 95%`.
- Auto-reset timer: `4000ms`.
- Label text format: `"slide to {label} →"` (UTF-8 →, not HTML entity).
- TypeScript — no `any`.
- Tests use Vitest + `@testing-library/react`. Follow existing test file patterns in `frontend/src/app/(app)/terminal/components/`.

---

### Task 1: `SlideToConfirm` component — tests + implementation

**Files:**
- Create: `frontend/src/app/(app)/terminal/components/SlideToConfirm.tsx`
- Create: `frontend/src/app/(app)/terminal/components/SlideToConfirm.test.tsx`

**Interfaces:**
- Produces:
  ```tsx
  interface SlideToConfirmProps {
    onConfirm: () => void
    label: string                  // e.g. "end", "close" → "slide to end →"
    triggerAriaLabel: string       // e.g. "End session alpha"
    triggerContent: React.ReactNode // e.g. <Trash2 size={13} />
    triggerClassName: string       // existing button class passthrough
  }
  export function SlideToConfirm(props: SlideToConfirmProps): JSX.Element
  ```

- [ ] **Step 1: Write `SlideToConfirm.test.tsx` — all failing tests**

Create `frontend/src/app/(app)/terminal/components/SlideToConfirm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Trash2 } from 'lucide-react'
import { SlideToConfirm } from './SlideToConfirm'

const defaultProps = {
  onConfirm: vi.fn(),
  label: 'end',
  triggerAriaLabel: 'End session',
  triggerContent: <Trash2 size={13} />,
  triggerClassName: 'p-1 text-[#6b7280]',
}

describe('SlideToConfirm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the trigger button in idle state', () => {
    render(<SlideToConfirm {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'End session' })).toBeInTheDocument()
    expect(screen.queryByText(/slide to/i)).not.toBeInTheDocument()
  })

  it('shows the slide track when trigger is clicked', () => {
    render(<SlideToConfirm {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))
    expect(screen.getByText('slide to end →')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'End session' })).not.toBeInTheDocument()
  })

  it('resets to idle when clicked outside the track', () => {
    render(
      <div>
        <SlideToConfirm {...defaultProps} />
        <button>outside</button>
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))
    expect(screen.getByText('slide to end →')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByText(/slide to/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'End session' })).toBeInTheDocument()
  })

  it('auto-resets after 4 seconds without interaction', () => {
    vi.useFakeTimers()
    render(<SlideToConfirm {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))
    expect(screen.getByText('slide to end →')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(4000) })
    expect(screen.queryByText(/slide to/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'End session' })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('calls onConfirm and resets when dragged to full width', () => {
    render(<SlideToConfirm {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))

    const thumb = screen.getByRole('slider')
    const track = thumb.parentElement!

    // Simulate drag: pointerdown on thumb, pointermove to full width, pointerup
    Object.defineProperty(track, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 140 }),
      configurable: true,
    })

    fireEvent.pointerDown(thumb, { clientX: 14 })
    fireEvent.pointerMove(track, { clientX: 140 })
    fireEvent.pointerUp(track, { clientX: 140 })

    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('does not call onConfirm and resets when released early (< 95%)', () => {
    render(<SlideToConfirm {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))

    const thumb = screen.getByRole('slider')
    const track = thumb.parentElement!

    Object.defineProperty(track, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 140 }),
      configurable: true,
    })

    fireEvent.pointerDown(thumb, { clientX: 14 })
    fireEvent.pointerMove(track, { clientX: 80 })
    fireEvent.pointerUp(track, { clientX: 80 })

    expect(defaultProps.onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'End session' })).toBeInTheDocument()
  })

  it('stopPropagation prevents parent click when track is visible', () => {
    const parentClick = vi.fn()
    render(
      <div onClick={parentClick}>
        <SlideToConfirm {...defaultProps} />
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))
    // Clicking anywhere on the track area should not bubble to parent
    fireEvent.click(screen.getByText('slide to end →'))
    expect(parentClick).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /workspace/auto-hub/frontend && npx vitest run src/app/\(app\)/terminal/components/SlideToConfirm.test.tsx 2>&1 | tail -5
```
Expected: `Cannot find module './SlideToConfirm'`

- [ ] **Step 3: Implement `SlideToConfirm.tsx`**

Create `frontend/src/app/(app)/terminal/components/SlideToConfirm.tsx`:

```tsx
'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

interface SlideToConfirmProps {
  onConfirm: () => void
  label: string
  triggerAriaLabel: string
  triggerContent: React.ReactNode
  triggerClassName: string
}

export function SlideToConfirm({
  onConfirm,
  label,
  triggerAriaLabel,
  triggerContent,
  triggerClassName,
}: SlideToConfirmProps) {
  const [armed, setArmed] = useState(false)
  const [dragPct, setDragPct] = useState(0)
  const [confirmed, setConfirmed] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const startClientXRef = useRef(0)
  const startThumbXRef = useRef(0)

  const TRACK_W = 140
  const THUMB_W = 28
  const MAX_DRAG = TRACK_W - THUMB_W - 4 // 4px padding (2px each side)

  const disarm = useCallback(() => {
    setArmed(false)
    setDragPct(0)
    setConfirmed(false)
    draggingRef.current = false
  }, [])

  // Outside-click reset
  useEffect(() => {
    if (!armed) return
    const handler = (e: MouseEvent) => {
      if (trackRef.current && !trackRef.current.contains(e.target as Node)) {
        disarm()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [armed, disarm])

  // Auto-reset after 4 seconds
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(disarm, 4000)
    return () => clearTimeout(timer)
  }, [armed, disarm])

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    draggingRef.current = true
    startClientXRef.current = e.clientX
    startThumbXRef.current = dragPct * MAX_DRAG
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (!draggingRef.current) return
    const delta = e.clientX - startClientXRef.current
    const rawX = startThumbXRef.current + delta
    const clampedX = Math.max(0, Math.min(MAX_DRAG, rawX))
    setDragPct(clampedX / MAX_DRAG)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (!draggingRef.current) return
    draggingRef.current = false
    if (dragPct >= 0.95) {
      setConfirmed(true)
      setTimeout(() => {
        disarm()
        onConfirm()
      }, 150)
    } else {
      disarm()
    }
  }

  const thumbX = Math.round(dragPct * MAX_DRAG)
  const thumbColor = confirmed
    ? 'bg-[#10b981]'
    : dragPct >= 0.7
    ? 'bg-[#dc2626]'
    : 'bg-[#ef4444]'

  if (!armed) {
    return (
      <button
        aria-label={triggerAriaLabel}
        onClick={e => { e.stopPropagation(); setArmed(true) }}
        className={triggerClassName}
      >
        {triggerContent}
      </button>
    )
  }

  return (
    <div
      ref={trackRef}
      onClick={e => e.stopPropagation()}
      style={{ width: TRACK_W }}
      className="relative h-6 rounded-full bg-[#2a2a2a] flex items-center shrink-0"
    >
      <span className="absolute inset-0 flex items-center justify-center text-[10px] text-[#6b7280] pointer-events-none select-none">
        slide to {label} →
      </span>
      <div
        role="slider"
        aria-label={`Slide to confirm ${label}`}
        aria-valuenow={Math.round(dragPct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ transform: `translateX(${thumbX}px)` }}
        className={`absolute left-[2px] top-[2px] w-7 h-5 rounded-full cursor-grab active:cursor-grabbing ${thumbColor} transition-colors duration-100 touch-none`}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /workspace/auto-hub/frontend && npx vitest run src/app/\(app\)/terminal/components/SlideToConfirm.test.tsx 2>&1 | tail -8
```
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
cd /workspace/auto-hub && git add "frontend/src/app/(app)/terminal/components/SlideToConfirm.tsx" "frontend/src/app/(app)/terminal/components/SlideToConfirm.test.tsx"
git commit -m "feat(frontend): add SlideToConfirm component for destructive actions"
```

---

### Task 2: Wire `SlideToConfirm` into `SessionManager` and `SessionTabs`

**Files:**
- Modify: `frontend/src/app/(app)/terminal/components/SessionManager.tsx`
- Modify: `frontend/src/app/(app)/terminal/components/SessionManager.test.tsx`
- Modify: `frontend/src/app/(app)/terminal/components/SessionTabs.tsx`
- Modify: `frontend/src/app/(app)/terminal/components/SessionTabs.test.tsx`

**Interfaces:**
- Consumes: `SlideToConfirm` from Task 1 — exact import: `import { SlideToConfirm } from './SlideToConfirm'`

- [ ] **Step 1: Add `SlideToConfirm` mock to `SessionManager.test.tsx`**

In `frontend/src/app/(app)/terminal/components/SessionManager.test.tsx`, add after the existing `vi.mock('@/lib/hooks/useClaudeProfiles', ...)` block:

```typescript
vi.mock('./SlideToConfirm', () => ({
  SlideToConfirm: ({ onConfirm, triggerAriaLabel }: { onConfirm: () => void; triggerAriaLabel: string }) => (
    <button aria-label={triggerAriaLabel} onClick={onConfirm} />
  ),
}))
```

- [ ] **Step 2: Run SessionManager tests — confirm they still pass**

```bash
cd /workspace/auto-hub/frontend && npx vitest run src/app/\(app\)/terminal/components/SessionManager.test.tsx 2>&1 | tail -5
```
Expected: all tests pass (the mock renders a plain button so existing tests still call `api.delete`)

- [ ] **Step 3: Update `SessionManager.tsx`**

Add `SlideToConfirm` import after the existing imports. In `SessionManager.tsx`, change the import line from:

```tsx
import { Plus, Circle, Trash2 } from 'lucide-react'
```

To:

```tsx
import { Plus, Circle, Trash2 } from 'lucide-react'
import { SlideToConfirm } from './SlideToConfirm'
```

Replace the trash `<button>` inside the `sessions.map` (currently lines ~111–117):

```tsx
              <button
                onClick={() => handleEnd(s.name)}
                aria-label={`End ${s.name}`}
                className="p-1 rounded text-[#6b7280] hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors"
              >
                <Trash2 size={13} />
              </button>
```

With:

```tsx
              <SlideToConfirm
                onConfirm={() => handleEnd(s.name)}
                label="end"
                triggerAriaLabel={`End ${s.name}`}
                triggerContent={<Trash2 size={13} />}
                triggerClassName="p-1 rounded text-[#6b7280] hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors"
              />
```

- [ ] **Step 4: Add `SlideToConfirm` mock to `SessionTabs.test.tsx`**

In `frontend/src/app/(app)/terminal/components/SessionTabs.test.tsx`, add after the existing imports:

```typescript
import { vi } from 'vitest'

vi.mock('./SlideToConfirm', () => ({
  SlideToConfirm: ({ onConfirm, triggerAriaLabel }: { onConfirm: () => void; triggerAriaLabel: string }) => (
    <button aria-label={triggerAriaLabel} onClick={e => { e.stopPropagation(); onConfirm() }} />
  ),
}))
```

Note: `vi` is already imported in the existing file — do not duplicate the import. Only add the `vi.mock(...)` call.

- [ ] **Step 5: Run SessionTabs tests — confirm they still pass**

```bash
cd /workspace/auto-hub/frontend && npx vitest run src/app/\(app\)/terminal/components/SessionTabs.test.tsx 2>&1 | tail -5
```
Expected: all tests pass (the `Close alpha` aria-label still works via the mock)

- [ ] **Step 6: Update `SessionTabs.tsx`**

Add `SlideToConfirm` import after the existing import:

```tsx
import { SlideToConfirm } from './SlideToConfirm'
```

Remove `X` from the lucide-react import (it is only used by the button being replaced). Change:

```tsx
import { Plus, X } from 'lucide-react'
```

To:

```tsx
import { Plus, X } from 'lucide-react'
import { SlideToConfirm } from './SlideToConfirm'
```

Wait — keep `X` for now; remove it only if TypeScript complains (it may be needed elsewhere). Replace the close `<button>` inside the `tabs.map`:

```tsx
          <button
            onClick={e => { e.stopPropagation(); onEnd(tab.name) }}
            aria-label={`Close ${tab.name}`}
            className="text-[#4b5563] hover:text-[#ef4444] active:text-[#ef4444] transition-colors ml-0.5 p-1 -mr-1"
          >
            <X size={13} />
          </button>
```

With:

```tsx
          <SlideToConfirm
            onConfirm={() => onEnd(tab.name)}
            label="close"
            triggerAriaLabel={`Close ${tab.name}`}
            triggerContent={<X size={13} />}
            triggerClassName="text-[#4b5563] hover:text-[#ef4444] active:text-[#ef4444] transition-colors ml-0.5 p-1 -mr-1"
          />
```

- [ ] **Step 7: Run all frontend tests**

```bash
cd /workspace/auto-hub/frontend && npx vitest run 2>&1 | tail -10
```
Expected: all 103 + new SlideToConfirm tests pass

- [ ] **Step 8: TypeScript check**

```bash
cd /workspace/auto-hub/frontend && npx tsc --noEmit 2>&1 | grep -E "SlideToConfirm|SessionManager|SessionTabs" | head -10
```
Expected: no output (no new errors). If `X` is flagged as unused, remove it from the lucide-react import in `SessionTabs.tsx`.

- [ ] **Step 9: Commit**

```bash
cd /workspace/auto-hub && git add "frontend/src/app/(app)/terminal/components/SessionManager.tsx" "frontend/src/app/(app)/terminal/components/SessionManager.test.tsx" "frontend/src/app/(app)/terminal/components/SessionTabs.tsx" "frontend/src/app/(app)/terminal/components/SessionTabs.test.tsx"
git commit -m "feat(frontend): wire SlideToConfirm into SessionManager and SessionTabs"
```
