import { Router, Request, Response } from 'express'
import fs from 'fs/promises'
import { resolveSafePath } from '../lib/resolvePath'

const router = Router()

router.post('/', async (req: Request, res: Response) => {
  const { root, path: relPath } = req.body as { root?: string; path?: string }
  if (!root || !relPath) { res.status(400).json({ error: 'root and path are required' }); return }
  let absPath: string
  try {
    absPath = resolveSafePath(root, relPath)
  } catch (e: any) {
    res.status(e.code === 'UNKNOWN_ROOT' ? 400 : 403).json({ error: e.message }); return
  }
  try {
    await fs.mkdir(absPath, { recursive: true })
    res.json({ success: true })
  } catch (e: any) {
    if (e.code === 'EACCES') { res.status(403).json({ error: 'Permission denied' }); return }
    res.status(500).json({ error: 'Internal error' })
  }
})

export default router
