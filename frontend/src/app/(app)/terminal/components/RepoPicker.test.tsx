import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RepoPicker } from './RepoPicker'

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn() },
}))

import api from '@/lib/api'

describe('RepoPicker', () => {
  const onSelect = vi.fn()
  const onClone = vi.fn()
  const onBack = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('shows loading state initially', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(<RepoPicker onSelect={onSelect} onClone={onClone} onBack={onBack} />)
    expect(screen.getByText('Loading repos...')).toBeInTheDocument()
  })

  it('renders repo list with git badge on success', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [{ name: 'auto-hub', path: '/workspace/github/auto-hub', isGitRepo: true }],
    })
    render(<RepoPicker onSelect={onSelect} onClone={onClone} onBack={onBack} />)
    await waitFor(() => expect(screen.getByText('auto-hub')).toBeInTheDocument())
    expect(screen.getByText('git')).toBeInTheDocument()
  })

  it('shows empty state when no repos exist', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    render(<RepoPicker onSelect={onSelect} onClone={onClone} onBack={onBack} />)
    await waitFor(() => expect(screen.getByText('No repos cloned yet')).toBeInTheDocument())
  })

  it('calls onSelect with repo object when repo card is clicked', async () => {
    const repo = { name: 'auto-hub', path: '/workspace/github/auto-hub', isGitRepo: true }
    vi.mocked(api.get).mockResolvedValue({ data: [repo] })
    render(<RepoPicker onSelect={onSelect} onClone={onClone} onBack={onBack} />)
    await waitFor(() => fireEvent.click(screen.getByText('auto-hub')))
    expect(onSelect).toHaveBeenCalledWith(repo)
  })

  it('calls onClone when Clone Repo button is clicked', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    render(<RepoPicker onSelect={onSelect} onClone={onClone} onBack={onBack} />)
    await waitFor(() => fireEvent.click(screen.getByText('Clone Repo')))
    expect(onClone).toHaveBeenCalled()
  })

  it('calls onBack when back button is clicked', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(<RepoPicker onSelect={onSelect} onClone={onClone} onBack={onBack} />)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows error message when api call fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'))
    render(<RepoPicker onSelect={onSelect} onClone={onClone} onBack={onBack} />)
    await waitFor(() => expect(screen.getByText('Failed to load repos')).toBeInTheDocument())
  })
})
