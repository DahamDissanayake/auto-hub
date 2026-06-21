# Terminal MD File Browser — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating folder button to the terminal page that opens a file browser overlay starting from the session's working directory, and renders `.md` files as formatted Markdown in a full-screen viewer.

**Architecture:** Install `react-markdown` and `remark-gfm` for Markdown rendering. Create a self-contained `MdBrowserDrawer` component (browse view + viewer view in one component, internal state only). Modify `terminal/page.tsx` to add the floating button and mount the drawer. The existing `/files-api/ls` and `/files-api/download` nginx-proxied endpoints handle all file I/O — no backend changes needed.

**Tech Stack:** Next.js 14 (ESM config via `next.config.mjs`), React 18, TypeScript, Vitest + React Testing Library, react-markdown v9, remark-gfm v4, lucide-react (existing), `@/lib/filesApi` (existing)

## Global Constraints

- Test runner is **Vitest** — use `vi.mock`, `vi.fn()`, `vi.stubGlobal` — never Jest APIs
- `next.config.mjs` uses ESM (`export default`) — keep that format when editing it
- No new backend changes — use existing `/files-api/ls` and `/files-api/download`
- Dark-theme palette: background `#0d0d0d` / `#111` / `#1a1a1a`, text `#e5e7eb` / `#9ca3af` / `#d1d5db`
- No `@tailwindcss/typography` — all markdown styling via ReactMarkdown `components` prop
- Lucide-react icons only (already installed) — `FolderOpen`, `FileText`, `File`, `ChevronLeft`, `X`

---

### Task 1: Install react-markdown and remark-gfm

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/next.config.mjs`

**Interfaces:**
- Produces: `import ReactMarkdown from 'react-markdown'` and `import remarkGfm from 'remark-gfm'` work in frontend components

- [ ] **Step 1: Add packages to frontend/package.json**

In `frontend/package.json`, add to `"dependencies"`:
```json
"react-markdown": "^9.0.1",
"remark-gfm": "^4.0.0"
```

- [ ] **Step 2: Run npm install**

```bash
cd /workspace/auto-hub/frontend && npm install
```

Expected: resolves without peer-dependency errors, `react-markdown` and `remark-gfm` appear in `node_modules`.

- [ ] **Step 3: Add transpilePackages to next.config.mjs**

Open `frontend/next.config.mjs`. It currently looks like:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {},
}

export default nextConfig
```

Replace with:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {},
  transpilePackages: ['react-markdown', 'remark-gfm'],
}

export default nextConfig
```

- [ ] **Step 4: Verify TypeScript sees the new packages**

```bash
cd /workspace/auto-hub/frontend && npx tsc --noEmit 2>&1 | grep -i "react-markdown\|remark-gfm" | head -10
```

Expected: no output (no errors about those packages). Unrelated pre-existing type errors in other files are acceptable.

- [ ] **Step 5: Commit**

```bash
cd /workspace/auto-hub && git add frontend/package.json frontend/package-lock.json frontend/next.config.mjs && git commit -m "chore(terminal): add react-markdown and remark-gfm"
```

---

### Task 2: Create MdBrowserDrawer component

**Files:**
- Create: `frontend/src/app/(app)/terminal/components/MdBrowserDrawer.tsx`
- Create: `frontend/src/app/(app)/terminal/components/MdBrowserDrawer.test.tsx`

**Interfaces:**
- Consumes from `@/lib/filesApi`:
  - `apiLs(root: string, path: string): Promise<{ path: string; entries: DirEntry[] }>`
  - `DirEntry = { name: string; type: 'file' | 'dir'; size: number; modified: string }`
- Consumes: `fetch('/files-api/download?root=R&path=P&token=T')` → response with `.text()` method
- Consumes: `sessionStorage.getItem('autohub_token')` for the JWT
- Produces named export: `MdBrowserDrawer({ root: string; startPath: string; onClose: () => void }): JSX.Element`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/(app)/terminal/components/MdBrowserDrawer.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MdBrowserDrawer } from './MdBrowserDrawer'
import * as filesApi from '@/lib/filesApi'

vi.mock('@/lib/filesApi')
const mockApiLs = filesApi.apiLs as ReturnType<typeof vi.fn>

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockSessionStorage = { getItem: vi.fn().mockReturnValue('test-token') }
vi.stubGlobal('sessionStorage', mockSessionStorage)

const defaultProps = {
  root: 'workspace',
  startPath: 'auto-hub',
  onClose: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSessionStorage.getItem.mockReturnValue('test-token')
})

describe('MdBrowserDrawer', () => {
  it('shows directory entries from apiLs', async () => {
    mockApiLs.mockResolvedValue({
      path: 'auto-hub',
      entries: [
        { name: 'src', type: 'dir', size: 0, modified: '' },
        { name: 'README.md', type: 'file', size: 100, modified: '' },
        { name: 'package.json', type: 'file', size: 50, modified: '' },
      ],
    })
    render(<MdBrowserDrawer {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('src')).toBeInTheDocument())
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.getByText('package.json')).toBeInTheDocument()
  })

  it('calls apiLs with correct root and startPath on mount', async () => {
    mockApiLs.mockResolvedValue({ path: 'auto-hub', entries: [] })
    render(<MdBrowserDrawer {...defaultProps} />)
    await waitFor(() => expect(mockApiLs).toHaveBeenCalledWith('workspace', 'auto-hub'))
  })

  it('navigates into a folder and calls apiLs with updated path', async () => {
    mockApiLs
      .mockResolvedValueOnce({
        path: 'auto-hub',
        entries: [{ name: 'frontend', type: 'dir', size: 0, modified: '' }],
      })
      .mockResolvedValueOnce({
        path: 'auto-hub/frontend',
        entries: [{ name: 'index.ts', type: 'file', size: 10, modified: '' }],
      })
    render(<MdBrowserDrawer {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('frontend')).toBeInTheDocument())
    fireEvent.click(screen.getByText('frontend'))
    await waitFor(() =>
      expect(mockApiLs).toHaveBeenCalledWith('workspace', 'auto-hub/frontend')
    )
  })

  it('fetches md content via /files-api/download when md file is clicked', async () => {
    mockApiLs.mockResolvedValue({
      path: 'auto-hub',
      entries: [{ name: 'README.md', type: 'file', size: 100, modified: '' }],
    })
    mockFetch.mockResolvedValue({ ok: true, text: async () => '# Hello' })

    render(<MdBrowserDrawer {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument())
    fireEvent.click(screen.getByText('README.md'))

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/files-api\/download.*root=workspace.*README\.md/)
      )
    )
  })

  it('shows Back button in viewer and returns to browse on click', async () => {
    mockApiLs.mockResolvedValue({
      path: 'auto-hub',
      entries: [{ name: 'README.md', type: 'file', size: 100, modified: '' }],
    })
    mockFetch.mockResolvedValue({ ok: true, text: async () => '# Hi' })

    render(<MdBrowserDrawer {...defaultProps} />)
    await waitFor(() => fireEvent.click(screen.getByText('README.md')))
    await waitFor(() => expect(screen.getByText('Back')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Back'))
    await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument())
    expect(screen.queryByText('Back')).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked in browse view', async () => {
    mockApiLs.mockResolvedValue({ path: 'auto-hub', entries: [] })
    const onClose = vi.fn()
    render(<MdBrowserDrawer {...defaultProps} onClose={onClose} />)
    await waitFor(() => expect(mockApiLs).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /workspace/auto-hub/frontend && npx vitest run --reporter=verbose src/app/\\(app\\)/terminal/components/MdBrowserDrawer.test.tsx 2>&1 | tail -20
```

Expected: FAIL — "Cannot find module './MdBrowserDrawer'"

- [ ] **Step 3: Create MdBrowserDrawer.tsx**

Create `frontend/src/app/(app)/terminal/components/MdBrowserDrawer.tsx`:

```tsx
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
                    img: ({ src, alt }) => (
                      <img src={src} alt={alt ?? ''} className="max-w-full rounded my-2" />
                    ),
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
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
cd /workspace/auto-hub/frontend && npx vitest run --reporter=verbose src/app/\\(app\\)/terminal/components/MdBrowserDrawer.test.tsx 2>&1 | tail -30
```

Expected: 6 tests PASS. If a test fails:
- `vi.stubGlobal` errors → ensure Vitest version supports it (check `package.json`); fallback is `Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true })`
- Import errors for `react-markdown` → confirm Task 1 was completed and `transpilePackages` is set

- [ ] **Step 5: Commit**

```bash
cd /workspace/auto-hub && git add \
  "frontend/src/app/(app)/terminal/components/MdBrowserDrawer.tsx" \
  "frontend/src/app/(app)/terminal/components/MdBrowserDrawer.test.tsx" \
  && git commit -m "feat(terminal): MdBrowserDrawer — file browser and markdown viewer"
```

---

### Task 3: Wire floating button and drawer into terminal/page.tsx

**Files:**
- Modify: `frontend/src/app/(app)/terminal/page.tsx`

**Interfaces:**
- Consumes: `MdBrowserDrawer` named export from `./components/MdBrowserDrawer`
- Consumes: `workspace: 'home' | 'github' | 'auto-hub' | null` (already in page state)
- Consumes: `repoName: string | null` (already in page state)
- Consumes: `FolderOpen` from `lucide-react` (add to existing import on line 13)

- [ ] **Step 1: Add MdBrowserDrawer import to page.tsx**

In `frontend/src/app/(app)/terminal/page.tsx`, find the block of component imports (lines 6–12):
```tsx
import { SessionManager, Session } from './components/SessionManager'
import { WorkspacePicker } from './components/WorkspacePicker'
import { RepoPicker } from './components/RepoPicker'
import { CloneDialog } from './components/CloneDialog'
import { SessionTabs, TabSession } from './components/SessionTabs'
import { TerminalBreadcrumb } from './components/TerminalBreadcrumb'
import { GridView } from './components/GridView'
```

Add after `GridView` import:
```tsx
import { MdBrowserDrawer } from './components/MdBrowserDrawer'
```

- [ ] **Step 2: Add FolderOpen to the lucide-react import**

Find line 13:
```tsx
import { Clipboard, ClipboardPaste, MousePointer, MoveVertical } from 'lucide-react'
```

Replace with:
```tsx
import { Clipboard, ClipboardPaste, FolderOpen, MousePointer, MoveVertical } from 'lucide-react'
```

- [ ] **Step 3: Add getMdBrowserParams helper above the component**

Find the line `export default function TerminalPage()` and add this helper immediately above it:
```tsx
function getMdBrowserParams(
  workspace: 'home' | 'github' | 'auto-hub' | null,
  repoName: string | null,
): { root: string; startPath: string } {
  if (workspace === 'home') return { root: 'workspace', startPath: 'data' }
  if (workspace === 'auto-hub') return { root: 'workspace', startPath: 'auto-hub' }
  if (workspace === 'github' && repoName) return { root: 'workspace', startPath: `github/${repoName}` }
  return { root: 'workspace', startPath: 'data' }
}
```

- [ ] **Step 4: Add showMdBrowser state**

Inside `TerminalPage`, find the existing state declarations (around line 68, near `const [gridView, setGridView] = useState(false)`). Add after it:
```tsx
const [showMdBrowser, setShowMdBrowser] = useState(false)
```

- [ ] **Step 5: Add relative to the outer container div**

Find the outer wrapper div (around line 616):
```tsx
<div
  className="-mx-4 -mt-4 -mb-4 md:-mx-6 md:-mt-6 md:-mb-6 flex flex-col"
  style={{ height: isMobile ? 'calc(100dvh - 3rem)' : '100dvh' }}
>
```

Add `relative` to the className:
```tsx
<div
  className="-mx-4 -mt-4 -mb-4 md:-mx-6 md:-mt-6 md:-mb-6 flex flex-col relative"
  style={{ height: isMobile ? 'calc(100dvh - 3rem)' : '100dvh' }}
>
```

- [ ] **Step 6: Add floating button and drawer mount**

Inside the non-gridView branch (the `<>...</>` block containing `SessionTabs`, `TerminalBreadcrumb`, the toolbar rows, the terminal+scrollbar div, and `showSessionOverlay`), find the `showSessionOverlay` block near the end:
```tsx
        {showSessionOverlay && (
          <div ...>
            ...
          </div>
        )}
        </>
```

Insert the floating button and drawer mount just before the closing `</>`:
```tsx
        {/* Floating MD file browser — absolute-positioned over the terminal */}
        <button
          onClick={() => setShowMdBrowser(true)}
          title="Browse files"
          className={`absolute z-10 w-9 h-9 rounded-full flex items-center justify-center text-[#9ca3af] hover:text-[#e5e7eb] bg-[#1e293b]/70 hover:bg-[#1e293b] transition-colors shadow-lg ${
            isMobile ? 'bottom-16 right-3' : 'bottom-4 right-4'
          }`}
        >
          <FolderOpen size={16} />
        </button>

        {showMdBrowser && (
          <MdBrowserDrawer
            {...getMdBrowserParams(workspace, repoName)}
            onClose={() => setShowMdBrowser(false)}
          />
        )}
```

- [ ] **Step 7: TypeScript check**

```bash
cd /workspace/auto-hub/frontend && npx tsc --noEmit 2>&1 | grep "terminal/page" | head -10
```

Expected: no output. If there are errors, fix them before committing — common issues:
- `Workspace` type mismatch in `getMdBrowserParams` → change the param type to `Workspace | null` where `type Workspace = 'home' | 'github' | 'auto-hub'` (this type is already declared in page.tsx on line 24)

- [ ] **Step 8: Run all terminal tests for regressions**

```bash
cd /workspace/auto-hub/frontend && npx vitest run --reporter=verbose "terminal" 2>&1 | tail -30
```

Expected: all pre-existing terminal tests still pass, `MdBrowserDrawer.test` also passes.

- [ ] **Step 9: Commit**

```bash
cd /workspace/auto-hub && git add "frontend/src/app/(app)/terminal/page.tsx" && git commit -m "feat(terminal): floating folder button opens MD file browser"
```
