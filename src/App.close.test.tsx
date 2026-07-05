import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCurrentWindow } from '@tauri-apps/api/window'
import App from './App'
import { fileRead, fileWrite, getCurrentFile } from './utils/fileApi'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(),
}))

vi.mock('./utils/fileApi', () => ({
  fileRead: vi.fn(),
  fileWrite: vi.fn(),
  getCurrentFile: vi.fn(),
  setCurrentFile: vi.fn(),
}))

vi.mock('./utils/exportApi', () => ({
  exportHtml: vi.fn(),
  exportPdf: vi.fn(),
}))

describe('App window close behavior', () => {
  const mockWindow = {
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    startDragging: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getCurrentWindow).mockReturnValue(
      mockWindow as unknown as ReturnType<typeof getCurrentWindow>
    )
  })

  it('saves the current file before closing the custom window', async () => {
    const currentPath = 'C:\\notes\\draft.md'
    vi.mocked(getCurrentFile).mockResolvedValue(currentPath)
    vi.mocked(fileRead).mockResolvedValue('# Draft')
    vi.mocked(fileWrite).mockResolvedValue()

    render(<App />)

    await waitFor(() => {
      expect(fileRead).toHaveBeenCalledWith(currentPath)
    })

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    await waitFor(() => {
      expect(fileWrite).toHaveBeenCalledWith(currentPath, '# Draft')
      expect(mockWindow.close).toHaveBeenCalledTimes(1)
    })

    expect(vi.mocked(fileWrite).mock.invocationCallOrder[0]).toBeLessThan(
      mockWindow.close.mock.invocationCallOrder[0]
    )
  })
})
