import express from 'express'
import { authMiddleware } from './lib/auth'
import lsRouter from './routes/ls'
import mkdirRouter from './routes/mkdir'
import renameRouter from './routes/rename'
import deleteRouter from './routes/delete'
import downloadRouter from './routes/download'
import eventsRouter from './routes/events'
import uploadRouter from './routes/upload'

// Check JWT_SECRET is set on startup
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set')
}

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true }))

// /events handles its own JWT auth (EventSource can't send headers)
app.use('/events', eventsRouter)
// /download handles its own JWT auth to support anchor-tag downloads with token query param
app.use('/download', downloadRouter)

app.use(authMiddleware)
app.use('/ls', lsRouter)
app.use('/mkdir', mkdirRouter)
app.use('/rename', renameRouter)
app.use('/delete', deleteRouter)
app.use('/upload', uploadRouter)

const PORT = parseInt(process.env.PORT ?? '5050', 10)
if (require.main === module) {
  app.listen(PORT, () => console.log(`Files service :${PORT}`))
}

export default app
