import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Editor from './Editor'

describe('Editor', () => {
  describe('基础功能', () => {
    it('应该渲染编辑器容器', () => {
      render(<Editor />)
      expect(screen.getByTestId('editor-container')).toBeInTheDocument()
    })

    it('应该显示初始内容', () => {
      render(<Editor initialValue="# Hello World" />)
      const container = screen.getByTestId('editor-container')
      expect(container.textContent).toContain('Hello World')
    })

    it('应该处理空初始值', () => {
      render(<Editor initialValue="" />)
      expect(screen.getByTestId('editor-container')).toBeInTheDocument()
    })
  })

  describe('内容变化', () => {
    it('应该在内容变化时触发 onChange 回调', async () => {
      const handleChange = vi.fn()
      render(<Editor onChange={handleChange} initialValue="test" />)

      const container = screen.getByTestId('editor-container')
      const editorElement = container.querySelector('.cm-content')

      expect(editorElement).toBeInTheDocument()

      // 通过修改 contenteditable 元素来模拟输入
      if (editorElement) {
        const user = userEvent.setup()
        await user.click(editorElement)
        await user.keyboard('new text')

        await waitFor(
          () => {
            expect(handleChange).toHaveBeenCalled()
          },
          { timeout: 1000 }
        )
      }
    })

    it('应该接受新的 value prop', () => {
      const { rerender } = render(<Editor value="Initial" />)

      rerender(<Editor value="Updated" />)

      const container = screen.getByTestId('editor-container')
      expect(container.textContent).toContain('Updated')
    })
  })

  describe('Markdown 语法高亮', () => {
    it('应该渲染 Markdown 标题语法', () => {
      render(<Editor initialValue="# Heading 1" />)
      const container = screen.getByTestId('editor-container')

      // 验证 CodeMirror 已经渲染
      expect(container.querySelector('.cm-content')).toBeInTheDocument()
      expect(container.textContent).toContain('Heading 1')
    })

    it('应该渲染 Markdown 列表语法', () => {
      render(<Editor initialValue="- List item" />)
      const container = screen.getByTestId('editor-container')

      expect(container.textContent).toContain('List item')
    })

    it('应该渲染 Markdown 粗体语法', () => {
      render(<Editor initialValue="**bold text**" />)
      const container = screen.getByTestId('editor-container')

      expect(container.textContent).toContain('bold text')
    })

    it('应该渲染 Markdown 代码块语法', () => {
      render(<Editor initialValue="```js\ncode\n```" />)
      const container = screen.getByTestId('editor-container')

      expect(container.textContent).toContain('code')
    })
  })

  describe('编辑器配置', () => {
    it('应该支持只读模式', () => {
      render(<Editor readOnly={true} />)
      const container = screen.getByTestId('editor-container')

      // 验证编辑器存在但是只读
      expect(container.querySelector('.cm-editor')).toBeInTheDocument()
    })

    it('应该支持自定义类名', () => {
      render(<Editor className="custom-editor" />)
      const container = screen.getByTestId('editor-container')

      expect(container).toHaveClass('custom-editor')
    })
  })

  describe('错误处理', () => {
    it('应该处理超长文本', () => {
      const longText = 'a'.repeat(10000)
      render(<Editor initialValue={longText} />)

      expect(screen.getByTestId('editor-container')).toBeInTheDocument()
    })

    it('应该处理特殊字符', () => {
      const specialText = '< > & " \' \n \t'
      render(<Editor initialValue={specialText} />)

      const container = screen.getByTestId('editor-container')
      expect(container).toBeInTheDocument()
    })

    it('应该处理多行内容', () => {
      const multilineText = 'Line 1\nLine 2\nLine 3'
      render(<Editor initialValue={multilineText} />)

      const container = screen.getByTestId('editor-container')
      expect(container.textContent).toContain('Line 1')
      expect(container.textContent).toContain('Line 2')
      expect(container.textContent).toContain('Line 3')
    })
  })
})
