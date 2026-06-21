import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionTabs } from './SessionTabs'

vi.mock('./SlideToConfirm', () => ({
  SlideToConfirm: ({ onConfirm, triggerAriaLabel }: { onConfirm: () => void; triggerAriaLabel: string }) => (
    <button aria-label={triggerAriaLabel} onClick={e => { e.stopPropagation(); onConfirm() }} />
  ),
}))

const tabs = [
  { name: 'alpha', workspace: 'home' as const, repoName: null },
  { name: 'beta', workspace: 'github' as const, repoName: 'my-repo' },
]

describe('SessionTabs', () => {
  it('renders tab names', () => {
    render(<SessionTabs tabs={tabs} activeTab="alpha" onSwitch={vi.fn()} onEnd={vi.fn()} onNew={vi.fn()} />)
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
  })

  it('calls onSwitch when a non-active tab is clicked', () => {
    const onSwitch = vi.fn()
    render(<SessionTabs tabs={tabs} activeTab="alpha" onSwitch={onSwitch} onEnd={vi.fn()} onNew={vi.fn()} />)
    fireEvent.click(screen.getByText('beta'))
    expect(onSwitch).toHaveBeenCalledWith('beta')
  })

  it('calls onEnd when the close button of a tab is clicked', () => {
    const onEnd = vi.fn()
    render(<SessionTabs tabs={tabs} activeTab="alpha" onSwitch={vi.fn()} onEnd={onEnd} onNew={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Close alpha'))
    expect(onEnd).toHaveBeenCalledWith('alpha')
  })

  it('calls onNew when the + button is clicked', () => {
    const onNew = vi.fn()
    render(<SessionTabs tabs={tabs} activeTab="alpha" onSwitch={vi.fn()} onEnd={vi.fn()} onNew={onNew} />)
    fireEvent.click(screen.getByLabelText('New or existing session'))
    expect(onNew).toHaveBeenCalled()
  })
})
