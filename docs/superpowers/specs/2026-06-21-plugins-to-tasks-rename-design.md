# Plugins → Tasks Surface Rename Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every user-visible occurrence of "Plugin/Plugins" with "Task/Tasks" in the AutoHub frontend UI, while leaving all backend code, API routes, DB tables, file names, hooks, and component names entirely unchanged.

**Architecture:** Surface-only rename. The `/plugins` URL route, `/api/plugins` API endpoints, `plugins` DB table, TypeScript types, hook names, and component file names are all preserved as-is. Only strings and icons rendered in the browser change.

**Tech Stack:** Next.js 14 App Router, React, Tailwind CSS, lucide-react

## Global Constraints

- No backend files are modified
- No file or folder renames
- No API route changes
- No DB migrations
- No TypeScript type renames
- The `/plugins` URL stays unchanged
- Icon for Tasks: `ListTodo` from lucide-react (replaces `Puzzle`)
- The second page tab stays labeled "Output" (unchanged)

---

## Exact Changes

### 1. Navigation — `frontend/src/components/layout/Sidebar.tsx`

- Nav item label: `'Plugins'` → `'Tasks'`
- Nav item icon import: remove `Puzzle`, add `ListTodo`
- Nav item icon usage: `Puzzle` → `ListTodo`

### 2. Mobile Navigation — `frontend/src/components/layout/MobileNav.tsx`

- Same nav item label/icon change as Sidebar if it duplicates the nav config. If it imports from a shared nav config, the Sidebar change covers it automatically.

### 3. Bottom Navigation — `frontend/src/components/layout/BottomNav.tsx`

- Same nav item label/icon change as Sidebar if it duplicates the nav config.

### 4. Plugins Page — `frontend/src/app/(app)/plugins/page.tsx`

| Element | Before | After |
|---------|--------|-------|
| Icon import | `Puzzle` | `ListTodo` |
| Page `<h1>` icon | `<Puzzle size={20} …>` | `<ListTodo size={20} …>` |
| Page `<h1>` text | `Plugins` | `Tasks` |
| First tab button icon | `<Puzzle size={14} />` | `<ListTodo size={14} />` |
| First tab button label | `Plugins` | `Tasks` |
| Empty state message | `No plugins installed. Drop a plugin folder into the PLUGIN_DIR volume and restart the backend.` | `No tasks installed. Drop a task folder into the plugin directory and restart the backend.` |
| Output tab filter `<option>` | `All plugins` | `All tasks` |

### 5. PluginCard, ConfigModal, ScheduleModal, ActionConfirmModal, ExecutionLog

No changes. All user-visible strings in these components reference the specific task's `name`, `description`, or `action.label` — none contain the literal word "plugin" as a UI label.

---

## What Does NOT Change

- `frontend/src/app/(app)/plugins/` — folder name and route
- `frontend/src/components/plugins/` — folder and all component file names
- `frontend/src/lib/hooks/usePlugins.ts` — hook file and exported names
- `frontend/src/lib/types.ts` — `Plugin`, `PluginExecution`, `PluginAction` type names
- All backend source files under `backend/src/plugins/`
- `backend/plugins/` directory and manifest files
- `/api/plugins` REST endpoints
- `plugins` and `plugin_executions` database tables
- React Query cache keys (`['plugins']`, `['executions']`)
