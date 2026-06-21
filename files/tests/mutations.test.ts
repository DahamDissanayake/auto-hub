import request from 'supertest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import jwt from 'jsonwebtoken'

process.env.JWT_SECRET = 'test-secret'
let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'files-mut-'))
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

describe('POST /mkdir', () => {
  it('creates a directory', async () => {
    const res = await request(app)
      .post('/mkdir')
      .set('Authorization', auth)
      .send({ root: 'data', path: '/newdir' })
    expect(res.status).toBe(200)
    const stat = await fs.stat(path.join(tmpDir, 'newdir'))
    expect(stat.isDirectory()).toBe(true)
  })

  it('returns 403 on path traversal', async () => {
    const res = await request(app)
      .post('/mkdir')
      .set('Authorization', auth)
      .send({ root: 'data', path: '/../evil' })
    expect(res.status).toBe(403)
  })
})

describe('POST /rename', () => {
  it('renames a file', async () => {
    await fs.writeFile(path.join(tmpDir, 'old.txt'), 'data')
    const res = await request(app)
      .post('/rename')
      .set('Authorization', auth)
      .send({ root: 'data', from: '/old.txt', to: '/new.txt' })
    expect(res.status).toBe(200)
    await expect(fs.access(path.join(tmpDir, 'new.txt'))).resolves.toBeUndefined()
    await expect(fs.access(path.join(tmpDir, 'old.txt'))).rejects.toThrow()
  })

  it('returns 404 when source not found', async () => {
    const res = await request(app)
      .post('/rename')
      .set('Authorization', auth)
      .send({ root: 'data', from: '/nope.txt', to: '/other.txt' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /delete', () => {
  it('deletes a file', async () => {
    await fs.writeFile(path.join(tmpDir, 'bye.txt'), 'data')
    const res = await request(app)
      .delete('/delete')
      .set('Authorization', auth)
      .send({ root: 'data', path: '/bye.txt' })
    expect(res.status).toBe(200)
    await expect(fs.access(path.join(tmpDir, 'bye.txt'))).rejects.toThrow()
  })

  it('deletes an empty directory', async () => {
    await fs.mkdir(path.join(tmpDir, 'emptydir'))
    const res = await request(app)
      .delete('/delete')
      .set('Authorization', auth)
      .send({ root: 'data', path: '/emptydir' })
    expect(res.status).toBe(200)
  })

  it('returns 409 when directory is not empty', async () => {
    await fs.mkdir(path.join(tmpDir, 'notempty'))
    await fs.writeFile(path.join(tmpDir, 'notempty', 'file.txt'), 'x')
    const res = await request(app)
      .delete('/delete')
      .set('Authorization', auth)
      .send({ root: 'data', path: '/notempty' })
    expect(res.status).toBe(409)
  })

  it('returns 404 when file not found', async () => {
    const res = await request(app)
      .delete('/delete')
      .set('Authorization', auth)
      .send({ root: 'data', path: '/ghost.txt' })
    expect(res.status).toBe(404)
  })
})
