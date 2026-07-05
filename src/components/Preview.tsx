import { useEffect, useRef } from 'react'
import { hydrateLocalImages, renderMarkdownToHtml } from '../utils/markdownRenderer'
import './Preview.css'

interface PreviewProps {
  content: string
  currentFile?: string | null
  className?: string
}

export function Preview({ content, currentFile = null, className = '' }: PreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (previewRef.current) {
      const html = renderMarkdownToHtml(content, { currentFile })
      previewRef.current.innerHTML = html
      void hydrateLocalImages(previewRef.current, { currentFile })

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
  }, [content, currentFile])

  return (
    <div
      ref={previewRef}
      className={`preview-container ${className}`}
      data-testid="preview-container"
    />
  )
}
