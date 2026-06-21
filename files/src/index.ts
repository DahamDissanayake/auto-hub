import express from 'express'
import { authMiddleware } from './lib/auth'
import lsRouter from './routes/ls'
import mkdirRouter from './routes/mkdir'
import renameRouter from './routes/rename'
import deleteRouter from './routes/delete'

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true }))

app.use(authMiddleware)
app.use('/ls', lsRouter)
app.use('/mkdir', mkdirRouter)
app.use('/rename', renameRouter)
app.use('/delete', deleteRouter)

const PORT = parseInt(process.env.PORT ?? '5050', 10)
if (require.main === module) {
  app.listen(PORT, () => console.log(`Files service :${PORT}`))
}

export default app
