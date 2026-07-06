import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readImageAsDataUrl } from './imageApi'
import {
  hydrateLocalImages,
  renderMarkdownToExportHtml,
  renderMarkdownToHtml,
  renderMarkdownToHtmlWithEmbeddedImages,
  resolveLocalImagePath,
} from './markdownRenderer'

vi.mock('./imageApi', () => ({
  readImageAsDataUrl: vi.fn(),
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({
      svg: '<svg data-testid="rendered-mermaid"><rect fill="#ff8800" stroke="#0088ff"></rect><text style="color:#ffffff;fill:#ffffff">Flow</text></svg>',
      bindFunctions: vi.fn(),
    })),
  },
}))

describe('markdownRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该识别 Typora 风格的 Windows 本地图片路径', () => {
    const content =
      '![image-20260706010200965](C:\\\\Users\\\\Lenovo\\\\AppData\\\\Roaming\\\\Typora\\\\typora-user-images\\\\image-20260706010200965.png)'
    const html = renderMarkdownToHtml(content)
    const wrapper = document.createElement('div')
    wrapper.innerHTML = html
    const image = wrapper.querySelector('img')

    expect(image).not.toBeNull()
    expect(image).toHaveAttribute(
      'data-local-src',
      'C:\\Users\\Lenovo\\AppData\\Roaming\\Typora\\typora-user-images\\image-20260706010200965.png'
    )
  })

  it('应该接受 file URL 图片路径', () => {
    const content =
      '![image](file:///C:/Users/Lenovo/AppData/Roaming/Typora/typora-user-images/image.png)'
    const html = renderMarkdownToHtml(content)
    const wrapper = document.createElement('div')
    wrapper.innerHTML = html
    const image = wrapper.querySelector('img')

    expect(image).not.toBeNull()
    expect(image).toHaveAttribute(
      'data-local-src',
      'C:\\Users\\Lenovo\\AppData\\Roaming\\Typora\\typora-user-images\\image.png'
    )
  })

  it('应该按当前 Markdown 文件位置解析相对图片路径', () => {
    const path = resolveLocalImagePath('./assets/diagram.png', 'D:\\notes\\draft.md')

    expect(path).toBe('D:\\notes\\assets\\diagram.png')
  })

  it('应该保留远程图片地址', () => {
    const html = renderMarkdownToHtml('![remote](https://example.com/image.png)')
    const wrapper = document.createElement('div')
    wrapper.innerHTML = html
    const image = wrapper.querySelector('img')

    expect(image).toHaveAttribute('src', 'https://example.com/image.png')
    expect(image).not.toHaveAttribute('data-local-src')
  })

  it('应该把 Markdown 本地图片替换为 data URL', async () => {
    vi.mocked(readImageAsDataUrl).mockResolvedValue('data:image/png;base64,abc')
    const wrapper = document.createElement('div')
    wrapper.innerHTML = renderMarkdownToHtml('![image](C:\\\\Users\\\\Lenovo\\\\image.png)')

    await hydrateLocalImages(wrapper)

    const image = wrapper.querySelector('img')
    expect(readImageAsDataUrl).toHaveBeenCalledWith('C:\\Users\\Lenovo\\image.png')
    expect(image).toHaveAttribute('src', 'data:image/png;base64,abc')
    expect(image).not.toHaveAttribute('data-local-src')
  })

  it('应该处理 HTML img 标签中的本地图片路径', async () => {
    vi.mocked(readImageAsDataUrl).mockResolvedValue('data:image/png;base64,html')
    const wrapper = document.createElement('div')
    wrapper.innerHTML = '<img src="C:\\Users\\Lenovo\\html-image.png" alt="html">'

    await hydrateLocalImages(wrapper)

    const image = wrapper.querySelector('img')
    expect(readImageAsDataUrl).toHaveBeenCalledWith('C:\\Users\\Lenovo\\html-image.png')
    expect(image).toHaveAttribute('src', 'data:image/png;base64,html')
  })

  it('应该为导出 HTML 嵌入本地图片 data URL', async () => {
    vi.mocked(readImageAsDataUrl).mockResolvedValue('data:image/png;base64,export')

    const html = await renderMarkdownToHtmlWithEmbeddedImages('![image](./images/export.png)', {
      currentFile: 'D:\\notes\\draft.md',
    })

    expect(readImageAsDataUrl).toHaveBeenCalledWith('D:\\notes\\images\\export.png')
    expect(html).toContain('data:image/png;base64,export')
    expect(html).not.toContain('data-local-src')
  })

  it('should render Mermaid diagrams before exporting HTML', async () => {
    const html = await renderMarkdownToExportHtml(
      ['```mermaid', 'flowchart TD', '  A --> B', '```'].join('\n')
    )

    expect(html).toContain('data-testid="rendered-mermaid"')
    expect(html).toContain('fill="#ff8800"')
    expect(html).toContain('color:#ffffff')
    expect(html).not.toContain('flowchart TD')
  })
})
