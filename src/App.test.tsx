import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
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
})

