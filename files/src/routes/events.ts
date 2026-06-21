import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { transferStore, TransferEvent } from '../lib/transferStore'

const router = Router()

router.get('/', (req: Request, res: Response) => {
  // SSE handles its own JWT auth since EventSource can't send headers
  const secret = process.env.JWT_SECRET ?? 'changeme'
  const authHeader = req.headers.authorization
  const tokenFromQuery = req.query.token as string | undefined

  let token: string | undefined
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  } else if (tokenFromQuery) {
    token = tokenFromQuery
  }

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    jwt.verify(token, secret)
  } catch {
    res.status(401).json({ error: 'Invalid token' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const listener = (event: TransferEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  transferStore.on('transfer', listener)

  req.on('close', () => {
    transferStore.off('transfer', listener)
  })
})

export default router
