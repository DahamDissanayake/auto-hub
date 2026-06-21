import path from 'path'

function getRoots(): Record<string, string> {
  return {
    internal: process.env.ROOTS_INTERNAL ?? '/roots/internal',
    workspace: process.env.ROOTS_WORKSPACE ?? '/roots/workspace',
    data: process.env.ROOTS_DATA ?? '/roots/data',
  }
}

export function resolveSafePath(root: string, relativePath: string): string {
  const roots = getRoots()
  const rootAbs = roots[root]
  if (!rootAbs) {
    throw Object.assign(new Error(`Unknown root: ${root}`), { code: 'UNKNOWN_ROOT' })
  }
  // Treat relativePath as relative by stripping leading slashes, then join with root
  const stripped = relativePath.replace(/^\/+/, '')
  const resolved = path.normalize(path.join(rootAbs, stripped || '.'))
  if (resolved !== rootAbs && !resolved.startsWith(rootAbs + path.sep)) {
    throw Object.assign(new Error('Path traversal detected'), { code: 'PATH_TRAVERSAL' })
  }
  return resolved
}
