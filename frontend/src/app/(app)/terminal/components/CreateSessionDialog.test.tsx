import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CreateSessionDialog } from './CreateSessionDialog'

describe('CreateSessionDialog', () => {
  it('renders name input and submit button', () => {
    render(<CreateSessionDialog onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByPlaceholderText(/e.g. auto-hub-dev/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })

  it('calls onSubmit with trimmed name on form submit', () => {
    const onSubmit = vi.fn()
    render(<CreateSessionDialog onSubmit={onSubmit} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/e.g. auto-hub-dev/i), {
      target: { value: '  my-session  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onSubmit).toHaveBeenCalledWith('my-session')
  })

  it('shows error when name is empty', () => {
    render(<CreateSessionDialog onSubmit={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/required/i)).toBeInTheDocument()
  })

  it('shows error when name contains invalid characters', () => {
    render(<CreateSessionDialog onSubmit={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/e.g. auto-hub-dev/i), {
      target: { value: 'bad/name' },
    })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/only letters/i)).toBeInTheDocument()
  })

  it('calls onCancel when Back button is clicked', () => {
    const onCancel = vi.fn()
    render(<CreateSessionDialog onSubmit={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(onCancel).toHaveBeenCalled()
  })
})
