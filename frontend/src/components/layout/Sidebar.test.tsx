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

import Sidebar from './Sidebar'
import { usePathname, useRouter } from 'next/navigation'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(usePathname).mockReturnValue('/')
    vi.mocked(useRouter).mockReturnValue({ replace: vi.fn() } as any)
  })

  it('renders AutoHub logo', () => {
    render(<Sidebar />)
    expect(screen.getByText('⚡ AutoHub')).toBeInTheDocument()
  })

  it('renders all navigation items', () => {
    render(<Sidebar />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Plugins')).toBeInTheDocument()
    expect(screen.getByText('Schedules')).toBeInTheDocument()
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    expect(screen.getByText('n8n Workflows')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('applies active style to current path link', () => {
    vi.mocked(usePathname).mockReturnValue('/plugins')
    render(<Sidebar />)
    const pluginsLink = screen.getByText('Plugins').closest('a')
    expect(pluginsLink).toHaveClass('text-[#3b82f6]')
  })

  it('clears localStorage and redirects on logout', async () => {
    const mockReplace = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ replace: mockReplace } as any)
    localStorage.setItem('autohub_token', 'test-token')
    render(<Sidebar />)
    await userEvent.click(screen.getByTestId('logout-button'))
    expect(localStorage.getItem('autohub_token')).toBeNull()
    expect(mockReplace).toHaveBeenCalledWith('/login')
  })
})
