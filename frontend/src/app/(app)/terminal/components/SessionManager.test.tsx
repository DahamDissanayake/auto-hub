import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SessionManager } from './SessionManager'
import api from '@/lib/api'

vi.mock('@/lib/api')

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

describe('SessionManager', () => {
  beforeEach(() => {
    mockApi.get = vi.fn()
    mockApi.delete = vi.fn()
  })

  it('shows empty state when no sessions', async () => {
    mockApi.get.mockResolvedValue({ data: [] })
    render(<SessionManager onOpen={vi.fn()} onNew={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument())
  })

  it('lists sessions with alive indicator', async () => {
    mockApi.get.mockResolvedValue({
      data: [{ name: 'alpha', cwd: '/workspace/data', workspace: 'home',
        repoName: null, alive: true, lastActive: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z' }]
    })
    render(<SessionManager onOpen={vi.fn()} onNew={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /open/i })).toBeInTheDocument()
  })

  it('calls onOpen when Open button is clicked', async () => {
    const session = { name: 'alpha', cwd: '/workspace/data', workspace: 'home' as const,
      repoName: null, alive: true, lastActive: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z' }
    mockApi.get.mockResolvedValue({ data: [session] })
    const onOpen = vi.fn()
    render(<SessionManager onOpen={onOpen} onNew={vi.fn()} />)
    await waitFor(() => fireEvent.click(screen.getByRole('button', { name: /open/i })))
    expect(onOpen).toHaveBeenCalledWith(session)
  })

  it('shows CreateSessionDialog when New Session is clicked', async () => {
    mockApi.get.mockResolvedValue({ data: [] })
    render(<SessionManager onOpen={vi.fn()} onNew={vi.fn()} />)
    await waitFor(() => screen.getByText(/no sessions yet/i))
    fireEvent.click(screen.getByRole('button', { name: /new session/i }))
    expect(screen.getByPlaceholderText(/e.g. auto-hub-dev/i)).toBeInTheDocument()
  })

  it('calls onNew with session name submitted in dialog', async () => {
    mockApi.get.mockResolvedValue({ data: [] })
    const onNew = vi.fn()
    render(<SessionManager onOpen={vi.fn()} onNew={onNew} />)
    await waitFor(() => screen.getByText(/no sessions yet/i))
    fireEvent.click(screen.getByRole('button', { name: /new session/i }))
    fireEvent.change(screen.getByPlaceholderText(/e.g. auto-hub-dev/i), {
      target: { value: 'my-session' },
    })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onNew).toHaveBeenCalledWith('my-session')
  })

  it('shows error state when API fails', async () => {
    mockApi.get.mockRejectedValue(new Error('Network error'))
    render(<SessionManager onOpen={vi.fn()} onNew={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/failed to load/i)).toBeInTheDocument())
  })
})
