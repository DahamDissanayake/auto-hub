import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TerminalBreadcrumb } from './TerminalBreadcrumb'

describe('TerminalBreadcrumb', () => {
  it('shows "Home" label for home workspace', () => {
    render(<TerminalBreadcrumb workspace="home" repoName={null} onChangeDir={vi.fn()} />)
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('shows "GitHub Repos" and repo name for github workspace', () => {
    render(<TerminalBreadcrumb workspace="github" repoName="auto-hub" onChangeDir={vi.fn()} />)
    expect(screen.getByText('GitHub Repos')).toBeInTheDocument()
    expect(screen.getByText('auto-hub')).toBeInTheDocument()
  })

  it('does not show repo name when repoName is null', () => {
    render(<TerminalBreadcrumb workspace="github" repoName={null} onChangeDir={vi.fn()} />)
    expect(screen.queryByText('auto-hub')).not.toBeInTheDocument()
  })

  it('calls onChangeDir when Change button is clicked', () => {
    const onChangeDir = vi.fn()
    render(<TerminalBreadcrumb workspace="home" repoName={null} onChangeDir={onChangeDir} />)
    fireEvent.click(screen.getByText('Change'))
    expect(onChangeDir).toHaveBeenCalled()
  })
})
