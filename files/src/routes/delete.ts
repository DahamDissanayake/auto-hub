import { Router, Request, Response } from 'express'
import fs from 'fs/promises'
import { resolveSafePath } from '../lib/resolvePath'

const router = Router()

router.delete('/', async (req: Request, res: Response) => {
  const { root, path: relPath } = req.body as { root?: string; path?: string }
  if (!root || !relPath) { res.status(400).json({ error: 'root and path are required' }); return }
  let absPath: string
  try {
    absPath = resolveSafePath(root, relPath)
  } catch (e: any) {
    res.status(e.code === 'UNKNOWN_ROOT' ? 400 : 403).json({ error: e.message }); return
  }
  try {
    const stat = await fs.stat(absPath)
    if (stat.isDirectory()) {
      await fs.rmdir(absPath)
    } else {
      await fs.unlink(absPath)
    }
    res.json({ success: true })
  } catch (e: any) {
    if (e.code === 'ENOENT') { res.status(404).json({ error: 'File not found' }); return }
    if (e.code === 'EACCES') { res.status(403).json({ error: 'Permission denied' }); return }
    if (e.code === 'ENOTEMPTY') { res.status(409).json({ error: 'Directory not empty' }); return }
    res.status(500).json({ error: 'Internal error' })
  }
})

export default router
