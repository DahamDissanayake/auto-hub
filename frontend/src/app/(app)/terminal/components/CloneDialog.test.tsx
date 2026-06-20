import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CloneDialog } from './CloneDialog'

vi.mock('@/lib/api', () => ({
  default: { post: vi.fn() },
}))

import api from '@/lib/api'

describe('CloneDialog', () => {
  const onSuccess = vi.fn()
  const onBack = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('renders URL input and disabled Clone button initially', () => {
    render(<CloneDialog onSuccess={onSuccess} onBack={onBack} />)
    expect(screen.getByPlaceholderText('https://github.com/user/repo')).toBeInTheDocument()
    expect(screen.getByText('Clone')).toBeDisabled()
  })

  it('enables Clone button when URL is entered', () => {
    render(<CloneDialog onSuccess={onSuccess} onBack={onBack} />)
    fireEvent.change(screen.getByPlaceholderText('https://github.com/user/repo'), {
      target: { value: 'https://github.com/user/my-repo' },
    })
    expect(screen.getByText('Clone')).not.toBeDisabled()
  })

  it('calls onSuccess with path and derived repo name on success', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { path: '/workspace/github/my-repo' } })
    render(<CloneDialog onSuccess={onSuccess} onBack={onBack} />)

    fireEvent.change(screen.getByPlaceholderText('https://github.com/user/repo'), {
      target: { value: 'https://github.com/user/my-repo' },
    })
    fireEvent.click(screen.getByText('Clone'))

    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith('/workspace/github/my-repo', 'my-repo')
    )
  })

  it('uses explicit name when provided', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { path: '/workspace/github/custom' } })
    render(<CloneDialog onSuccess={onSuccess} onBack={onBack} />)

    fireEvent.change(screen.getByPlaceholderText('https://github.com/user/repo'), {
      target: { value: 'https://github.com/user/my-repo' },
    })
    fireEvent.change(screen.getByPlaceholderText(/auto-derived/), {
      target: { value: 'custom' },
    })
    fireEvent.click(screen.getByText('Clone'))

    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith('/workspace/github/custom', 'custom')
    )
    expect(vi.mocked(api.post).mock.calls[0][1]).toMatchObject({ name: 'custom' })
  })

  it('shows error message on clone failure', async () => {
    vi.mocked(api.post).mockRejectedValue({
      response: { data: { error: 'Repository not found' } },
    })
    render(<CloneDialog onSuccess={onSuccess} onBack={onBack} />)

    fireEvent.change(screen.getByPlaceholderText('https://github.com/user/repo'), {
      target: { value: 'https://github.com/user/bad-repo' },
    })
    fireEvent.click(screen.getByText('Clone'))

    await waitFor(() =>
      expect(screen.getByText('Repository not found')).toBeInTheDocument()
    )
  })

  it('calls onBack when back button is clicked', () => {
    render(<CloneDialog onSuccess={onSuccess} onBack={onBack} />)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalled()
  })
})
