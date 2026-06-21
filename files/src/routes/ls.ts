import { Router, Request, Response } from 'express'
import fs from 'fs/promises'
import path from 'path'
import { resolveSafePath } from '../lib/resolvePath'

const router = Router()

router.get('/', async (req: Request, res: Response) => {
  const { root, path: relPath = '/' } = req.query as { root?: string; path?: string }
  if (!root) {
    res.status(400).json({ error: 'root is required' })
    return
  }
  let absPath: string
  try {
    absPath = resolveSafePath(root, relPath)
  } catch (e: any) {
    res.status(e.code === 'UNKNOWN_ROOT' ? 400 : 403).json({ error: e.message })
    return
  }
  try {
    const dirents = await fs.readdir(absPath, { withFileTypes: true })
    const entries = await Promise.all(
      dirents.map(async (d) => {
        try {
          const stat = await fs.stat(path.join(absPath, d.name))
          return {
            name: d.name,
            type: d.isDirectory() ? 'dir' : 'file',
            size: d.isDirectory() ? 0 : stat.size,
            modified: stat.mtime.toISOString(),
          }
        } catch {
          return { name: d.name, type: 'file', size: 0, modified: new Date().toISOString() }
        }
      })
    )
    res.json({ path: relPath, entries })
  } catch (e: any) {
    if (e.code === 'ENOENT') { res.status(404).json({ error: 'Directory not found' }); return }
    if (e.code === 'EACCES') { res.status(403).json({ error: 'Permission denied' }); return }
    res.status(500).json({ error: 'Internal error' })
  }
})

export default router
