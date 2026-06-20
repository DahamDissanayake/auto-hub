import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkspacePicker } from './WorkspacePicker'

describe('WorkspacePicker', () => {
  it('renders Home and GitHub Repos options', () => {
    render(<WorkspacePicker onSelect={vi.fn()} />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('GitHub Repos')).toBeInTheDocument()
  })

  it('calls onSelect with "home" when Home is clicked', () => {
    const onSelect = vi.fn()
    render(<WorkspacePicker onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Home'))
    expect(onSelect).toHaveBeenCalledWith('home')
  })

  it('calls onSelect with "github" when GitHub Repos is clicked', () => {
    const onSelect = vi.fn()
    render(<WorkspacePicker onSelect={onSelect} />)
    fireEvent.click(screen.getByText('GitHub Repos'))
    expect(onSelect).toHaveBeenCalledWith('github')
  })
})
