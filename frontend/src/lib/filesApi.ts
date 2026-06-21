const BASE = '/files-api'

function getToken(): string {
  if (typeof window === 'undefined') return ''
  return sessionStorage.getItem('autohub_token') ?? ''
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${getToken()}` }
}

function handleUnauth(res: Response): void {
  if (res.status === 401 && typeof window !== 'undefined') {
    sessionStorage.removeItem('autohub_token')
    window.location.href = '/login'
  }
}

export interface DirEntry {
  name: string
  type: 'file' | 'dir'
  size: number
  modified: string
}

export interface ListResult {
  path: string
  entries: DirEntry[]
}

export async function apiLs(root: string, path: string): Promise<ListResult> {
  const res = await fetch(
    `${BASE}/ls?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`,
    { headers: authHeaders() }
  )
  handleUnauth(res)
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText)
  return res.json()
}

export async function apiMkdir(root: string, path: string): Promise<void> {
  const res = await fetch(`${BASE}/mkdir`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ root, path }),
  })
  handleUnauth(res)
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText)
}

export async function apiRename(root: string, from: string, to: string): Promise<void> {
  const res = await fetch(`${BASE}/rename`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ root, from, to }),
  })
  handleUnauth(res)
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText)
}

export async function apiDelete(root: string, path: string): Promise<void> {
  const res = await fetch(`${BASE}/delete`, {
    method: 'DELETE',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ root, path }),
  })
  handleUnauth(res)
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText)
}

export async function apiDownload(root: string, path: string, filename: string): Promise<void> {
  const token = getToken()
  // Use a direct URL with token as query param — avoids buffering the file in RAM
  const url = `${BASE}/download?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export async function apiUpload(
  root: string,
  path: string,
  transferId: string,
  files: File[],
  signal: AbortSignal,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    files.forEach((f) => formData.append('file', f))

    const xhr = new XMLHttpRequest()

    xhr.upload.onprogress = (e) => {
      if (onProgress) onProgress(e.loaded, e.total)
    }

    xhr.onload = () => {
      if (xhr.status === 401) {
        sessionStorage.removeItem('autohub_token')
        window.location.href = '/login'
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        try {
          const body = JSON.parse(xhr.responseText)
          reject(new Error(body.error ?? xhr.statusText))
        } catch {
          reject(new Error(xhr.statusText))
        }
      }
    }

    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.ontimeout = () => reject(new Error('Upload timed out'))

    signal.addEventListener('abort', () => {
      xhr.abort()
      reject(new DOMException('Aborted', 'AbortError'))
    })

    xhr.open(
      'POST',
      `${BASE}/upload?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}&transferId=${encodeURIComponent(transferId)}`
    )
    xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`)
    xhr.send(formData)
  })
}
