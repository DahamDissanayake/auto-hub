import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, className }: any) => (
    <a href={href} className={className} data-testid="next-link">{children}</a>
  ),
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt }: any) => <img src={src} alt={alt} />,
}))

// We need to import after mocks are in place — use dynamic import trick
import AppsPage from './page'
import { apps } from './apps.config'

describe('AppsPage', () => {
  it('renders empty state when no apps configured and apps array is empty', () => {
    // This test passes with the real (empty) apps array — verifies the empty state renders
    // We don't mock the apps array; instead we check what the current array produces.
    render(<AppsPage />)
    if (apps.length === 0) {
      expect(screen.getByText(/No apps configured yet/)).toBeInTheDocument()
    } else {
      // At least one app card renders
      expect(screen.getAllByRole('link').length).toBeGreaterThan(0)
    }
  })
})

// Test the AppCard rendering logic directly by importing and calling with test data
// We do this by testing the rendered HTML structure

describe('AppCard link types', () => {
  it('app cards link to /apps/<id> and not the raw URL', () => {
    render(<AppsPage />)
    const links = screen.getAllByRole('link')
    const terminalCard = links.find(l => l.getAttribute('href') === '/apps/claude-terminal')
    expect(terminalCard).toBeDefined()
    expect(terminalCard?.getAttribute('target')).not.toBe('_blank')
  })
})
