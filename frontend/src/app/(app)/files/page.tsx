'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { FolderOpen, LayoutGrid, List, FolderPlus, Upload, RefreshCw } from 'lucide-react'
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

export default function FilesPage() {
  const [root, setRoot] = useState('internal')
  const [path, setPath] = useState('/')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [error, setError] = useState<string | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number; entry: DirEntry } | null>(null)
  const [renaming, setRenaming] = useState<DirEntry | null>(null)
  const [newName, setNewName] = useState('')
  const uploadRef = useRef<HTMLInputElement>(null)

  const { listDir, mkdir, rename, deleteItem, download, upload } = useFiles()

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

  const handleNewFolder = async () => {
    const name = prompt('Folder name:')
    if (!name?.trim()) return
    try {
      await mkdir(root, posixJoin(path, name.trim()))
      refresh()
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    }
  }

  const handleDelete = async (entry: DirEntry) => {
    if (!confirm(`Delete "${entry.name}"?`)) return
    try {
      await deleteItem(root, posixJoin(path, entry.name))
      refresh()
    } catch (e: any) {
      alert(`Error: ${e.message}`)
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
      alert(`Error: ${e.message}`)
    }
  }

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    upload(root, path, files)
    e.target.value = ''
    // Refresh after 1s to show uploaded files
    setTimeout(refresh, 1000)
  }

  return (
    <div className="-m-4 md:-m-6 lg:-m-8 flex h-[calc(100dvh-57px)] md:h-screen overflow-hidden">
      <DrivesSidebar activeRoot={root} onSelect={handleSelectRoot} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#2a2a2a] bg-[#0d0d0d] shrink-0 flex-wrap gap-y-2">
          <div className="flex-1 min-w-0">
            <FileBreadcrumb root={root} path={path} onNavigate={setPath} />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={refresh}
              className="p-1.5 rounded-lg text-[#9ca3af] hover:text-white hover:bg-[#1a1a1a] transition-colors"
              title="Refresh"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleNewFolder}
              className="p-1.5 rounded-lg text-[#9ca3af] hover:text-white hover:bg-[#1a1a1a] transition-colors"
              title="New folder"
            >
              <FolderPlus size={15} />
            </button>
            <button
              onClick={() => uploadRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors"
            >
              <Upload size={14} />
              Upload
            </button>
            <input
              ref={uploadRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
            <div className="flex items-center border border-[#2a2a2a] rounded-lg overflow-hidden">
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

      {/* Rename modal */}
      {renaming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5 w-80 space-y-4">
            <h3 className="text-white font-medium">Rename</h3>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setRenaming(null) }}
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#3b82f6]"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenaming(null)}
                className="px-3 py-1.5 text-sm text-[#9ca3af] hover:text-white rounded-lg hover:bg-[#2a2a2a] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameSubmit}
                className="px-3 py-1.5 text-sm bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition-colors"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
