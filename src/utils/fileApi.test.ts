import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fileRead, fileWrite, getCurrentFile, setCurrentFile } from './fileApi'

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'

const mockedInvoke = vi.mocked(invoke)

describe('fileApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fileRead', () => {
    it('应该调用 file_read 命令读取文件', async () => {
      const mockContent = '# Test Content'
      mockedInvoke.mockResolvedValueOnce(mockContent)

      const result = await fileRead('/path/to/file.md')

      expect(mockedInvoke).toHaveBeenCalledWith('file_read', { path: '/path/to/file.md' })
      expect(result).toBe(mockContent)
    })

    it('应该在读取失败时抛出错误', async () => {
      mockedInvoke.mockRejectedValueOnce(new Error('File not found'))

      await expect(fileRead('/path/to/nonexistent.md')).rejects.toThrow('File not found')
    })
  })

  describe('fileWrite', () => {
    it('应该调用 file_write 命令写入文件', async () => {
      mockedInvoke.mockResolvedValueOnce(undefined)

      await fileWrite('/path/to/file.md', '# New Content')

      expect(mockedInvoke).toHaveBeenCalledWith('file_write', {
        path: '/path/to/file.md',
        content: '# New Content',
      })
    })

    it('应该在写入失败时抛出错误', async () => {
      mockedInvoke.mockRejectedValueOnce(new Error('Permission denied'))

      await expect(fileWrite('/path/to/file.md', '# Content')).rejects.toThrow('Permission denied')
    })
  })

  describe('getCurrentFile', () => {
    it('应该返回当前打开的文件路径', async () => {
      mockedInvoke.mockResolvedValueOnce('/path/to/current.md')

      const result = await getCurrentFile()

      expect(mockedInvoke).toHaveBeenCalledWith('get_current_file')
      expect(result).toBe('/path/to/current.md')
    })

    it('应该在没有打开文件时返回 null', async () => {
      mockedInvoke.mockResolvedValueOnce(null)

      const result = await getCurrentFile()

      expect(result).toBeNull()
    })
  })

  describe('setCurrentFile', () => {
    it('应该设置当前文件路径', async () => {
      mockedInvoke.mockResolvedValueOnce(undefined)

      await setCurrentFile('/path/to/file.md')

      expect(mockedInvoke).toHaveBeenCalledWith('set_current_file', {
        path: '/path/to/file.md',
      })
    })

    it('应该支持传入 null 关闭当前文件', async () => {
      mockedInvoke.mockResolvedValueOnce(undefined)

      await setCurrentFile(null)

      expect(mockedInvoke).toHaveBeenCalledWith('set_current_file', { path: null })
    })
  })
})
