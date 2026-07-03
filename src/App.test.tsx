import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import App from './App'

// Mock Tauri APIs
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}))

vi.mock('./utils/fileApi', () => ({
  fileRead: vi.fn(),
  fileWrite: vi.fn(),
  getCurrentFile: vi.fn().mockResolvedValue(null),
  setCurrentFile: vi.fn(),
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该渲染应用标题', () => {
    render(<App />)
    expect(screen.getByText('LightMarkit')).toBeInTheDocument()
  })

  it('应该渲染应用副标题', () => {
    render(<App />)
    expect(screen.getByText('轻量级 Markdown 编辑器')).toBeInTheDocument()
  })

  it('应该渲染编辑器组件', () => {
    render(<App />)
    expect(screen.getByTestId('editor-container')).toBeInTheDocument()
  })

  it('应该显示初始欢迎内容', () => {
    render(<App />)
    const container = screen.getByTestId('editor-container')
    expect(container.textContent).toContain('Welcome to LightMarkit')
  })

  it('应该渲染视图模式切换按钮', () => {
    render(<App />)
    expect(screen.getByText('编辑')).toBeInTheDocument()
    expect(screen.getByText('分屏')).toBeInTheDocument()
    expect(screen.getByText('预览')).toBeInTheDocument()
  })

  it('应该渲染打开和保存按钮', () => {
    render(<App />)
    expect(screen.getByText('打开')).toBeInTheDocument()
    expect(screen.getByText('保存')).toBeInTheDocument()
  })

  it('应该默认为分屏模式', () => {
    render(<App />)
    const splitButton = screen.getByText('分屏')
    expect(splitButton).toHaveClass('active')
  })

  it('应该在分屏模式下同时显示编辑器和预览', () => {
    render(<App />)
    expect(screen.getByTestId('editor-container')).toBeInTheDocument()
    expect(screen.getByTestId('preview-container')).toBeInTheDocument()
  })

  it('应该点击按钮切换到编辑模式', () => {
    render(<App />)
    const editButton = screen.getByText('编辑')
    fireEvent.click(editButton)

    expect(editButton).toHaveClass('active')
    expect(screen.getByTestId('editor-container')).toBeInTheDocument()
    expect(screen.queryByTestId('preview-container')).not.toBeInTheDocument()
  })

  it('应该点击按钮切换到预览模式', () => {
    render(<App />)
    const previewButton = screen.getByText('预览')
    fireEvent.click(previewButton)

    expect(previewButton).toHaveClass('active')
    expect(screen.queryByTestId('editor-container')).not.toBeInTheDocument()
    expect(screen.getByTestId('preview-container')).toBeInTheDocument()
  })

  it('应该在分屏模式下渲染分割条', () => {
    render(<App />)
    expect(screen.getByTestId('resizer')).toBeInTheDocument()
  })

  it('应该在编辑模式下不渲染分割条', () => {
    render(<App />)
    const editButton = screen.getByText('编辑')
    fireEvent.click(editButton)

    expect(screen.queryByTestId('resizer')).not.toBeInTheDocument()
  })

  it('应该在预览模式下不渲染分割条', () => {
    render(<App />)
    const previewButton = screen.getByText('预览')
    fireEvent.click(previewButton)

    expect(screen.queryByTestId('resizer')).not.toBeInTheDocument()
  })

  it('应该通过 Ctrl+/ 切换视图模式', () => {
    render(<App />)

    // 初始为分屏模式
    expect(screen.getByText('分屏')).toHaveClass('active')

    // 第一次按 Ctrl+/ 切换到预览模式
    fireEvent.keyDown(window, { key: '/', ctrlKey: true })
    expect(screen.getByText('预览')).toHaveClass('active')

    // 第二次按 Ctrl+/ 切换到编辑模式
    fireEvent.keyDown(window, { key: '/', ctrlKey: true })
    expect(screen.getByText('编辑')).toHaveClass('active')

    // 第三次按 Ctrl+/ 回到分屏模式
    fireEvent.keyDown(window, { key: '/', ctrlKey: true })
    expect(screen.getByText('分屏')).toHaveClass('active')
  })
})
