'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/api/auth/login', { password })
      localStorage.setItem('autohub_token', data.access_token)
      router.replace('/')
    } catch {
      setError('Invalid password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-8">
          <div className="text-center mb-8">
            <span className="text-3xl">⚡</span>
            <h1 className="text-white font-semibold text-xl mt-2">AutoHub</h1>
            <p className="text-[#6b7280] text-sm mt-1">Personal Automation OS</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm text-[#9ca3af] mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-[#f1f1f1] text-sm focus:outline-none focus:border-[#3b82f6] transition-colors"
              />
            </div>

            {error && (
              <p className="text-[#ef4444] text-sm" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#3b82f6] text-white py-2 rounded-md text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Logging in…' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
