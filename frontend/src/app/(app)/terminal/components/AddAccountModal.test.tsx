import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddAccountModal } from './AddAccountModal'

describe('AddAccountModal', () => {
  const startLogin = vi.fn()
  const completeLogin = vi.fn()
  const onClose = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('shows name input and disabled Get link button on first step', () => {
    render(<AddAccountModal onClose={onClose} onSuccess={onSuccess} startLogin={startLogin} completeLogin={completeLogin} />)
    expect(screen.getByPlaceholderText('work')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /get link/i })).toBeDisabled()
  })

  it('enables Get link button when name is valid', () => {
    render(<AddAccountModal onClose={onClose} onSuccess={onSuccess} startLogin={startLogin} completeLogin={completeLogin} />)
    fireEvent.change(screen.getByPlaceholderText('work'), { target: { value: 'mywork' } })
    expect(screen.getByRole('button', { name: /get link/i })).not.toBeDisabled()
  })

  it('keeps Get link disabled for names with spaces or special chars', () => {
    render(<AddAccountModal onClose={onClose} onSuccess={onSuccess} startLogin={startLogin} completeLogin={completeLogin} />)
    fireEvent.change(screen.getByPlaceholderText('work'), { target: { value: 'bad name!' } })
    expect(screen.getByRole('button', { name: /get link/i })).toBeDisabled()
  })

  it('calls startLogin and shows URL in step 2', async () => {
    startLogin.mockResolvedValue({ sessionId: 'abc', url: 'https://claude.ai/oauth?test=1' })
    render(<AddAccountModal onClose={onClose} onSuccess={onSuccess} startLogin={startLogin} completeLogin={completeLogin} />)
    fireEvent.change(screen.getByPlaceholderText('work'), { target: { value: 'mywork' } })
    fireEvent.click(screen.getByRole('button', { name: /get link/i }))
    await waitFor(() => expect(screen.getByDisplayValue('https://claude.ai/oauth?test=1')).toBeInTheDocument())
    expect(startLogin).toHaveBeenCalledWith('mywork')
  })

  it('shows code input after clicking authorized button', async () => {
    startLogin.mockResolvedValue({ sessionId: 'abc', url: 'https://claude.ai/oauth' })
    render(<AddAccountModal onClose={onClose} onSuccess={onSuccess} startLogin={startLogin} completeLogin={completeLogin} />)
    fireEvent.change(screen.getByPlaceholderText('work'), { target: { value: 'mywork' } })
    fireEvent.click(screen.getByRole('button', { name: /get link/i }))
    await waitFor(() => screen.getByDisplayValue('https://claude.ai/oauth'))
    fireEvent.click(screen.getByRole('button', { name: /paste code/i }))
    expect(screen.getByPlaceholderText(/paste code here/i)).toBeInTheDocument()
  })

  it('calls completeLogin and onSuccess after pasting code and clicking Verify', async () => {
    startLogin.mockResolvedValue({ sessionId: 'abc', url: 'https://claude.ai/oauth' })
    completeLogin.mockResolvedValue(undefined)
    render(<AddAccountModal onClose={onClose} onSuccess={onSuccess} startLogin={startLogin} completeLogin={completeLogin} />)
    fireEvent.change(screen.getByPlaceholderText('work'), { target: { value: 'mywork' } })
    fireEvent.click(screen.getByRole('button', { name: /get link/i }))
    await waitFor(() => screen.getByDisplayValue('https://claude.ai/oauth'))
    fireEvent.click(screen.getByRole('button', { name: /paste code/i }))
    fireEvent.change(screen.getByPlaceholderText(/paste code here/i), { target: { value: 'auth-code-123' } })
    fireEvent.click(screen.getByRole('button', { name: /^verify$/i }))
    await waitFor(() => expect(completeLogin).toHaveBeenCalledWith('abc', 'auth-code-123'))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it('shows error message when startLogin fails', async () => {
    startLogin.mockRejectedValue({ response: { data: { message: 'Profile already exists' } } })
    render(<AddAccountModal onClose={onClose} onSuccess={onSuccess} startLogin={startLogin} completeLogin={completeLogin} />)
    fireEvent.change(screen.getByPlaceholderText('work'), { target: { value: 'mywork' } })
    fireEvent.click(screen.getByRole('button', { name: /get link/i }))
    await waitFor(() => expect(screen.getByText('Profile already exists')).toBeInTheDocument())
  })

  it('calls onClose when X button is clicked', () => {
    render(<AddAccountModal onClose={onClose} onSuccess={onSuccess} startLogin={startLogin} completeLogin={completeLogin} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
