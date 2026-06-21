import { Router, Request, Response } from 'express'
import fs from 'fs/promises'
import { resolveSafePath } from '../lib/resolvePath'

const router = Router()

router.post('/', async (req: Request, res: Response) => {
  const { root, from, to } = req.body as { root?: string; from?: string; to?: string }
  if (!root || !from || !to) { res.status(400).json({ error: 'root, from, and to are required' }); return }
  let absFrom: string, absTo: string
  try {
    absFrom = resolveSafePath(root, from)
    absTo = resolveSafePath(root, to)
  } catch (e: any) {
    res.status(e.code === 'UNKNOWN_ROOT' ? 400 : 403).json({ error: e.message }); return
  }
  try {
    await fs.rename(absFrom, absTo)
    res.json({ success: true })
  } catch (e: any) {
    if (e.code === 'ENOENT') { res.status(404).json({ error: 'File not found' }); return }
    if (e.code === 'EACCES') { res.status(403).json({ error: 'Permission denied' }); return }
    res.status(500).json({ error: 'Internal error' })
  }
})

export default router
