import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkspacePicker } from './WorkspacePicker'

describe('WorkspacePicker', () => {
  it('renders all three workspace options', () => {
    render(<WorkspacePicker onSelect={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('Data Storage')).toBeInTheDocument()
    expect(screen.getByText('GitHub Repos')).toBeInTheDocument()
    expect(screen.getByText('Auto-Hub')).toBeInTheDocument()
  })

  it('calls onSelect with "home" when Data Storage is clicked', () => {
    const onSelect = vi.fn()
    render(<WorkspacePicker onSelect={onSelect} onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('Data Storage'))
    expect(onSelect).toHaveBeenCalledWith('home')
  })

  it('calls onSelect with "github" when GitHub Repos is clicked', () => {
    const onSelect = vi.fn()
    render(<WorkspacePicker onSelect={onSelect} onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('GitHub Repos'))
    expect(onSelect).toHaveBeenCalledWith('github')
  })

  it('calls onSelect with "auto-hub" when Auto-Hub is clicked', () => {
    const onSelect = vi.fn()
    render(<WorkspacePicker onSelect={onSelect} onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('Auto-Hub'))
    expect(onSelect).toHaveBeenCalledWith('auto-hub')
  })

  it('calls onBack when Back button is clicked', () => {
    const onBack = vi.fn()
    render(<WorkspacePicker onSelect={vi.fn()} onBack={onBack} />)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalled()
  })
})
