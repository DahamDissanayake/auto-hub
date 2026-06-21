import request from 'supertest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import jwt from 'jsonwebtoken'

process.env.JWT_SECRET = 'test-secret'
let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'files-dl-'))
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

describe('GET /download', () => {
  it('streams a file with correct headers', async () => {
    await fs.writeFile(path.join(tmpDir, 'report.txt'), 'hello world')
    const res = await request(app)
      .get('/download?root=data&path=/report.txt')
      .set('Authorization', auth)
    expect(res.status).toBe(200)
    expect(res.headers['content-disposition']).toContain('report.txt')
    expect(res.headers['content-length']).toBe('11')
    expect(res.text).toBe('hello world')
  })

  it('returns 404 for missing file', async () => {
    const res = await request(app)
      .get('/download?root=data&path=/nope.txt')
      .set('Authorization', auth)
    expect(res.status).toBe(404)
  })

  it('returns 400 for a directory', async () => {
    await fs.mkdir(path.join(tmpDir, 'mydir'))
    const res = await request(app)
      .get('/download?root=data&path=/mydir')
      .set('Authorization', auth)
    expect(res.status).toBe(400)
  })

  it('returns 403 on path traversal', async () => {
    const res = await request(app)
      .get('/download?root=data&path=/../etc/passwd')
      .set('Authorization', auth)
    expect(res.status).toBe(403)
  })
})
