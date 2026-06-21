import request from 'supertest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import jwt from 'jsonwebtoken'

process.env.JWT_SECRET = 'test-secret'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'files-ls-'))
  process.env.ROOTS_DATA = tmpDir
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// Import app AFTER env is set
let app: import('express').Express
beforeAll(async () => {
  app = (await import('../src/index')).default
})

const token = jwt.sign({ sub: 'user' }, 'test-secret')
const auth = `Bearer ${token}`

describe('GET /ls', () => {
  it('lists files and dirs', async () => {
    await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'world')
    await fs.mkdir(path.join(tmpDir, 'subdir'))

    const res = await request(app)
      .get('/ls?root=data&path=/')
      .set('Authorization', auth)

    expect(res.status).toBe(200)
    expect(res.body.path).toBe('/')
    const names = res.body.entries.map((e: any) => e.name)
    expect(names).toContain('hello.txt')
    expect(names).toContain('subdir')
    const file = res.body.entries.find((e: any) => e.name === 'hello.txt')
    expect(file.type).toBe('file')
    expect(file.size).toBe(5)
    expect(file.modified).toBeTruthy()
    const dir = res.body.entries.find((e: any) => e.name === 'subdir')
    expect(dir.type).toBe('dir')
  })

  it('returns 404 for nonexistent directory', async () => {
    const res = await request(app)
      .get('/ls?root=data&path=/nope')
      .set('Authorization', auth)
    expect(res.status).toBe(404)
  })

  it('returns 403 on path traversal', async () => {
    const res = await request(app)
      .get('/ls?root=data&path=/../etc')
      .set('Authorization', auth)
    expect(res.status).toBe(403)
  })

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/ls?root=data&path=/')
    expect(res.status).toBe(401)
  })

  it('returns 400 on missing root', async () => {
    const res = await request(app)
      .get('/ls?path=/')
      .set('Authorization', auth)
    expect(res.status).toBe(400)
  })
})
