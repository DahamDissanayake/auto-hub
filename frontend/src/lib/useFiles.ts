'use client'
import { useCallback } from 'react'
import { useTransferStore } from './transferStore'
import {
  apiLs, apiMkdir, apiRename, apiDelete, apiDownload, apiUpload,
  ListResult,
} from './filesApi'

export function useFiles() {
  const { addTransfer, updateTransfer, removeTransfer } = useTransferStore()

  const listDir = useCallback(
    (root: string, path: string): Promise<ListResult> => apiLs(root, path),
    []
  )

  const mkdir = useCallback(
    (root: string, path: string): Promise<void> => apiMkdir(root, path),
    []
  )

  const rename = useCallback(
    (root: string, from: string, to: string): Promise<void> => apiRename(root, from, to),
    []
  )

  const deleteItem = useCallback(
    (root: string, path: string): Promise<void> => apiDelete(root, path),
    []
  )

  const download = useCallback(
    async (root: string, path: string, filename: string): Promise<void> => {
      const id = crypto.randomUUID()
      addTransfer({ id, filename, direction: 'down', status: 'downloading', bytesWritten: 0, total: 0 })
      try {
        await apiDownload(root, path, filename)
        updateTransfer(id, { status: 'done', completedAt: Date.now() })
        setTimeout(() => removeTransfer(id), 5000)
      } catch (e: any) {
        updateTransfer(id, { status: 'error', message: e.message })
        setTimeout(() => removeTransfer(id), 5000)
      }
    },
    [addTransfer, updateTransfer, removeTransfer]
  )

  const upload = useCallback(
    (root: string, path: string, files: File[]): () => void => {
      const id = crypto.randomUUID()
      const controller = new AbortController()
      const totalSize = files.reduce((acc, f) => acc + f.size, 0)
      const filename = files.length === 1 ? files[0].name : `${files.length} files`

      addTransfer({
        id,
        filename,
        direction: 'up',
        status: 'uploading',
        bytesWritten: 0,
        total: totalSize,
        abort: () => controller.abort(),
      })

      let lastLoaded = 0
      let lastTime = Date.now()
      let smoothedSpeed = 0

      apiUpload(root, path, id, files, controller.signal, (loaded, total) => {
        const now = Date.now()
        const dt = (now - lastTime) / 1000
        if (dt >= 0.5 && loaded > lastLoaded) {
          const instant = (loaded - lastLoaded) / dt
          smoothedSpeed = smoothedSpeed > 0 ? 0.25 * instant + 0.75 * smoothedSpeed : instant
          lastLoaded = loaded
          lastTime = now
        }
        updateTransfer(id, { bytesWritten: loaded, total, speed: smoothedSpeed })
      }).then(() => {
        updateTransfer(id, { status: 'done', completedAt: Date.now() })
        setTimeout(() => removeTransfer(id), 5000)
      }).catch((e: any) => {
        if (e.name === 'AbortError') {
          removeTransfer(id)
        } else {
          updateTransfer(id, { status: 'error', message: e.message })
          setTimeout(() => removeTransfer(id), 5000)
        }
      })

      return () => controller.abort()
    },
    [addTransfer, updateTransfer, removeTransfer]
  )

  return { listDir, mkdir, rename, deleteItem, download, upload }
}
