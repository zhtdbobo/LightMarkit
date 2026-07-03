import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportHtml, exportPdf, exportMarkdown } from './exportApi'
import { invoke } from '@tauri-apps/api/core'

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('exportApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('exportHtml', () => {
    it('should export HTML file', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      await exportHtml('/test/output.html', '<p>Test content</p>', 'Test Document')

      expect(invoke).toHaveBeenCalledWith('export_html', {
        filePath: '/test/output.html',
        htmlContent: '<p>Test content</p>',
        title: 'Test Document',
      })
    })

    it('should handle export errors', async () => {
      vi.mocked(invoke).mockRejectedValue(new Error('Failed to write HTML file'))

      await expect(
        exportHtml('/invalid/path.html', '<p>Content</p>', 'Title')
      ).rejects.toThrow('Failed to write HTML file')
    })

    it('should handle empty content', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      await exportHtml('/test/empty.html', '', 'Empty Document')

      expect(invoke).toHaveBeenCalledWith('export_html', {
        filePath: '/test/empty.html',
        htmlContent: '',
        title: 'Empty Document',
      })
    })

    it('should handle special characters in title', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      await exportHtml('/test/special.html', '<p>Test</p>', 'Document <with> "special" & \'chars\'')

      expect(invoke).toHaveBeenCalledWith('export_html', {
        filePath: '/test/special.html',
        htmlContent: '<p>Test</p>',
        title: 'Document <with> "special" & \'chars\'',
      })
    })
  })

  describe('exportPdf', () => {
    it('should export PDF file', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      await exportPdf('/test/output.pdf', '<p>Test content</p>', 'Test Document')

      expect(invoke).toHaveBeenCalledWith('export_pdf', {
        filePath: '/test/output.pdf',
        htmlContent: '<p>Test content</p>',
        title: 'Test Document',
      })
    })

    it('should handle export errors', async () => {
      vi.mocked(invoke).mockRejectedValue(new Error('Failed to generate PDF'))

      await expect(
        exportPdf('/invalid/path.pdf', '<p>Content</p>', 'Title')
      ).rejects.toThrow('Failed to generate PDF')
    })
  })

  describe('exportMarkdown', () => {
    it('should export Markdown file', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      await exportMarkdown('/test/output.md', '# Test\n\nContent')

      expect(invoke).toHaveBeenCalledWith('export_markdown', {
        filePath: '/test/output.md',
        content: '# Test\n\nContent',
      })
    })

    it('should handle export errors', async () => {
      vi.mocked(invoke).mockRejectedValue(new Error('Failed to write Markdown file'))

      await expect(exportMarkdown('/invalid/path.md', '# Test')).rejects.toThrow(
        'Failed to write Markdown file'
      )
    })

    it('should handle empty content', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      await exportMarkdown('/test/empty.md', '')

      expect(invoke).toHaveBeenCalledWith('export_markdown', {
        filePath: '/test/empty.md',
        content: '',
      })
    })
  })
})
