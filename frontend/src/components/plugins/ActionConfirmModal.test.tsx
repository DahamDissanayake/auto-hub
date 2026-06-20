import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ActionConfirmModal from './ActionConfirmModal'
import type { PluginAction } from '@/lib/types'
import * as usePluginsModule from '@/lib/hooks/usePlugins'
import { ToastProvider } from '@/components/ui/Toast'

const rebootAction: PluginAction = { key: 'reboot', label: 'Reboot', danger: true }

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}

describe('ActionConfirmModal', () => {
  it('renders action label in heading', () => {
    vi.spyOn(usePluginsModule, 'useRunPlugin').mockReturnValue({
      mutateAsync: vi.fn(), isPending: false,
    } as any)
    render(
      <Wrapper>
        <ActionConfirmModal pluginId="p1" action={rebootAction} onClose={() => {}} />
      </Wrapper>
    )
    expect(screen.getByRole('heading', { name: /Reboot Pi\?/i })).toBeInTheDocument()
  })

  it('shows warning text', () => {
    vi.spyOn(usePluginsModule, 'useRunPlugin').mockReturnValue({
      mutateAsync: vi.fn(), isPending: false,
    } as any)
    render(
      <Wrapper>
        <ActionConfirmModal pluginId="p1" action={rebootAction} onClose={() => {}} />
      </Wrapper>
    )
    expect(screen.getByText(/immediately restart the host/i)).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', () => {
    vi.spyOn(usePluginsModule, 'useRunPlugin').mockReturnValue({
      mutateAsync: vi.fn(), isPending: false,
    } as any)
    const onClose = vi.fn()
    render(
      <Wrapper>
        <ActionConfirmModal pluginId="p1" action={rebootAction} onClose={onClose} />
      </Wrapper>
    )
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls mutateAsync with pluginId, action key, and password on confirm', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ status: 'success' })
    vi.spyOn(usePluginsModule, 'useRunPlugin').mockReturnValue({
      mutateAsync, isPending: false,
    } as any)
    render(
      <Wrapper>
        <ActionConfirmModal pluginId="p1" action={rebootAction} onClose={() => {}} />
      </Wrapper>
    )
    fireEvent.change(screen.getByPlaceholderText(/dashboard password/i), {
      target: { value: 'mysecret' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Reboot$/i }))
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        id: 'p1',
        action: 'reboot',
        password: 'mysecret',
      })
    })
  })

  it('shows inline "Wrong password" error on 403 response', async () => {
    const mutateAsync = vi.fn().mockRejectedValue({
      response: { status: 403, data: { error: 'Invalid password' } },
    })
    vi.spyOn(usePluginsModule, 'useRunPlugin').mockReturnValue({
      mutateAsync, isPending: false,
    } as any)
    render(
      <Wrapper>
        <ActionConfirmModal pluginId="p1" action={rebootAction} onClose={() => {}} />
      </Wrapper>
    )
    fireEvent.change(screen.getByPlaceholderText(/dashboard password/i), {
      target: { value: 'wrong' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Reboot$/i }))
    await waitFor(() => {
      expect(screen.getByText(/wrong password/i)).toBeInTheDocument()
    })
  })
})
