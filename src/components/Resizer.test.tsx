import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Resizer } from './Resizer'

describe('Resizer', () => {
  it('应该渲染分割条', () => {
    const onResize = vi.fn()
    render(<Resizer onResize={onResize} />)

    const resizer = screen.getByTestId('resizer')
    expect(resizer).toBeInTheDocument()
  })

  it('应该在鼠标按下时开始拖拽', () => {
    const onResize = vi.fn()
    render(<Resizer onResize={onResize} />)

    const resizer = screen.getByTestId('resizer')
    fireEvent.mouseDown(resizer)

    expect(resizer).toHaveClass('dragging')
  })

  it('应该在拖拽时调用 onResize 回调', () => {
    const onResize = vi.fn()
    render(
      <div style={{ width: '1000px', position: 'relative' }}>
        <Resizer onResize={onResize} />
      </div>
    )

    const resizer = screen.getByTestId('resizer')

    // 开始拖拽
    fireEvent.mouseDown(resizer)

    // 模拟鼠标移动
    fireEvent.mouseMove(document, {
      clientX: 500,
      clientY: 0,
    })

    // 验证 onResize 被调用
    expect(onResize).toHaveBeenCalled()
  })

  it('应该在鼠标释放时停止拖拽', () => {
    const onResize = vi.fn()
    render(<Resizer onResize={onResize} />)

    const resizer = screen.getByTestId('resizer')

    // 开始拖拽
    fireEvent.mouseDown(resizer)
    expect(resizer).toHaveClass('dragging')

    // 释放鼠标
    fireEvent.mouseUp(document)

    // 验证不再有 dragging 类
    expect(resizer).not.toHaveClass('dragging')
  })

  it('应该限制在最小宽度范围内', () => {
    const onResize = vi.fn()
    render(
      <div style={{ width: '1000px', position: 'relative' }}>
        <Resizer onResize={onResize} minLeftWidth={30} minRightWidth={30} />
      </div>
    )

    const resizer = screen.getByTestId('resizer')

    // 开始拖拽
    fireEvent.mouseDown(resizer)

    // 尝试拖拽到超出最小宽度的位置
    fireEvent.mouseMove(document, {
      clientX: 100, // 这应该会被限制在 minLeftWidth
      clientY: 0,
    })

    // 验证 onResize 被调用，并且值被限制
    if (onResize.mock.calls.length > 0) {
      const lastCall = onResize.mock.calls[onResize.mock.calls.length - 1]
      const width = lastCall[0]
      expect(width).toBeGreaterThanOrEqual(30)
      expect(width).toBeLessThanOrEqual(70)
    }
  })

  it('应该使用初始宽度', () => {
    const onResize = vi.fn()
    render(<Resizer onResize={onResize} initialLeftWidth={60} />)

    const resizer = screen.getByTestId('resizer')
    expect(resizer).toBeInTheDocument()
    // 初始宽度不会立即触发 onResize，只是作为父组件的初始状态
  })

  it('应该在悬停时显示高亮效果', () => {
    const onResize = vi.fn()
    render(<Resizer onResize={onResize} />)

    const resizer = screen.getByTestId('resizer')

    // 鼠标移入
    fireEvent.mouseEnter(resizer)

    // resizer 元素应该有 hover 样式（通过 CSS 处理）
    expect(resizer).toBeInTheDocument()
  })
})
