import { useEffect, useMemo, useRef } from 'react'
import {
  hydrateLocalImages,
  renderMarkdownToHtml,
  renderMermaidDiagrams,
} from '../utils/markdownRenderer'
import './Preview.css'

interface PreviewProps {
  content: string
  currentFile?: string | null
  className?: string
}

export function Preview({ content, currentFile = null, className = '' }: PreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const renderedHtml = useMemo(
    () => renderMarkdownToHtml(content, { currentFile }),
    [content, currentFile]
  )

  useEffect(() => {
    const root = previewRef.current

    if (!root) {
      return
    }

    root.innerHTML = renderedHtml

    void hydrateLocalImages(root, { currentFile })
    void renderMermaidDiagrams(root).catch((error) => {
      console.error('Mermaid rendering error:', error)
    })
  }, [renderedHtml, currentFile])

  return (
    <div
      ref={previewRef}
      className={`preview-container ${className}`}
      data-testid="preview-container"
    />
  )
}
