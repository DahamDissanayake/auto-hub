import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TerminalBreadcrumb } from './TerminalBreadcrumb'

describe('TerminalBreadcrumb', () => {
  it('shows session name and workspace label for home', () => {
    render(<TerminalBreadcrumb sessionName="my-sess" workspace="home" repoName={null} onChangeDir={vi.fn()} />)
    expect(screen.getByText('my-sess')).toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('shows session name, GitHub Repos, and repo name for github workspace', () => {
    render(<TerminalBreadcrumb sessionName="dev" workspace="github" repoName="auto-hub" onChangeDir={vi.fn()} />)
    expect(screen.getByText('dev')).toBeInTheDocument()
    expect(screen.getByText('GitHub Repos')).toBeInTheDocument()
    expect(screen.getByText('auto-hub')).toBeInTheDocument()
  })

  it('shows Auto-Hub label for auto-hub workspace', () => {
    render(<TerminalBreadcrumb sessionName="hub" workspace="auto-hub" repoName={null} onChangeDir={vi.fn()} />)
    expect(screen.getByText('Auto-Hub')).toBeInTheDocument()
  })

  it('does not show repo name when repoName is null', () => {
    render(<TerminalBreadcrumb sessionName="s" workspace="github" repoName={null} onChangeDir={vi.fn()} />)
    expect(screen.queryByText('auto-hub')).not.toBeInTheDocument()
  })

  it('calls onChangeDir when Change button is clicked', () => {
    const onChangeDir = vi.fn()
    render(<TerminalBreadcrumb sessionName="s" workspace="home" repoName={null} onChangeDir={onChangeDir} />)
    fireEvent.click(screen.getByText('Change'))
    expect(onChangeDir).toHaveBeenCalled()
  })
})
