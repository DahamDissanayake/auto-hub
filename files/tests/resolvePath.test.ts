import path from 'path'

// Set env before module load
process.env.ROOTS_INTERNAL = '/tmp/internal'
process.env.ROOTS_WORKSPACE = '/tmp/workspace'
process.env.ROOTS_DATA = '/tmp/data'

import { resolveSafePath } from '../src/lib/resolvePath'

describe('resolveSafePath', () => {
  it('resolves a normal relative path', () => {
    const result = resolveSafePath('data', '/photos/cat.jpg')
    expect(result).toBe('/tmp/data/photos/cat.jpg')
  })

  it('resolves root path /', () => {
    const result = resolveSafePath('data', '/')
    expect(result).toBe('/tmp/data')
  })

  it('throws PATH_TRAVERSAL on .. escape', () => {
    expect(() => resolveSafePath('data', '/../etc/passwd')).toThrow(
      expect.objectContaining({ code: 'PATH_TRAVERSAL' })
    )
  })

  it('throws PATH_TRAVERSAL on prefix collision (not a real sibling)', () => {
    process.env.ROOTS_DATA = '/tmp/data'
    // /tmp/data-evil/file would start with /tmp/data but not /tmp/data/
    expect(() => resolveSafePath('data', '../data-evil/file')).toThrow(
      expect.objectContaining({ code: 'PATH_TRAVERSAL' })
    )
  })

  it('throws UNKNOWN_ROOT on unrecognised root name', () => {
    expect(() => resolveSafePath('unknown', '/file.txt')).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_ROOT' })
    )
  })

  it('resolves workspace root', () => {
    expect(resolveSafePath('workspace', '/repo/README.md')).toBe(
      '/tmp/workspace/repo/README.md'
    )
  })

  it('resolves internal root', () => {
    expect(resolveSafePath('internal', '/Documents')).toBe(
      '/tmp/internal/Documents'
    )
  })
})
