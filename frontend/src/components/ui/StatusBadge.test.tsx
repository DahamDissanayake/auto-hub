import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from './StatusBadge'

describe('StatusBadge', () => {
  it('renders "success" text', () => {
    render(<StatusBadge status="success" />)
    expect(screen.getByText('success')).toBeInTheDocument()
  })

  it('renders "failed" text', () => {
    render(<StatusBadge status="failed" />)
    expect(screen.getByText('failed')).toBeInTheDocument()
  })

  it('renders "running" text', () => {
    render(<StatusBadge status="running" />)
    expect(screen.getByText('running')).toBeInTheDocument()
  })

  it('applies red color for failed status', () => {
    const { container } = render(<StatusBadge status="failed" />)
    expect(container.firstChild).toHaveClass('text-[#ef4444]')
  })

  it('applies green color for success status', () => {
    const { container } = render(<StatusBadge status="success" />)
    expect(container.firstChild).toHaveClass('text-[#22c55e]')
  })

  it('applies gray color for inactive status', () => {
    const { container } = render(<StatusBadge status="inactive" />)
    expect(container.firstChild).toHaveClass('text-[#6b7280]')
  })
})
