import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className, 'aria-current': ariaCurrent }: any) => (
    <a href={href} className={className} aria-current={ariaCurrent}>{children}</a>
  ),
}))

import BottomNav from './BottomNav'
import { usePathname } from 'next/navigation'

describe('BottomNav', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/')
  })

  it('renders all 5 nav items', () => {
    render(<BottomNav />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Plugins')).toBeInTheDocument()
    expect(screen.getByText('Schedules')).toBeInTheDocument()
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    expect(screen.getByText('n8n')).toBeInTheDocument()
  })

  it('applies active colour to current path item', () => {
    vi.mocked(usePathname).mockReturnValue('/plugins')
    render(<BottomNav />)
    const pluginsLink = screen.getByText('Plugins').closest('a')
    expect(pluginsLink?.className).toContain('text-[#3b82f6]')
  })

  it('applies inactive colour to non-current items', () => {
    vi.mocked(usePathname).mockReturnValue('/plugins')
    render(<BottomNav />)
    const dashLink = screen.getByText('Dashboard').closest('a')
    expect(dashLink?.className).toContain('text-[#6b7280]')
  })

  it('has flex md:hidden classes for responsive visibility', () => {
    render(<BottomNav />)
    const nav = screen.getByRole('navigation', { name: 'Mobile navigation' })
    expect(nav.className).toContain('flex')
    expect(nav.className).toContain('md:hidden')
  })

  it('sets aria-current on active item', () => {
    vi.mocked(usePathname).mockReturnValue('/schedules')
    render(<BottomNav />)
    const activeLink = screen.getByText('Schedules').closest('a')
    expect(activeLink).toHaveAttribute('aria-current', 'page')
    const inactiveLink = screen.getByText('Dashboard').closest('a')
    expect(inactiveLink).not.toHaveAttribute('aria-current')
  })
})
