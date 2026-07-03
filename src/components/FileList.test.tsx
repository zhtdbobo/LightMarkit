import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FileList } from './FileList'
import type { FileInfo } from '../utils/folderApi'

describe('FileList', () => {
  const mockOnFileSelect = vi.fn()

  const mockFiles: FileInfo[] = [
    {
      name: 'note1.md',
      path: '/test/note1.md',
      is_dir: false,
      children: undefined,
    },
    {
      name: 'note2.md',
      path: '/test/note2.md',
      is_dir: false,
      children: undefined,
    },
    {
      name: 'subdir',
      path: '/test/subdir',
      is_dir: true,
      children: [
        {
          name: 'note3.md',
          path: '/test/subdir/note3.md',
          is_dir: false,
          children: undefined,
        },
      ],
    },
  ]

  beforeEach(() => {
    mockOnFileSelect.mockClear()
  })

  it('should render file list', () => {
    render(<FileList files={mockFiles} currentFile={null} onFileSelect={mockOnFileSelect} />)

    expect(screen.getByText('note1.md')).toBeInTheDocument()
    expect(screen.getByText('note2.md')).toBeInTheDocument()
    expect(screen.getByText('subdir')).toBeInTheDocument()
  })

  it('should render empty state when no files', () => {
    render(<FileList files={[]} currentFile={null} onFileSelect={mockOnFileSelect} />)

    expect(screen.getByText('没有找到 Markdown 文件')).toBeInTheDocument()
  })

  it('should call onFileSelect when file is clicked', () => {
    render(<FileList files={mockFiles} currentFile={null} onFileSelect={mockOnFileSelect} />)

    fireEvent.click(screen.getByText('note1.md'))

    expect(mockOnFileSelect).toHaveBeenCalledWith('/test/note1.md')
  })

  it('should highlight active file', () => {
    render(
      <FileList
        files={mockFiles}
        currentFile="/test/note1.md"
        onFileSelect={mockOnFileSelect}
      />
    )

    const activeItem = screen.getByText('note1.md').parentElement
    expect(activeItem).toHaveClass('active')
  })

  it('should expand/collapse directories', () => {
    render(<FileList files={mockFiles} currentFile={null} onFileSelect={mockOnFileSelect} />)

    // Initially expanded - nested file should be visible
    expect(screen.getByText('note3.md')).toBeInTheDocument()

    // Click to collapse
    fireEvent.click(screen.getByText('subdir'))
    expect(screen.queryByText('note3.md')).not.toBeInTheDocument()

    // Click to expand again
    fireEvent.click(screen.getByText('subdir'))
    expect(screen.getByText('note3.md')).toBeInTheDocument()
  })

  it('should not call onFileSelect when clicking directory', () => {
    render(<FileList files={mockFiles} currentFile={null} onFileSelect={mockOnFileSelect} />)

    fireEvent.click(screen.getByText('subdir'))

    expect(mockOnFileSelect).not.toHaveBeenCalled()
  })

  it('should render nested files with correct structure', () => {
    render(<FileList files={mockFiles} currentFile={null} onFileSelect={mockOnFileSelect} />)

    expect(screen.getByText('note3.md')).toBeInTheDocument()
  })

  it('should handle file selection in nested directories', () => {
    render(<FileList files={mockFiles} currentFile={null} onFileSelect={mockOnFileSelect} />)

    fireEvent.click(screen.getByText('note3.md'))

    expect(mockOnFileSelect).toHaveBeenCalledWith('/test/subdir/note3.md')
  })
})
