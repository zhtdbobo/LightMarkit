import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Preview } from './Preview'

describe('Preview', () => {
  it('应该渲染预览容器', () => {
    render(<Preview content="" />)
    const container = screen.getByTestId('preview-container')
    expect(container).toBeInTheDocument()
  })

  it('应该正确渲染普通 Markdown 文本', () => {
    const content = '# 标题\n\n这是一段**粗体**和*斜体*文本。'
    render(<Preview content={content} />)

    const container = screen.getByTestId('preview-container')
    expect(container.querySelector('h1')).toHaveTextContent('标题')
    expect(container.querySelector('strong')).toHaveTextContent('粗体')
    expect(container.querySelector('em')).toHaveTextContent('斜体')
  })

  it('应该正确渲染表格', () => {
    const content = `
| 列1 | 列2 |
| --- | --- |
| 值1 | 值2 |
| 值3 | 值4 |
    `.trim()

    render(<Preview content={content} />)
    const container = screen.getByTestId('preview-container')
    const table = container.querySelector('table')

    expect(table).toBeInTheDocument()
    expect(table?.querySelectorAll('th')).toHaveLength(2)
    expect(table?.querySelectorAll('td')).toHaveLength(4)
  })

  it('应该正确渲染任务列表', () => {
    const content = `
- [x] 已完成任务
- [ ] 未完成任务
    `.trim()

    render(<Preview content={content} />)
    const container = screen.getByTestId('preview-container')
    const checkboxes = container.querySelectorAll('input[type="checkbox"]')

    expect(checkboxes).toHaveLength(2)
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[1]).not.toBeChecked()
  })

  it('应该正确渲染删除线', () => {
    const content = '这是~~删除的文本~~。'
    render(<Preview content={content} />)

    const container = screen.getByTestId('preview-container')
    const s = container.querySelector('s')

    expect(s).toBeInTheDocument()
    expect(s).toHaveTextContent('删除的文本')
  })

  it('应该正确渲染链接', () => {
    const content = '[链接文本](https://example.com)'
    render(<Preview content={content} />)

    const container = screen.getByTestId('preview-container')
    const link = container.querySelector('a')

    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveTextContent('链接文本')
  })

  it('应该正确渲染代码块', () => {
    const content = '`inline code`\n\n```\ncode block\n```'
    render(<Preview content={content} />)

    const container = screen.getByTestId('preview-container')
    const inlineCode = container.querySelector('p code')
    const codeBlock = container.querySelector('pre code')

    expect(inlineCode).toHaveTextContent('inline code')
    expect(codeBlock).toHaveTextContent('code block')
  })

  it('应该正确渲染引用块', () => {
    const content = '> 这是引用文本'
    render(<Preview content={content} />)

    const container = screen.getByTestId('preview-container')
    const blockquote = container.querySelector('blockquote')

    expect(blockquote).toBeInTheDocument()
    expect(blockquote).toHaveTextContent('这是引用文本')
  })

  it('应该支持自定义 className', () => {
    render(<Preview content="" className="custom-class" />)
    const container = screen.getByTestId('preview-container')
    expect(container).toHaveClass('custom-class')
  })

  it('应该在内容变化时更新渲染', () => {
    const { rerender } = render(<Preview content="# 初始内容" />)
    let container = screen.getByTestId('preview-container')
    expect(container.querySelector('h1')).toHaveTextContent('初始内容')

    rerender(<Preview content="# 更新内容" />)
    container = screen.getByTestId('preview-container')
    expect(container.querySelector('h1')).toHaveTextContent('更新内容')
  })

  it('应该正确渲染嵌套列表', () => {
    const content = `
- 项目 1
  - 子项目 1.1
  - 子项目 1.2
- 项目 2
    `.trim()

    render(<Preview content={content} />)
    const container = screen.getByTestId('preview-container')
    const lists = container.querySelectorAll('ul')

    expect(lists.length).toBeGreaterThanOrEqual(2) // 至少有一个主列表和一个嵌套列表
  })

  it('应该正确渲染有序列表', () => {
    const content = `
1. 第一项
2. 第二项
3. 第三项
    `.trim()

    render(<Preview content={content} />)
    const container = screen.getByTestId('preview-container')
    const ol = container.querySelector('ol')
    const items = ol?.querySelectorAll('li')

    expect(ol).toBeInTheDocument()
    expect(items).toHaveLength(3)
  })

  it('应该正确渲染分隔线', () => {
    const content = '文本上方\n\n---\n\n文本下方'
    render(<Preview content={content} />)

    const container = screen.getByTestId('preview-container')
    const hr = container.querySelector('hr')

    expect(hr).toBeInTheDocument()
  })

  it('应该正确渲染多级标题', () => {
    const content = `
# H1 标题
## H2 标题
### H3 标题
#### H4 标题
##### H5 标题
###### H6 标题
    `.trim()

    render(<Preview content={content} />)
    const container = screen.getByTestId('preview-container')

    expect(container.querySelector('h1')).toHaveTextContent('H1 标题')
    expect(container.querySelector('h2')).toHaveTextContent('H2 标题')
    expect(container.querySelector('h3')).toHaveTextContent('H3 标题')
    expect(container.querySelector('h4')).toHaveTextContent('H4 标题')
    expect(container.querySelector('h5')).toHaveTextContent('H5 标题')
    expect(container.querySelector('h6')).toHaveTextContent('H6 标题')
  })

  it('应该自动将 URL 转换为链接', () => {
    const content = '访问 https://example.com 了解更多'
    render(<Preview content={content} />)

    const container = screen.getByTestId('preview-container')
    const link = container.querySelector('a[href="https://example.com"]')

    expect(link).toBeInTheDocument()
  })

  it('应该正确渲染混合格式的复杂文档', () => {
    const content = `
# 复杂文档示例

这是一段包含**粗体**、*斜体*和~~删除线~~的文本。

## 任务列表

- [x] 完成的任务
- [ ] 待办任务

## 表格

| 名称 | 状态 |
| --- | --- |
| 任务1 | 完成 |
| 任务2 | 进行中 |

## 代码

\`inline code\` 和代码块：

\`\`\`
function hello() {
  console.log("Hello");
}
\`\`\`

> 引用块内容
    `.trim()

    render(<Preview content={content} />)
    const container = screen.getByTestId('preview-container')

    // 验证各种元素都正确渲染
    expect(container.querySelector('h1')).toBeInTheDocument()
    expect(container.querySelector('h2')).toBeInTheDocument()
    expect(container.querySelector('table')).toBeInTheDocument()
    expect(container.querySelector('input[type="checkbox"]')).toBeInTheDocument()
    expect(container.querySelector('pre code')).toBeInTheDocument()
    expect(container.querySelector('blockquote')).toBeInTheDocument()
    expect(container.querySelector('s')).toBeInTheDocument()
  })
})
