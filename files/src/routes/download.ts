import { Router, Request, Response } from 'express'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { resolveSafePath } from '../lib/resolvePath'

const router = Router()

router.get('/', async (req: Request, res: Response) => {
  const { root, path: relPath } = req.query as { root?: string; path?: string }
  if (!root || !relPath) { res.status(400).json({ error: 'root and path are required' }); return }
  let absPath: string
  try {
    absPath = resolveSafePath(root, relPath)
  } catch (e: any) {
    res.status(e.code === 'UNKNOWN_ROOT' ? 400 : 403).json({ error: e.message }); return
  }
  try {
    const stat = await fsp.stat(absPath)
    if (stat.isDirectory()) { res.status(400).json({ error: 'Cannot download a directory' }); return }
    const filename = path.basename(absPath)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', stat.size)
    const stream = fs.createReadStream(absPath)
    stream.on('error', (e: any) => {
      if (!res.headersSent) {
        res.status(e.code === 'ENOENT' ? 404 : 500).json({ error: e.message })
      }
    })
    stream.pipe(res)
  } catch (e: any) {
    if (e.code === 'ENOENT') { res.status(404).json({ error: 'File not found' }); return }
    if (e.code === 'EACCES') { res.status(403).json({ error: 'Permission denied' }); return }
    res.status(500).json({ error: 'Internal error' })
  }
})

export default router
