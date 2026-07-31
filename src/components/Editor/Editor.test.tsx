import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EditorView } from '@codemirror/view'
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
      expect(screen.getByRole('combobox', { name: '代码语言' })).toHaveValue('js')
      expect(screen.getByRole('button', { name: '复制代码' })).toBeInTheDocument()
    })

    it('应该根据代码块语言高亮 Java 语法', async () => {
      render(<Editor initialValue={'```java\npublic class Demo { private int value = 1; }\n```'} />)

      await waitFor(() => {
        expect(
          screen.getByTestId('editor-container').querySelector('.cm-code-token-keyword')
        ).toHaveTextContent('public')
      })
      expect(
        screen.getByTestId('editor-container').querySelector('.cm-code-token-type')
      ).toHaveTextContent('int')
    })

    it('应该能编辑代码块语言并在按回车后展开代码区', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()
      render(<Editor initialValue={'```\n```'} onChange={handleChange} />)

      const languageInput = screen.getByRole('combobox', { name: '代码语言' })
      await user.type(languageInput, 'typescript')

      expect(languageInput).toHaveValue('typescript')

      await user.type(languageInput, '{Enter}')

      expect(handleChange).toHaveBeenLastCalledWith('```typescript\n\n```')
      expect(
        screen.getByTestId('editor-container').querySelectorAll('.cm-wysiwyg-code-line')
      ).toHaveLength(1)
    })

    it('应该在代码正文按回车时继续扩展代码块', () => {
      let editorView: EditorView | null = null
      render(
        <Editor
          initialValue={'```\nconst answer = 42\n```'}
          onReady={(view) => {
            editorView = view
          }}
        />
      )

      expect(editorView).not.toBeNull()
      const view = editorView as EditorView
      const bodyLine = view.state.doc.line(2)
      view.dispatch({ selection: { anchor: bodyLine.to } })
      view.focus()
      fireEvent.keyDown(view.contentDOM, { key: 'Enter', code: 'Enter' })

      expect(view.state.doc.toString()).toBe('```\nconst answer = 42\n\n```')
      expect(
        screen.getByTestId('editor-container').querySelectorAll('.cm-wysiwyg-code-line')
      ).toHaveLength(2)
    })

    it('应该在折叠代码块上按回车时自动展开', async () => {
      const user = userEvent.setup()
      let editorView: EditorView | null = null
      render(
        <Editor
          initialValue={'```java\nimport java.io;\nclass Demo {}\n```'}
          onReady={(view) => {
            editorView = view
          }}
        />
      )

      await user.click(screen.getByRole('button', { name: '折叠代码块' }))
      expect(screen.getByRole('button', { name: '展开代码块' })).toBeInTheDocument()

      const view = editorView as unknown as EditorView
      view.dispatch({ selection: { anchor: view.state.doc.line(1).to } })
      view.focus()
      fireEvent.keyDown(view.contentDOM, { key: 'Enter', code: 'Enter' })

      expect(screen.getByRole('button', { name: '折叠代码块' })).toBeInTheDocument()
      expect(screen.getByTestId('editor-container')).toHaveTextContent('class Demo {}')
      expect(view.state.selection.main.head).toBe(view.state.doc.line(2).from)
    })

    it('应该给未闭合代码块补上稳定的底边框', () => {
      render(<Editor initialValue={'```js\nconst answer = 42'} />)

      expect(
        screen.getByTestId('editor-container').querySelector('.cm-wysiwyg-code-last-line')
      ).toBeInTheDocument()
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
      render(<Editor initialValue={'正文\n\n![示例图片](https://example.com/example.png)'} />)

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

    it('应该根据当前单元格显示浮动表格菜单并在离开后隐藏', async () => {
      render(<Editor initialValue={'| 名称 | 数量 |\n| --- | ---: |\n| 苹果 | 2 |'} />)

      const editor = screen.getByTestId('editor-container')
      const toolbar = editor.querySelector('.cm-markdown-table-toolbar') as HTMLElement
      const tableRoot = editor.querySelector('.cm-markdown-table') as HTMLElement
      const dataCell = screen
        .getByRole('textbox', { name: '第 2 行第 1 列' })
        .closest('td') as HTMLTableCellElement
      expect(toolbar).not.toBeVisible()

      vi.spyOn(tableRoot, 'getBoundingClientRect').mockReturnValue({
        left: 10,
        top: 20,
        width: 600,
        height: 160,
      } as DOMRect)
      vi.spyOn(dataCell, 'getBoundingClientRect').mockReturnValue({
        left: 310,
        top: 92,
        width: 120,
        height: 36,
      } as DOMRect)
      vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue({
        width: 90,
        height: 36,
      } as DOMRect)
      fireEvent.focus(dataCell.querySelector('input') as HTMLInputElement)

      expect(screen.getByRole('toolbar', { name: '第 1 行第 1 列操作' })).toBeVisible()
      expect(toolbar.style.left).toBe('360px')
      expect(toolbar.style.top).toBe('72px')
      expect(screen.getByRole('button', { name: '行操作' })).toHaveAttribute(
        'aria-expanded',
        'false'
      )
      expect(screen.getByRole('button', { name: '列操作' })).toBeVisible()
      fireEvent.click(screen.getByRole('button', { name: '行操作' }))
      expect(screen.getByRole('menuitem', { name: '在当前行上方插入一行' })).toBeEnabled()
      expect(screen.getByRole('menuitem', { name: '删除当前行' })).toBeEnabled()

      const headerCell = screen.getByRole('textbox', { name: '第 1 行第 2 列' })
      fireEvent.focus(headerCell)
      expect(screen.getByRole('toolbar', { name: '表头第 2 列操作' })).toBeVisible()
      fireEvent.click(screen.getByRole('button', { name: '行操作' }))
      expect(screen.getByRole('menuitem', { name: '在当前行上方插入一行' })).toBeDisabled()
      expect(screen.getByRole('menuitem', { name: '删除当前行' })).toBeDisabled()

      fireEvent.blur(headerCell)
      await waitFor(() => expect(toolbar).not.toBeVisible())
    })

    it('应该在当前单元格的上方或下方插入行', async () => {
      const handleChange = vi.fn()
      const user = userEvent.setup()
      render(
        <Editor
          initialValue={'| 名称 | 数量 |\n| --- | ---: |\n| 苹果 | 2 |\n| 香蕉 | 3 |'}
          onChange={handleChange}
        />
      )

      fireEvent.focus(screen.getByRole('textbox', { name: '第 2 行第 1 列' }))
      await user.click(screen.getByRole('button', { name: '行操作' }))
      await user.click(screen.getByRole('menuitem', { name: '在当前行下方插入一行' }))

      expect(handleChange.mock.calls.at(-1)?.[0].split('\n')).toEqual([
        '| 名称 | 数量 |',
        '| --- | ---: |',
        '| 苹果 | 2 |',
        '|  |  |',
        '| 香蕉 | 3 |',
      ])
      expect(screen.getByRole('textbox', { name: '第 3 行第 1 列' })).toHaveFocus()

      fireEvent.focus(screen.getByRole('textbox', { name: '第 4 行第 1 列' }))
      await user.click(screen.getByRole('button', { name: '行操作' }))
      await user.click(screen.getByRole('menuitem', { name: '在当前行上方插入一行' }))

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

      fireEvent.focus(screen.getByRole('textbox', { name: '第 2 行第 2 列' }))
      await user.click(screen.getByRole('button', { name: '列操作' }))
      await user.click(screen.getByRole('menuitem', { name: '在当前列左侧插入一列' }))

      expect(handleChange.mock.calls.at(-1)?.[0]).toContain('| 名称 | 新列 | 数量 |')

      fireEvent.focus(screen.getByRole('textbox', { name: '第 2 行第 3 列' }))
      await user.click(screen.getByRole('button', { name: '列操作' }))
      await user.click(screen.getByRole('menuitem', { name: '在当前列右侧插入一列' }))

      expect(handleChange.mock.calls.at(-1)?.[0]).toContain('| 名称 | 新列 | 数量 | 新列 |')
    })

    it('应该删除当前数据行或当前列', async () => {
      const handleChange = vi.fn()
      const user = userEvent.setup()
      render(
        <Editor
          initialValue={'| 名称 | 数量 |\n| --- | ---: |\n| 苹果 | 2 |\n| 香蕉 | 3 |'}
          onChange={handleChange}
        />
      )

      fireEvent.focus(screen.getByRole('textbox', { name: '第 2 行第 2 列' }))
      await user.click(screen.getByRole('button', { name: '行操作' }))
      await user.click(screen.getByRole('menuitem', { name: '删除当前行' }))

      expect(handleChange.mock.calls.at(-1)?.[0]).not.toContain('苹果')
      expect(handleChange.mock.calls.at(-1)?.[0]).toContain('| 香蕉 | 3 |')
      expect(screen.getByRole('textbox', { name: '第 2 行第 2 列' })).toHaveFocus()

      fireEvent.focus(screen.getByRole('textbox', { name: '第 2 行第 2 列' }))
      await user.click(screen.getByRole('button', { name: '列操作' }))
      await user.click(screen.getByRole('menuitem', { name: '删除当前列' }))

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
