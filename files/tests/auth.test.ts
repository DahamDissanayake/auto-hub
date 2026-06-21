import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'

process.env.JWT_SECRET = 'test-secret'
import { authMiddleware } from '../src/lib/auth'

const app = express()
app.use(authMiddleware)
app.get('/protected', (_req, res) => res.json({ ok: true }))

const validToken = jwt.sign({ sub: 'user' }, 'test-secret')

describe('authMiddleware', () => {
  it('passes with a valid Bearer token', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${validToken}`)
    expect(res.status).toBe(200)
  })

  it('rejects with no Authorization header', async () => {
    const res = await request(app).get('/protected')
    expect(res.status).toBe(401)
  })

  it('rejects with a bad token', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer bad.token.here')
    expect(res.status).toBe(401)
  })

  it('rejects with an expired token', async () => {
    const expired = jwt.sign({ sub: 'user' }, 'test-secret', { expiresIn: -1 })
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${expired}`)
    expect(res.status).toBe(401)
  })
})
