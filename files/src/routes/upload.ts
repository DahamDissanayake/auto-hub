import { Router, Request, Response } from 'express'
import busboy from 'busboy'
import fs from 'fs'
import path from 'path'
import { resolveSafePath } from '../lib/resolvePath'
import { transferStore } from '../lib/transferStore'

const router = Router()

router.post('/', (req: Request, res: Response) => {
  const { root, path: relPath, transferId } = req.query as {
    root?: string; path?: string; transferId?: string
  }
  if (!root || !relPath || !transferId) {
    res.status(400).json({ error: 'root, path, and transferId are required' })
    return
  }
  let dirPath: string
  try {
    dirPath = resolveSafePath(root, relPath)
  } catch (e: any) {
    res.status(e.code === 'UNKNOWN_ROOT' ? 400 : 403).json({ error: e.message })
    return
  }

  const total = parseInt(req.headers['content-length'] ?? '0', 10)
  let bytesWritten = 0
  let writeStream: fs.WriteStream | null = null
  let writeStreamDone: Promise<void> | null = null
  let filePath: string | null = null
  let finished = false
  let busboyFinished = false

  const cleanup = () => {
    writeStream?.destroy()
    if (filePath) fs.unlink(filePath, () => {})
  }

  try {
    const bb = busboy({ headers: req.headers, limits: { files: 50, fileSize: 10 * 1024 * 1024 * 1024 } })

    bb.on('file', (_field, file, info) => {
      const safe = path.basename(info.filename)
      if (!safe) {
        file.resume() // drain the stream
        return
      }
      filePath = path.join(dirPath, safe)
      writeStream = fs.createWriteStream(filePath)
      writeStreamDone = new Promise<void>((resolve, reject) => {
        writeStream!.on('finish', resolve)
        writeStream!.on('error', reject)
      })

      file.on('data', (chunk: Buffer) => {
        bytesWritten += chunk.length
        transferStore.emit('transfer', { transferId, bytesWritten, total, status: 'uploading' })
      })

      file.on('error', () => {
        cleanup()
        if (!res.headersSent) {
          transferStore.emit('transfer', { transferId, status: 'error', message: 'Read error' })
          res.status(500).json({ error: 'Upload read error' })
        }
      })

      writeStream.on('error', (e: any) => {
        cleanup()
        if (!res.headersSent) {
          const code = e.code === 'ENOSPC' ? 507 : 500
          const message = e.code === 'ENOSPC' ? 'Not enough space' : 'Write error'
          transferStore.emit('transfer', { transferId, status: 'error', message })
          res.status(code).json({ error: message })
        }
      })

      file.pipe(writeStream)
    })

    bb.on('finish', () => {
      busboyFinished = true
      if (writeStreamDone) {
        writeStreamDone.then(() => {
          if (!res.headersSent) {
            finished = true
            transferStore.emit('transfer', { transferId, status: 'done' })
            res.json({ success: true, transferId })
          }
        }).catch((e: any) => {
          cleanup()
          if (!res.headersSent) {
            const code = e.code === 'ENOSPC' ? 507 : 500
            const message = e.code === 'ENOSPC' ? 'Not enough space' : 'Write error'
            transferStore.emit('transfer', { transferId, status: 'error', message })
            res.status(code).json({ error: message })
          }
        })
      } else if (!res.headersSent) {
        finished = true
        res.json({ success: true, transferId })
      }
    })

    bb.on('error', (e: any) => {
      cleanup()
      if (!res.headersSent) {
        const code = e.code === 'ENOSPC' ? 507 : 500
        const message = e.code === 'ENOSPC' ? 'Not enough space' : 'Upload error'
        transferStore.emit('transfer', { transferId, status: 'error', message })
        res.status(code).json({ error: message })
      }
    })

    req.on('close', () => {
      // Only clean up (delete partial file) if upload was aborted before busboy
      // finished parsing. If busboyFinished is true, we're just waiting for
      // the writeStream to flush — don't destroy it.
      if (!finished && !busboyFinished) cleanup()
    })

    req.pipe(bb)
  } catch (e: any) {
    if (e.code === 'EACCES') { res.status(403).json({ error: 'Permission denied' }); return }
    res.status(500).json({ error: 'Internal error' })
  }
})

export default router
