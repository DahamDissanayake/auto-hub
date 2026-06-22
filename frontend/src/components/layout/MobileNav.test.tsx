import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({ replace: vi.fn() })),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: any) => <img src={src} alt={alt} />,
}))

vi.mock('@/lib/hooks/useRecentApps', () => ({
  useRecentApps: vi.fn(() => []),
}))

import { MobileNav } from './MobileNav'
import { usePathname } from 'next/navigation'
import { useRecentApps } from '@/lib/hooks/useRecentApps'

describe('MobileNav', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/')
    vi.mocked(useRecentApps).mockReturnValue([])
  })

  it('renders main nav items (excluding Settings)', () => {
    render(<MobileNav open={true} onClose={vi.fn()} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Apps')).toBeInTheDocument()
    expect(screen.getByText('n8n Workflows')).toBeInTheDocument()
  })

  it('renders Settings in the bottom section alongside Logout', () => {
    render(<MobileNav open={true} onClose={vi.fn()} />)
    const settings = screen.getByText('Settings')
    const logout = screen.getByText('Logout')
    // Both must be inside the same footer div (border-t section)
    expect(settings.closest('[class*="border-t"]')).toBe(logout.closest('[class*="border-t"]'))
  })

  it('Settings is NOT in the main scrollable nav list', () => {
    render(<MobileNav open={true} onClose={vi.fn()} />)
    const settings = screen.getByText('Settings')
    // Must not be inside the <nav> element
    expect(settings.closest('nav')).toBeNull()
  })

  it('shows recent apps sub-list under Apps when visits exist', () => {
    vi.mocked(useRecentApps).mockReturnValue([
      { id: 'files', name: 'Files', description: '', url: '/files', color: '#f59e0b' },
      { id: 'claude-terminal', name: 'Code Terminal', description: '', url: '/terminal', color: '#10b981' },
    ])
    render(<MobileNav open={true} onClose={vi.fn()} />)
    expect(screen.getByText('Files')).toBeInTheDocument()
    expect(screen.getByText('Code Terminal')).toBeInTheDocument()
  })

  it('shows no recent apps sub-list when no visits recorded', () => {
    vi.mocked(useRecentApps).mockReturnValue([])
    render(<MobileNav open={true} onClose={vi.fn()} />)
    // Only the main "Apps" nav link should be present; no app names below it
    expect(screen.queryByText('Files')).not.toBeInTheDocument()
  })

  it('recent app links point to /apps/[id]', () => {
    vi.mocked(useRecentApps).mockReturnValue([
      { id: 'files', name: 'Files', description: '', url: '/files', color: '#f59e0b' },
    ])
    render(<MobileNav open={true} onClose={vi.fn()} />)
    const link = screen.getByText('Files').closest('a')
    expect(link).toHaveAttribute('href', '/apps/files')
  })
})
