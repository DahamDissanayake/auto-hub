import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider, useToast } from './Toast'

function ToastTrigger({ type }: { type: 'success' | 'error' | 'info' }) {
  const toast = useToast()
  return (
    <button onClick={() => toast[type](`Test ${type} message`)}>
      Show {type}
    </button>
  )
}

describe('Toast', () => {
  it('shows toast on success call', async () => {
    const { getByText } = render(
      <ToastProvider>
        <ToastTrigger type="success" />
      </ToastProvider>,
    )
    act(() => getByText('Show success').click())
    expect(screen.getByText('Test success message')).toBeInTheDocument()
  })

  it('shows toast on error call', async () => {
    const { getByText } = render(
      <ToastProvider>
        <ToastTrigger type="error" />
      </ToastProvider>,
    )
    act(() => getByText('Show error').click())
    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })

  it('auto-dismisses toast after 4 seconds', async () => {
    vi.useFakeTimers()
    const { getByText } = render(
      <ToastProvider>
        <ToastTrigger type="info" />
      </ToastProvider>,
    )
    act(() => getByText('Show info').click())
    expect(screen.getByText('Test info message')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(4100))
    expect(screen.queryByText('Test info message')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
