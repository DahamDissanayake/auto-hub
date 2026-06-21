'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { FolderOpen, LayoutGrid, List, FolderPlus, Upload, RefreshCw, X, AlertCircle } from 'lucide-react'
import DrivesSidebar from '@/components/files/DrivesSidebar'
import FileBreadcrumb from '@/components/files/FileBreadcrumb'
import FileGrid from '@/components/files/FileGrid'
import FileList from '@/components/files/FileList'
import ContextMenu from '@/components/files/ContextMenu'
import { useFiles } from '@/lib/useFiles'
import type { DirEntry } from '@/lib/filesApi'

function posixJoin(base: string, name: string): string {
  return base === '/' ? `/${name}` : `${base}/${name}`
}

interface Toast {
  id: string
  message: string
  type: 'error' | 'success'
}

export default function FilesPage() {
  const [root, setRoot] = useState('internal')
  const [path, setPath] = useState('/')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [error, setError] = useState<string | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number; entry: DirEntry } | null>(null)

  // Rename modal
  const [renaming, setRenaming] = useState<DirEntry | null>(null)
  const [newName, setNewName] = useState('')

  // New folder modal
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Delete confirm modal
  const [deleteTarget, setDeleteTarget] = useState<DirEntry | null>(null)

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([])

  const uploadRef = useRef<HTMLInputElement>(null)
  const { listDir, mkdir, rename, deleteItem, download, upload } = useFiles()

  const addToast = useCallback((message: string, type: Toast['type'] = 'error') => {
    const id = crypto.randomUUID()
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listDir(root, path)
      setEntries(result.entries)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [root, path, listDir])

  useEffect(() => { refresh() }, [refresh])

  const handleSelectRoot = (r: string) => {
    setRoot(r)
    setPath('/')
    setEntries([])
  }

  const handleOpenFolder = (name: string) => {
    setPath(posixJoin(path, name))
  }

  const handleContextMenu = (e: React.MouseEvent, entry: DirEntry) => {
    setCtx({ x: e.clientX, y: e.clientY, entry })
  }

  const handleNewFolder = () => {
    setNewFolderName('')
    setShowNewFolder(true)
  }

  const handleNewFolderSubmit = async () => {
    if (!newFolderName.trim()) return
    try {
      await mkdir(root, posixJoin(path, newFolderName.trim()))
      setShowNewFolder(false)
      setNewFolderName('')
      refresh()
    } catch (e: any) {
      addToast(`Failed to create folder: ${e.message}`)
    }
  }

  const handleDelete = (entry: DirEntry) => {
    setDeleteTarget(entry)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await deleteItem(root, posixJoin(path, deleteTarget.name))
      setDeleteTarget(null)
      refresh()
    } catch (e: any) {
      addToast(`Failed to delete: ${e.message}`)
      setDeleteTarget(null)
    }
  }

  const handleRenameSubmit = async () => {
    if (!renaming || !newName.trim()) return
    try {
      await rename(root, posixJoin(path, renaming.name), posixJoin(path, newName.trim()))
      setRenaming(null)
      setNewName('')
      refresh()
    } catch (e: any) {
      addToast(`Failed to rename: ${e.message}`)
    }
  }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    upload(root, path, files)
    e.target.value = ''
    setTimeout(refresh, 1000)
  }

  return (
    <div className="-m-4 md:-m-6 lg:-m-8 flex h-[calc(100dvh-57px)] md:h-screen overflow-hidden">
      <DrivesSidebar activeRoot={root} onSelect={handleSelectRoot} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#2a2a2a] bg-[#0d0d0d] shrink-0">
          <div className="flex-1 min-w-0">
            <FileBreadcrumb root={root} path={path} onNavigate={setPath} />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={refresh}
              className="p-1.5 rounded-lg text-[#9ca3af] hover:text-white hover:bg-[#1a1a1a] transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleNewFolder}
              className="p-1.5 rounded-lg text-[#9ca3af] hover:text-white hover:bg-[#1a1a1a] transition-colors"
              title="New folder"
            >
              <FolderPlus size={14} />
            </button>
            <button
              onClick={() => uploadRef.current?.click()}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors"
            >
              <Upload size={13} />
              Upload
            </button>
            <input
              ref={uploadRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
            <div className="flex items-center border border-[#2a2a2a] rounded-lg overflow-hidden ml-0.5">
              <button
                onClick={() => setView('grid')}
                className={`p-1.5 transition-colors ${view === 'grid' ? 'bg-[#1a1a1a] text-white' : 'text-[#9ca3af] hover:text-white hover:bg-[#111]'}`}
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => setView('list')}
                className={`p-1.5 transition-colors ${view === 'list' ? 'bg-[#1a1a1a] text-white' : 'text-[#9ca3af] hover:text-white hover:bg-[#111]'}`}
              >
                <List size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-3">
          {error ? (
            <div className="text-red-400 text-sm p-4">{error}</div>
          ) : view === 'grid' ? (
            <FileGrid
              entries={entries}
              onOpenFolder={handleOpenFolder}
              onContextMenu={handleContextMenu}
            />
          ) : (
            <FileList
              entries={entries}
              onOpenFolder={handleOpenFolder}
              onContextMenu={handleContextMenu}
            />
          )}
        </div>
      </div>

      {/* Context menu */}
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          entry={ctx.entry}
          onDownload={() => download(root, posixJoin(path, ctx.entry.name), ctx.entry.name)}
          onRename={() => { setRenaming(ctx.entry); setNewName(ctx.entry.name) }}
          onDelete={() => handleDelete(ctx.entry)}
          onClose={() => setCtx(null)}
        />
      )}

      {/* New folder modal */}
      {showNewFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5 w-80 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-medium text-sm">New Folder</h3>
              <button onClick={() => setShowNewFolder(false)} className="text-[#6b7280] hover:text-white transition-colors">
                <X size={14} />
              </button>
            </div>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNewFolderSubmit()
                if (e.key === 'Escape') setShowNewFolder(false)
              }}
              placeholder="Folder name"
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#3b82f6] placeholder:text-[#4b5563] transition-colors"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewFolder(false)}
                className="px-3 py-1.5 text-xs text-[#9ca3af] hover:text-white rounded-lg hover:bg-[#2a2a2a] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleNewFolderSubmit}
                className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition-colors font-medium"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5 w-80 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-medium text-sm">Delete item</h3>
              <button onClick={() => setDeleteTarget(null)} className="text-[#6b7280] hover:text-white transition-colors">
                <X size={14} />
              </button>
            </div>
            <p className="text-[#9ca3af] text-sm">
              Delete <span className="text-white font-medium">&ldquo;{deleteTarget.name}&rdquo;</span>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 text-xs text-[#9ca3af] hover:text-white rounded-lg hover:bg-[#2a2a2a] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename modal */}
      {renaming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5 w-80 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-medium text-sm">Rename</h3>
              <button onClick={() => setRenaming(null)} className="text-[#6b7280] hover:text-white transition-colors">
                <X size={14} />
              </button>
            </div>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit()
                if (e.key === 'Escape') setRenaming(null)
              }}
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#3b82f6] transition-colors"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenaming(null)}
                className="px-3 py-1.5 text-xs text-[#9ca3af] hover:text-white rounded-lg hover:bg-[#2a2a2a] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameSubmit}
                className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition-colors font-medium"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs shadow-xl border pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200 ${
              t.type === 'error'
                ? 'bg-[#1f1010] border-red-900/60 text-red-300'
                : 'bg-[#0f1f14] border-green-900/60 text-green-300'
            }`}
          >
            <AlertCircle size={13} className="shrink-0" />
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}
