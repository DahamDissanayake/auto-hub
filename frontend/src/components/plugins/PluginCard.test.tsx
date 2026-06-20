import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PluginCard from './PluginCard'
import type { Plugin } from '@/lib/types'
import * as usePluginsModule from '@/lib/hooks/usePlugins'
import { ToastProvider } from '@/components/ui/Toast'

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}

const basePlugin: Plugin = {
  id: 'p1', slug: 'test-plugin', name: 'Test Plugin', description: 'A test',
  icon: '⚙️', category: 'utility', version: '1.0.0', entryFile: 'index.js',
  status: 'active', config: {}, configSchema: [], actions: [], requiresPassword: false,
  lastRunAt: null, lastRunStatus: null, createdAt: '2024-01-01', updatedAt: '2024-01-01',
}

describe('PluginCard', () => {
  beforeEach(() => {
    vi.spyOn(usePluginsModule, 'useRunPlugin').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ status: 'success' }),
      isPending: false,
    } as any)
  })

  it('shows "Run now" button when plugin has no actions', () => {
    render(<Wrapper><PluginCard plugin={basePlugin} /></Wrapper>)
    expect(screen.getByRole('button', { name: /run now/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reboot/i })).not.toBeInTheDocument()
  })

  it('hides "Run now" and shows action buttons when plugin.actions is non-empty', () => {
    const plugin: Plugin = {
      ...basePlugin,
      actions: [
        { key: 'reboot', label: 'Reboot', danger: true },
        { key: 'shutdown', label: 'Shutdown', danger: true },
      ],
      requiresPassword: true,
    }
    render(<Wrapper><PluginCard plugin={plugin} /></Wrapper>)
    expect(screen.queryByRole('button', { name: /run now/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Reboot$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Shutdown$/i })).toBeInTheDocument()
  })

  it('opens ActionConfirmModal when an action button is clicked', () => {
    const plugin: Plugin = {
      ...basePlugin,
      actions: [{ key: 'reboot', label: 'Reboot', danger: true }],
      requiresPassword: true,
    }
    render(<Wrapper><PluginCard plugin={plugin} /></Wrapper>)
    fireEvent.click(screen.getByRole('button', { name: /^Reboot$/i }))
    expect(screen.getByRole('heading', { name: /Reboot Pi\?/i })).toBeInTheDocument()
  })

  it('applies red style to danger action buttons', () => {
    const plugin: Plugin = {
      ...basePlugin,
      actions: [{ key: 'reboot', label: 'Reboot', danger: true }],
    }
    render(<Wrapper><PluginCard plugin={plugin} /></Wrapper>)
    const btn = screen.getByRole('button', { name: /^Reboot$/i })
    expect(btn.className).toContain('bg-[#ef4444]')
  })
})
