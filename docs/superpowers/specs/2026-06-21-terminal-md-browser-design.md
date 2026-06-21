# Terminal MD File Browser — Design Spec

**Date:** 2026-06-21  
**Status:** Approved

## Overview

Add a floating folder button to the terminal page. Clicking it opens a file browser overlay starting from the terminal session's root directory. `.md` files can be opened and rendered as readable, formatted Markdown inside a full-screen viewer overlay.

## Architecture

### New files
- `frontend/src/app/(app)/terminal/components/MdBrowserDrawer.tsx` — self-contained component owning all browse + viewer state

### Modified files
- `frontend/src/app/(app)/terminal/page.tsx` — add `showMdBrowser` boolean state, floating button, and `<MdBrowserDrawer>` mount
- `frontend/package.json` — add `react-markdown ^9.x` and `remark-gfm ^4.x`

No backend changes. The existing `/files-api/ls` and `/files-api/download` endpoints handle all file access.

## Workspace → Root/Path Mapping

The terminal page already tracks `workspace` and `repoName` in state. These map to files API parameters as follows:

| workspace  | root        | path                        |
|------------|-------------|-----------------------------|
| `home`     | `workspace` | `data`                      |
| `auto-hub` | `workspace` | `auto-hub`                  |
| `github`   | `workspace` | `github/<repoName>`         |

## Floating Button

- **Icon:** `FolderOpen` from lucide-react (already installed)
- **Position:** absolute, `bottom-4 right-4` desktop / `bottom-16 right-3` mobile, inside the `flex-1 flex overflow-hidden` terminal container div
- **Z-index:** `z-10` — above xterm canvas, below full-screen overlays
- **Appearance:** small circular button, semi-transparent at rest, fully opaque on hover
- **Trigger:** sets `showMdBrowser = true` in `page.tsx` state

## MdBrowserDrawer Component

### Props
```ts
interface MdBrowserDrawerProps {
  root: string        // files API root: 'workspace' | 'internal' | 'data'
  startPath: string   // e.g. 'auto-hub', 'data', 'github/my-repo'
  onClose: () => void
}
```

### Internal state
```ts
view: 'browse' | 'viewer'
currentPath: string          // current browsed directory
entries: DirEntry[]          // from apiLs
loading: boolean
error: string | null
mdContent: string | null     // fetched markdown text
mdTitle: string              // filename of opened .md file
```

### Browse view

**Outer:** full-screen overlay `fixed inset-0 z-50 bg-black/80 flex items-center justify-center`  
**Panel:** `bg-[#111] rounded-lg w-full max-w-lg mx-4` with max-height and overflow-y scroll on mobile

**Header:**
- `←` back button (navigates up one directory; hidden at startPath)
- Breadcrumb: path segments relative to startPath, truncated with ellipsis if long
- `X` button calls `onClose`

**File list (sorted: dirs first, then files):**
- `FolderOpen` icon → folders: click navigates into folder via `apiLs`
- `FileText` icon (blue) → `.md` files: click loads content and switches to viewer
- `File` icon (dimmed) → all other files: rendered but not clickable
- Empty state: "No files found" message

### Viewer view

Replaces browse view content (same overlay wrapper stays).

**Header:**
- `← Back` button → sets `view = 'browse'`, preserves `currentPath`
- Filename centred (e.g. `README.md`)
- `X` button calls `onClose`

**Content:**
- Fetched via `fetch('/files-api/download?root=...&path=...&token=...')` as plain text
- Rendered with `<ReactMarkdown remarkPlugins={[remarkGfm]}>`
- Styled with scoped Tailwind prose classes (no `@tailwindcss/typography` needed):
  - `h1–h4` sized and weighted
  - `code`/`pre` blocks in monospace with dark background
  - `a` links in blue
  - `table` with bordered cells
  - `ul`/`ol` with proper list indentation
  - `blockquote` with left border

## Data Flow

```
page.tsx
  showMdBrowser=true
    → <MdBrowserDrawer root startPath onClose>
        browse view
          apiLs(root, currentPath)
            → DirEntry[]
          click folder → update currentPath, re-fetch
          click .md file
            → fetch /files-api/download as text
            → set mdContent, mdTitle
            → view = 'viewer'
        viewer view
          <ReactMarkdown>{mdContent}</ReactMarkdown>
          ← back → view = 'browse'
          X → onClose → showMdBrowser=false
```

## Error Handling

- `apiLs` failure: show inline error message in browse view with retry button
- Download failure: show error in viewer panel with back button
- No `.md` files in a directory: still shows directory; non-.md files are dimmed

## Testing Considerations

- No new test files required (the component is UI-only, driven by existing `filesApi` which is already tested)
- Manual test path: open terminal → click folder icon → navigate to a directory with `.md` files → open one → verify rendered output → back → close
