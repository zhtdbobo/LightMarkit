import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scanFolder } from './folderApi'
import { invoke } from '@tauri-apps/api/core'

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('folderApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('scanFolder', () => {
    it('should scan folder and return file list', async () => {
      const mockFiles = [
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
      ]

      vi.mocked(invoke).mockResolvedValue(mockFiles)

      const result = await scanFolder('/test')

      expect(invoke).toHaveBeenCalledWith('scan_folder', { folderPath: '/test' })
      expect(result).toEqual(mockFiles)
    })

    it('should handle nested directories', async () => {
      const mockFiles = [
        {
          name: 'subdir',
          path: '/test/subdir',
          is_dir: true,
          children: [
            {
              name: 'note.md',
              path: '/test/subdir/note.md',
              is_dir: false,
              children: undefined,
            },
          ],
        },
      ]

      vi.mocked(invoke).mockResolvedValue(mockFiles)

      const result = await scanFolder('/test')

      expect(result).toEqual(mockFiles)
      expect(result[0].is_dir).toBe(true)
      expect(result[0].children).toHaveLength(1)
    })

    it('should handle empty folder', async () => {
      vi.mocked(invoke).mockResolvedValue([])

      const result = await scanFolder('/empty')

      expect(result).toEqual([])
    })

    it('should throw error for invalid path', async () => {
      vi.mocked(invoke).mockRejectedValue(new Error('Path is not a directory'))

      await expect(scanFolder('/invalid')).rejects.toThrow('Path is not a directory')
    })
  })
})
