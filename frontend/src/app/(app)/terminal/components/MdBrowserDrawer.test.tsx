import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MdBrowserDrawer } from './MdBrowserDrawer'
import * as filesApi from '@/lib/filesApi'

vi.mock('@/lib/filesApi')
const mockApiLs = filesApi.apiLs as ReturnType<typeof vi.fn>

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockSessionStorage = { getItem: vi.fn().mockReturnValue('test-token') }
vi.stubGlobal('sessionStorage', mockSessionStorage)

const defaultProps = {
  root: 'workspace',
  startPath: 'auto-hub',
  onClose: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSessionStorage.getItem.mockReturnValue('test-token')
})

describe('MdBrowserDrawer', () => {
  it('shows directory entries from apiLs', async () => {
    mockApiLs.mockResolvedValue({
      path: 'auto-hub',
      entries: [
        { name: 'src', type: 'dir', size: 0, modified: '' },
        { name: 'README.md', type: 'file', size: 100, modified: '' },
        { name: 'package.json', type: 'file', size: 50, modified: '' },
      ],
    })
    render(<MdBrowserDrawer {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('src')).toBeInTheDocument())
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.getByText('package.json')).toBeInTheDocument()
  })

  it('calls apiLs with correct root and startPath on mount', async () => {
    mockApiLs.mockResolvedValue({ path: 'auto-hub', entries: [] })
    render(<MdBrowserDrawer {...defaultProps} />)
    await waitFor(() => expect(mockApiLs).toHaveBeenCalledWith('workspace', 'auto-hub'))
  })

  it('navigates into a folder and calls apiLs with updated path', async () => {
    mockApiLs
      .mockResolvedValueOnce({
        path: 'auto-hub',
        entries: [{ name: 'frontend', type: 'dir', size: 0, modified: '' }],
      })
      .mockResolvedValueOnce({
        path: 'auto-hub/frontend',
        entries: [{ name: 'index.ts', type: 'file', size: 10, modified: '' }],
      })
    render(<MdBrowserDrawer {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('frontend')).toBeInTheDocument())
    fireEvent.click(screen.getByText('frontend'))
    await waitFor(() =>
      expect(mockApiLs).toHaveBeenCalledWith('workspace', 'auto-hub/frontend')
    )
  })

  it('fetches md content via /files-api/download when md file is clicked', async () => {
    mockApiLs.mockResolvedValue({
      path: 'auto-hub',
      entries: [{ name: 'README.md', type: 'file', size: 100, modified: '' }],
    })
    mockFetch.mockResolvedValue({ ok: true, text: async () => '# Hello' })

    render(<MdBrowserDrawer {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument())
    fireEvent.click(screen.getByText('README.md'))

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/files-api\/download.*root=workspace.*README\.md/)
      )
    )
  })

  it('shows Back button in viewer and returns to browse on click', async () => {
    mockApiLs.mockResolvedValue({
      path: 'auto-hub',
      entries: [{ name: 'README.md', type: 'file', size: 100, modified: '' }],
    })
    mockFetch.mockResolvedValue({ ok: true, text: async () => '# Hi' })

    render(<MdBrowserDrawer {...defaultProps} />)
    await waitFor(() => fireEvent.click(screen.getByText('README.md')))
    await waitFor(() => expect(screen.getByText('Back')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Back'))
    await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument())
    expect(screen.queryByText('Back')).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked in browse view', async () => {
    mockApiLs.mockResolvedValue({ path: 'auto-hub', entries: [] })
    const onClose = vi.fn()
    render(<MdBrowserDrawer {...defaultProps} onClose={onClose} />)
    await waitFor(() => expect(mockApiLs).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalled()
  })
})
