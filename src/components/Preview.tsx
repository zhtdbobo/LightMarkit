import { useEffect, useRef } from 'react'
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import './Preview.css'

interface PreviewProps {
  content: string
  className?: string
}

// 创建 markdown-it 实例并配置 GFM 插件
const md = new MarkdownIt({
  html: true, // 启用 HTML 标签以支持 <img> 等标签
  linkify: true, // 自动将 URL 转换为链接
  typographer: true, // 启用智能引号等排版特性
  breaks: true, // 将换行符转换为 <br>
})
  .use(taskLists, {
    enabled: true,
    label: true,
    labelAfter: true,
  })
  .enable(['table', 'strikethrough']) // 启用表格和删除线支持

// 添加 Mermaid 代码块处理
const defaultFenceRenderer = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const code = token.content.trim()
  const info = token.info ? token.info.trim() : ''

  if (info === 'mermaid') {
    return `<div class="mermaid">${code}</div>`
  }

  return defaultFenceRenderer(tokens, idx, options, env, self)
}

export function Preview({ content, className = '' }: PreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (previewRef.current) {
      const html = md.render(content)
      previewRef.current.innerHTML = html

      // 渲染所有 Mermaid 图表（仅在浏览器环境）
      const mermaidElements = previewRef.current.querySelectorAll('.mermaid')
      if (mermaidElements.length > 0 && typeof window !== 'undefined') {
        // 动态导入 mermaid 以避免测试环境问题
        import('mermaid')
          .then((mermaidModule) => {
            const mermaid = mermaidModule.default
            mermaid.initialize({
              startOnLoad: false,
              theme: 'default',
              securityLevel: 'loose',
            })

            mermaidElements.forEach((element, index) => {
              const id = `mermaid-${Date.now()}-${index}`
              element.setAttribute('id', id)
            })

            mermaid.run({
              nodes: Array.from(mermaidElements) as HTMLElement[],
            }).catch((error) => {
              console.error('Mermaid rendering error:', error)
            })
          })
          .catch((error) => {
            console.error('Failed to load mermaid:', error)
          })
      }
    }
  }, [content])

  return (
    <div
      ref={previewRef}
      className={`preview-container ${className}`}
      data-testid="preview-container"
    />
  )
}
