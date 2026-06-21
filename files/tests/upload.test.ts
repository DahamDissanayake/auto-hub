import request from 'supertest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import jwt from 'jsonwebtoken'

process.env.JWT_SECRET = 'test-secret'
let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'files-up-'))
  process.env.ROOTS_DATA = tmpDir
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

let app: import('express').Express
beforeAll(async () => {
  app = (await import('../src/index')).default
})

const token = jwt.sign({ sub: 'user' }, 'test-secret')
const auth = `Bearer ${token}`

describe('POST /upload', () => {
  it('uploads a file to the target directory', async () => {
    const res = await request(app)
      .post('/upload?root=data&path=/&transferId=test-id-1')
      .set('Authorization', auth)
      .attach('file', Buffer.from('file contents here'), 'myfile.txt')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.transferId).toBe('test-id-1')
    const written = await fs.readFile(path.join(tmpDir, 'myfile.txt'), 'utf-8')
    expect(written).toBe('file contents here')
  })

  it('returns 403 on path traversal', async () => {
    const res = await request(app)
      .post('/upload?root=data&path=/../evil&transferId=t2')
      .set('Authorization', auth)
      .attach('file', Buffer.from('x'), 'f.txt')
    expect(res.status).toBe(403)
  })

  it('returns 400 when root is missing', async () => {
    const res = await request(app)
      .post('/upload?path=/&transferId=t3')
      .set('Authorization', auth)
      .attach('file', Buffer.from('x'), 'f.txt')
    expect(res.status).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/upload?root=data&path=/&transferId=t4')
      .attach('file', Buffer.from('x'), 'f.txt')
    expect(res.status).toBe(401)
  })
})
