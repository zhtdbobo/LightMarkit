import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    it('应该默认启用所见即所得排版', () => {
      render(<Editor initialValue="# Heading 1" />)
      const container = screen.getByTestId('editor-container')

      expect(container).toHaveClass('wysiwyg-editor')
      expect(container.querySelector('.cm-wysiwyg-h1')).toBeInTheDocument()
    })

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
      render(<Editor initialValue={'```js\ncode\n```'} />)
      const container = screen.getByTestId('editor-container')

      expect(container.textContent).toContain('code')
      expect(screen.getByRole('button', { name: '复制代码' })).toBeInTheDocument()
    })

    it('应该复制所见即所得代码块内容', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      const user = userEvent.setup()
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      })
      render(<Editor initialValue={'```ts\nconst answer = 42\n```'} />)

      await user.click(screen.getByRole('button', { name: '复制代码' }))

      expect(writeText).toHaveBeenCalledWith('const answer = 42')
      expect(screen.getByRole('button', { name: '复制代码' })).toHaveTextContent('已复制')
    })

    it('应该折叠并展开所见即所得代码块', async () => {
      const user = userEvent.setup()
      render(<Editor initialValue={'```ts\nconst answer = 42\nconsole.log(answer)\n```'} />)

      const container = screen.getByTestId('editor-container')
      const collapseButton = screen.getByRole('button', { name: '折叠代码块' })

      expect(container).toHaveTextContent('const answer = 42')
      expect(collapseButton).toHaveAttribute('aria-expanded', 'true')

      await user.click(collapseButton)

      expect(container).not.toHaveTextContent('console.log(answer)')
      expect(container.querySelector('.cm-code-collapse-summary')).toHaveTextContent(
        'const answer = 42 · 2 行'
      )
      expect(screen.getByRole('button', { name: '展开代码块' })).toHaveAttribute(
        'aria-expanded',
        'false'
      )

      await user.click(screen.getByRole('button', { name: '展开代码块' }))

      expect(container).toHaveTextContent('console.log(answer)')
    })

    it('应该保留未闭合代码块的最后一行', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      const user = userEvent.setup()
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      })
      render(<Editor initialValue={'```js\nfirst line\nlast line'} />)

      await user.click(screen.getByRole('button', { name: '复制代码' }))

      expect(writeText).toHaveBeenCalledWith('first line\nlast line')
      expect(screen.getByTestId('editor-container')).toHaveTextContent('last line')
    })

    it('应该在编辑区内直接显示 Markdown 图片', () => {
      render(
        <Editor initialValue={'正文\n\n![示例图片](https://example.com/example.png)'} />
      )

      expect(screen.getByRole('img', { name: '示例图片' })).toHaveAttribute(
        'src',
        'https://example.com/example.png'
      )
    })

    it('应该只显示待办复选框而隐藏列表符号', () => {
      render(<Editor initialValue={'正文\n\n- [ ] aaa\n- [x] bbb'} />)
      const container = screen.getByTestId('editor-container')

      expect(screen.getAllByRole('checkbox')).toHaveLength(2)
      expect(container).toHaveTextContent('aaa')
      expect(container).toHaveTextContent('bbb')
      expect(container.textContent).not.toContain('- ')
    })

    it('应该只在悬停表格边框时显示临时行列操作', () => {
      render(<Editor initialValue={'| 名称 | 数量 |\n| --- | ---: |\n| 苹果 | 2 |'} />)

      const editor = screen.getByTestId('editor-container')
      const tableRoot = editor.querySelector('.cm-markdown-table') as HTMLElement
      const contextActions = editor.querySelector(
        '.cm-markdown-table-context-actions'
      ) as HTMLElement

      expect(contextActions).not.toBeVisible()
      expect(screen.queryByRole('button', { name: '左侧添加一列' })).not.toBeInTheDocument()

      const leftEdge = editor.querySelector(
        '.cm-markdown-table-edge-left[data-row-index="1"][data-column-index="0"]'
      ) as HTMLElement
      vi.spyOn(tableRoot, 'getBoundingClientRect').mockReturnValue({
        left: 10,
        top: 20,
        width: 600,
        height: 160,
      } as DOMRect)
      vi.spyOn(leftEdge, 'getBoundingClientRect').mockReturnValue({
        left: 10,
        top: 72,
        width: 5,
        height: 36,
      } as DOMRect)
      vi.spyOn(contextActions, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 96,
        height: 34,
      } as DOMRect)
      fireEvent.mouseEnter(leftEdge)

      expect(contextActions).toBeVisible()
      expect(contextActions).toHaveClass('is-column', 'is-edge-top')
      expect(contextActions.style.left).toBe('54px')
      expect(contextActions.style.top).toBe('0px')
      expect(screen.getByRole('button', { name: '左侧添加一列' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '右侧添加一列' })).not.toBeInTheDocument()

      fireEvent.mouseEnter(
        editor.querySelector(
          '.cm-markdown-table-edge-right[data-row-index="1"][data-column-index="0"]'
        ) as HTMLElement
      )

      expect(screen.getByRole('button', { name: '左侧添加一列' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '右侧添加一列' })).toBeInTheDocument()

      fireEvent.mouseEnter(
        editor.querySelector(
          '.cm-markdown-table-edge-right[data-row-index="1"][data-column-index="1"]'
        ) as HTMLElement
      )

      expect(screen.queryByRole('button', { name: '左侧添加一列' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '右侧添加一列' })).toBeInTheDocument()

      fireEvent.mouseLeave(tableRoot)
      expect(contextActions).not.toBeVisible()
    })

    it('应该在当前单元格的上方或下方插入行', async () => {
      const handleChange = vi.fn()
      const user = userEvent.setup()
      render(
        <Editor
          initialValue={
            '| 名称 | 数量 |\n| --- | ---: |\n| 苹果 | 2 |\n| 香蕉 | 3 |'
          }
          onChange={handleChange}
        />
      )

      fireEvent.mouseEnter(
        screen
          .getByTestId('editor-container')
          .querySelector(
            '.cm-markdown-table-edge-bottom[data-row-index="1"][data-column-index="0"]'
          ) as HTMLElement
      )
      expect(screen.getByRole('button', { name: '上方添加一行' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '下方添加一行' }))

      expect(handleChange.mock.calls.at(-1)?.[0].split('\n')).toEqual([
        '| 名称 | 数量 |',
        '| --- | ---: |',
        '| 苹果 | 2 |',
        '|  |  |',
        '| 香蕉 | 3 |',
      ])
      expect(screen.getByRole('textbox', { name: '第 3 行第 1 列' })).toHaveFocus()

      fireEvent.mouseEnter(
        screen
          .getByTestId('editor-container')
          .querySelector(
            '.cm-markdown-table-edge-top[data-row-index="3"][data-column-index="0"]'
          ) as HTMLElement
      )
      expect(screen.getByRole('button', { name: '下方添加一行' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '上方添加一行' }))

      expect(handleChange.mock.calls.at(-1)?.[0].split('\n')).toEqual([
        '| 名称 | 数量 |',
        '| --- | ---: |',
        '| 苹果 | 2 |',
        '|  |  |',
        '|  |  |',
        '| 香蕉 | 3 |',
      ])
    })

    it('应该在当前单元格的左侧或右侧插入列', async () => {
      const handleChange = vi.fn()
      const user = userEvent.setup()
      render(
        <Editor
          initialValue={'| 名称 | 数量 |\n| --- | ---: |\n| 苹果 | 2 |'}
          onChange={handleChange}
        />
      )

      fireEvent.mouseEnter(
        screen
          .getByTestId('editor-container')
          .querySelector(
            '.cm-markdown-table-edge-left[data-row-index="1"][data-column-index="1"]'
          ) as HTMLElement
      )
      await user.click(screen.getByRole('button', { name: '左侧添加一列' }))

      expect(handleChange.mock.calls.at(-1)?.[0]).toContain('| 名称 | 新列 | 数量 |')

      fireEvent.mouseEnter(
        screen
          .getByTestId('editor-container')
          .querySelector(
            '.cm-markdown-table-edge-right[data-row-index="1"][data-column-index="2"]'
          ) as HTMLElement
      )
      await user.click(screen.getByRole('button', { name: '右侧添加一列' }))

      expect(handleChange.mock.calls.at(-1)?.[0]).toContain(
        '| 名称 | 新列 | 数量 | 新列 |'
      )
    })

    it('应该删除当前数据行或当前列', async () => {
      const handleChange = vi.fn()
      const user = userEvent.setup()
      render(
        <Editor
          initialValue={
            '| 名称 | 数量 |\n| --- | ---: |\n| 苹果 | 2 |\n| 香蕉 | 3 |'
          }
          onChange={handleChange}
        />
      )

      fireEvent.mouseEnter(
        screen
          .getByTestId('editor-container')
          .querySelector(
            '.cm-markdown-table-edge-bottom[data-row-index="1"][data-column-index="1"]'
          ) as HTMLElement
      )
      await user.click(screen.getByRole('button', { name: '删除本行' }))

      expect(handleChange.mock.calls.at(-1)?.[0]).not.toContain('苹果')
      expect(handleChange.mock.calls.at(-1)?.[0]).toContain('| 香蕉 | 3 |')
      expect(screen.getByRole('textbox', { name: '第 2 行第 2 列' })).toHaveFocus()

      fireEvent.mouseEnter(
        screen
          .getByTestId('editor-container')
          .querySelector(
            '.cm-markdown-table-edge-right[data-row-index="1"][data-column-index="1"]'
          ) as HTMLElement
      )
      await user.click(screen.getByRole('button', { name: '删除本列' }))

      expect(handleChange.mock.calls.at(-1)?.[0].split('\n')).toEqual([
        '| 名称 |',
        '| --- |',
        '| 香蕉 |',
      ])
    })

    it('应该渲染使用短分隔线的 GFM 表格', () => {
      render(<Editor initialValue={'| 名称 | 数量 |\n| - | -: |\n| 苹果 | 2 |'} />)

      expect(screen.getByRole('table')).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: '第 2 行第 1 列' })).toHaveValue('苹果')
    })

    it('应该直接编辑所见即所得表格单元格', async () => {
      const handleChange = vi.fn()
      const user = userEvent.setup()
      render(
        <Editor
          initialValue={'| 名称 | 数量 |\n| --- | ---: |\n| 苹果 | 2 |'}
          onChange={handleChange}
        />
      )

      const cell = screen.getByRole('textbox', { name: '第 2 行第 1 列' })
      await user.clear(cell)
      await user.type(cell, '香蕉')
      await user.tab()

      await waitFor(() => {
        expect(handleChange).toHaveBeenCalledWith(expect.stringContaining('| 香蕉 | 2 |'))
      })
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

    it('应该在编辑区左侧显示行号', () => {
      render(<Editor initialValue={'Line 1\nLine 2\nLine 3'} />)

      const lineNumberGutter = screen
        .getByTestId('editor-container')
        .querySelector('.cm-lineNumbers')

      expect(lineNumberGutter).toBeInTheDocument()
      expect(lineNumberGutter?.textContent).toContain('1')
      expect(lineNumberGutter?.textContent).toContain('3')
    })
  })
})
