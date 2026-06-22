import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({ replace: vi.fn() })),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, className }: any) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

vi.mock('@/lib/hooks/useRecentApps', () => ({
  useRecentApps: vi.fn(() => []),
}))

import Sidebar from './Sidebar'
import { usePathname, useRouter } from 'next/navigation'
import { useRecentApps } from '@/lib/hooks/useRecentApps'

// Mock sessionStorage (app uses sessionStorage for autohub_token everywhere)
const sessionStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock, writable: true })

describe('Sidebar', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.mocked(usePathname).mockReturnValue('/')
    vi.mocked(useRouter).mockReturnValue({ replace: vi.fn() } as any)
  })

  it('renders AutoHub branding', () => {
    render(<Sidebar />)
    expect(screen.getByText('AutoHub')).toBeInTheDocument()
  })

  it('renders all navigation items', () => {
    render(<Sidebar />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Shortcuts')).toBeInTheDocument()
    expect(screen.getByText('Apps')).toBeInTheDocument()
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    expect(screen.getByText('n8n Workflows')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.queryByText('Schedules')).not.toBeInTheDocument()
  })

  it('applies active style to current path link', () => {
    vi.mocked(usePathname).mockReturnValue('/plugins')
    render(<Sidebar />)
    const pluginsLink = screen.getByText('Shortcuts').closest('a')
    expect(pluginsLink).toHaveClass('text-[#3b82f6]')
  })

  it('clears sessionStorage and redirects on logout', async () => {
    const mockReplace = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ replace: mockReplace } as any)
    sessionStorage.setItem('autohub_token', 'test-token')
    render(<Sidebar />)
    await userEvent.click(screen.getByTestId('logout-button'))
    expect(sessionStorage.getItem('autohub_token')).toBeNull()
    expect(mockReplace).toHaveBeenCalledWith('/login')
  })

  it('has hidden md:flex classes for responsive visibility', () => {
    render(<Sidebar />)
    const aside = screen.getByRole('complementary')
    expect(aside.className).toContain('hidden')
    expect(aside.className).toContain('md:flex')
  })

  it('shows recent apps sub-list under Apps when visits exist', () => {
    vi.mocked(useRecentApps).mockReturnValue([
      { id: 'files', name: 'Files', description: '', url: '/files', color: '#f59e0b' },
      { id: 'claude-terminal', name: 'Code Terminal', description: '', url: '/terminal', color: '#10b981' },
    ])
    render(<Sidebar />)
    const filesLink = screen.getByText('Files').closest('a')
    expect(filesLink).toHaveAttribute('href', '/apps/files')
    expect(screen.getByText('Code Terminal')).toBeInTheDocument()
  })
})
