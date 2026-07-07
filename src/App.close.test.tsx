import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { save } from '@tauri-apps/plugin-dialog'
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
    onCloseRequested: vi.fn().mockResolvedValue(vi.fn()),
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

  it('asks for a save path before closing an unsaved document', async () => {
    const savedPath = 'C:\\notes\\untitled.md'
    vi.mocked(getCurrentFile).mockResolvedValue(null)
    vi.mocked(save).mockResolvedValue(savedPath)
    vi.mocked(fileWrite).mockResolvedValue()
    const user = userEvent.setup()

    render(<App />)

    const editorElement = screen.getByTestId('editor-container').querySelector('.cm-content')
    expect(editorElement).toBeInTheDocument()

    await user.click(editorElement!)
    await user.keyboard('# Draft')

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    await waitFor(() => {
      expect(save).toHaveBeenCalled()
      expect(fileWrite).toHaveBeenCalledWith(savedPath, expect.stringContaining('#'))
      expect(mockWindow.close).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps an unsaved document open when save-as is cancelled', async () => {
    vi.mocked(getCurrentFile).mockResolvedValue(null)
    vi.mocked(save).mockResolvedValue(null)
    const user = userEvent.setup()

    render(<App />)

    const editorElement = screen.getByTestId('editor-container').querySelector('.cm-content')
    expect(editorElement).toBeInTheDocument()

    await user.click(editorElement!)
    await user.keyboard('# Draft')

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    await waitFor(() => {
      expect(save).toHaveBeenCalled()
    })
    expect(mockWindow.close).not.toHaveBeenCalled()
  })
})
