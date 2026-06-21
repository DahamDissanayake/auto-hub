import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Trash2 } from 'lucide-react'
import { SlideToConfirm } from './SlideToConfirm'

const defaultProps = {
  onConfirm: vi.fn(),
  label: 'end',
  triggerAriaLabel: 'End session',
  triggerContent: <Trash2 size={13} />,
  triggerClassName: 'p-1 text-[#6b7280]',
}

describe('SlideToConfirm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the trigger button in idle state', () => {
    render(<SlideToConfirm {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'End session' })).toBeInTheDocument()
    expect(screen.queryByText(/slide to/i)).not.toBeInTheDocument()
  })

  it('shows the slide track when trigger is clicked', () => {
    render(<SlideToConfirm {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))
    expect(screen.getByText('slide to end →')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'End session' })).not.toBeInTheDocument()
  })

  it('resets to idle when clicked outside the track', () => {
    render(
      <div>
        <SlideToConfirm {...defaultProps} />
        <button>outside</button>
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))
    expect(screen.getByText('slide to end →')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByText(/slide to/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'End session' })).toBeInTheDocument()
  })

  it('auto-resets after 4 seconds without interaction', () => {
    vi.useFakeTimers()
    render(<SlideToConfirm {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))
    expect(screen.getByText('slide to end →')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(4000) })
    expect(screen.queryByText(/slide to/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'End session' })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('calls onConfirm and resets when dragged to full width', () => {
    vi.useFakeTimers()
    const onConfirm = vi.fn()
    const props = {
      ...defaultProps,
      onConfirm,
    }
    render(<SlideToConfirm {...props} />)

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'End session' }))
    })

    const thumb = screen.getByRole('slider') as HTMLElement
    const track = thumb.parentElement as HTMLElement

    // Mock track.getBoundingClientRect
    Object.defineProperty(track, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 140 }),
      configurable: true,
    })

    // Simulate drag: start at 14px, drag to 140px (exceeds 95% threshold)
    act(() => {
      const evt = new MouseEvent('pointerdown', { bubbles: true })
      Object.defineProperty(evt, 'clientX', { value: 14, enumerable: true })
      Object.defineProperty(evt, 'pointerId', { value: 1, enumerable: true })
      thumb.dispatchEvent(evt)
    })

    // Move partway
    act(() => {
      const evt = new MouseEvent('pointermove', { bubbles: true })
      Object.defineProperty(evt, 'clientX', { value: 70, enumerable: true })
      Object.defineProperty(evt, 'pointerId', { value: 1, enumerable: true })
      track.dispatchEvent(evt)
    })

    // Move to end
    act(() => {
      const evt = new MouseEvent('pointermove', { bubbles: true })
      Object.defineProperty(evt, 'clientX', { value: 140, enumerable: true })
      Object.defineProperty(evt, 'pointerId', { value: 1, enumerable: true })
      track.dispatchEvent(evt)
    })

    act(() => {
      const evt = new MouseEvent('pointerup', { bubbles: true })
      Object.defineProperty(evt, 'clientX', { value: 140, enumerable: true })
      Object.defineProperty(evt, 'pointerId', { value: 1, enumerable: true })
      track.dispatchEvent(evt)
    })

    // Wait for the confirmation timeout
    act(() => { vi.advanceTimersByTime(200) })

    expect(onConfirm).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('does not call onConfirm and resets when released early (< 95%)', () => {
    render(<SlideToConfirm {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))

    const thumb = screen.getByRole('slider') as HTMLElement
    const track = thumb.parentElement as HTMLElement

    // Mock track.getBoundingClientRect
    Object.defineProperty(track, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 140 }),
      configurable: true,
    })

    act(() => {
      const evt = new MouseEvent('pointerdown', { bubbles: true })
      Object.defineProperty(evt, 'clientX', { value: 14, enumerable: true })
      Object.defineProperty(evt, 'pointerId', { value: 1, enumerable: true })
      thumb.dispatchEvent(evt)
    })

    act(() => {
      const evt = new MouseEvent('pointermove', { bubbles: true })
      Object.defineProperty(evt, 'clientX', { value: 80, enumerable: true })
      Object.defineProperty(evt, 'pointerId', { value: 1, enumerable: true })
      track.dispatchEvent(evt)
    })

    act(() => {
      const evt = new MouseEvent('pointerup', { bubbles: true })
      Object.defineProperty(evt, 'clientX', { value: 80, enumerable: true })
      Object.defineProperty(evt, 'pointerId', { value: 1, enumerable: true })
      track.dispatchEvent(evt)
    })

    expect(defaultProps.onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'End session' })).toBeInTheDocument()
  })

  it('stopPropagation prevents parent click when track is visible', () => {
    const parentClick = vi.fn()
    render(
      <div onClick={parentClick}>
        <SlideToConfirm {...defaultProps} />
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))
    // Clicking anywhere on the track area should not bubble to parent
    fireEvent.click(screen.getByText('slide to end →'))
    expect(parentClick).not.toHaveBeenCalled()
  })
})
