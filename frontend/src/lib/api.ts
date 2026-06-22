import axios from 'axios'

let accessJwt: string | null = null

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('autohub_session') ?? sessionStorage.getItem('autohub_session') ?? null
}

export function setAccessJwt(token: string | null): void {
  accessJwt = token
}

export function getAccessJwt(): string | null {
  return accessJwt
}

export function clearAuth(): void {
  accessJwt = null
  if (typeof window === 'undefined') return
  localStorage.removeItem('autohub_session')
  localStorage.removeItem('autohub_device')
  sessionStorage.removeItem('autohub_session')
}

export async function refreshAuth(): Promise<boolean> {
  const sessionToken = getSessionToken()
  if (!sessionToken) return false
  try {
    const base = process.env.NEXT_PUBLIC_API_URL ?? ''
    const { data } = await axios.post(`${base}/api/auth/refresh`, { sessionToken })
    setAccessJwt(data.accessJwt)
    return true
  } catch {
    return false
  }
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? '',
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined' && accessJwt) {
    config.headers.Authorization = `Bearer ${accessJwt}`
  }
  return config
})

let isRefreshing = false
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = []

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original._retry) return Promise.reject(error)

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`
            resolve(api(original))
          },
          reject,
        })
      })
    }

    original._retry = true
    isRefreshing = true

    const ok = await refreshAuth()
    isRefreshing = false

    if (ok && accessJwt) {
      refreshQueue.forEach(({ resolve }) => resolve(accessJwt!))
      refreshQueue = []
      original.headers.Authorization = `Bearer ${accessJwt}`
      return api(original)
    }

    refreshQueue.forEach(({ reject }) => reject(new Error('Session expired')))
    refreshQueue = []
    clearAuth()
    if (typeof window !== 'undefined') window.location.href = '/login'
    return Promise.reject(error)
  },
)

export default api
