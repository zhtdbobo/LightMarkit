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

export function Preview({ content, className = '' }: PreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (previewRef.current) {
      const html = md.render(content)
      previewRef.current.innerHTML = html
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
