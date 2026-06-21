# Slide-to-Confirm for Terminal Destructive Actions

**Date:** 2026-06-21
**Scope:** Add a slide-to-confirm gesture to all destructive buttons in the terminal app to prevent accidental session deletion.

---

## Problem

The terminal app has two buttons that immediately destroy state with a single click:

1. **Trash icon** in `SessionManager` — permanently deletes a session
2. **X button** in `SessionTabs` — closes the active session tab

Both fire instantly on any accidental tap, with no undo.

---

## Solution

A shared `SlideToConfirm` React component replaces both destructive buttons. Clicking the trigger arms it, revealing an inline slide track the user must drag fully right to confirm. Any early release, outside click, or 4-second timeout resets it to idle.

---

## Component API

```tsx
<SlideToConfirm
  onConfirm={() => handleEnd(s.name)}
  label="end"                        // renders "slide to end →"
  triggerAriaLabel="End session"
  triggerContent={<Trash2 size={13} />}
  triggerClassName="..."             // existing button class passthrough
/>
```

**Props:**
| Prop | Type | Description |
|---|---|---|
| `onConfirm` | `() => void` | Called when thumb reaches 100% |
| `label` | `string` | Fills "slide to {label} →" |
| `triggerAriaLabel` | `string` | aria-label for the idle trigger button |
| `triggerContent` | `ReactNode` | Icon/content inside the trigger |
| `triggerClassName` | `string` | Class string passed to the trigger button |

---

## Behaviour

### States
- **Idle** — renders the trigger button identically to the current button.
- **Armed** — trigger replaced in-place by the slide track.

### Transitions
- **Idle → Armed:** click the trigger button.
- **Armed → Idle (cancel):** drag released before 100%, click outside the track, or 4-second auto-reset timer fires.
- **Armed → Confirmed:** drag reaches 100%; `onConfirm()` fires, brief green flash, then resets to idle.

### Drag mechanics
- `onPointerDown` on the thumb → capture pointer, track `pointermove` for drag position.
- `onPointerUp` → if `dragX >= 95%` confirm, else reset.
- Drag is clamped to `[0, trackWidth - thumbWidth]`.
- `stopPropagation` on all track events (prevents tab-switch in `SessionTabs`).

### Auto-reset
- `useEffect` starts a 4-second `setTimeout` when armed; clears on disarm or unmount.

### Outside-click reset
- `useEffect` adds a `mousedown` listener on `document` when armed; clears when disarmed.
- Checks if click target is outside the component's root `ref`.

---

## Visual Design

All colours from the existing dark theme.

### Idle
Identical to the current button — no visual change.

### Armed (slide track)
| Element | Style |
|---|---|
| Track container | `bg-[#2a2a2a]` rounded-full, `w-[140px] h-[24px]` |
| Track label | `"slide to {label} →"` `text-[#6b7280] text-[10px]` centered, fade-in |
| Thumb | `bg-[#ef4444]` rounded-full `w-[28px] h-[20px]`, positioned `absolute left-[2px]` |
| Thumb at ≥70% | `bg-[#dc2626]` (brighter red) |
| Confirmed flash | `bg-[#10b981]` for 150ms, then reset |

Transitions:
- Track width: `transition-all duration-150` (idle→armed expand)
- Thumb position: CSS `transform: translateX()` driven by pointer position, no transition during drag (feels direct)

### In SessionManager rows
The trash button area expands right to 140px. Row height unchanged.

### In SessionTabs
The X button area expands the tab to accommodate the track. Tab bar already uses `overflow-x-auto` so adjacent tabs compress naturally.

---

## Architecture

### New files
- `frontend/src/app/(app)/terminal/components/SlideToConfirm.tsx`
- `frontend/src/app/(app)/terminal/components/SlideToConfirm.test.tsx`

### Modified files
- `frontend/src/app/(app)/terminal/components/SessionManager.tsx` — replace trash `<button>` with `<SlideToConfirm>`
- `frontend/src/app/(app)/terminal/components/SessionManager.test.tsx` — add `vi.mock('./SlideToConfirm')`
- `frontend/src/app/(app)/terminal/components/SessionTabs.tsx` — replace X `<button>` with `<SlideToConfirm>`
- `frontend/src/app/(app)/terminal/components/SessionTabs.test.tsx` — add `vi.mock('./SlideToConfirm')`

### Mock shape (for existing tests)
```tsx
vi.mock('./SlideToConfirm', () => ({
  SlideToConfirm: ({ onConfirm, triggerAriaLabel }: { onConfirm: () => void; triggerAriaLabel: string }) => (
    <button aria-label={triggerAriaLabel} onClick={onConfirm} />
  ),
}))
```

---

## Test Coverage (`SlideToConfirm.test.tsx`)

| Test | What it verifies |
|---|---|
| Renders trigger in idle state | `triggerContent` visible, track not visible |
| Arms on trigger click | Track appears, trigger disappears |
| Calls `onConfirm` when dragged to 100% | Simulate `pointerdown` → `pointermove` to full width → `pointerup` |
| Resets on early release (< 95%) | No `onConfirm`, track disappears |
| Resets on outside click | `mousedown` outside → back to idle |
| Auto-resets after 4 seconds | `vi.useFakeTimers()`, advance 4000ms, track disappears |
| `stopPropagation` on track events | Parent click handler not called when interacting with track |

---

## Global Constraints

- No new npm packages — pointer events, `useRef`, `useEffect`, `useState` only.
- `'use client'` at top of `SlideToConfirm.tsx`.
- Follows existing dark theme colours exactly.
- TypeScript — no `any`.
- Tests use Vitest + `@testing-library/react`.
