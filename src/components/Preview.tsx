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

const CODE_LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JS',
  js: 'JS',
  typescript: 'TS',
  ts: 'TS',
  python: 'PY',
  py: 'PY',
  shell: 'SH',
  bash: 'SH',
}

export function Preview({ content, currentFile = null, className = '' }: PreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const collapsedCodeBlocksRef = useRef<Map<string, Set<string>>>(new Map())
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

    const documentKey = currentFile ?? '__untitled__'
    const collapsedBlockKeys = collapsedCodeBlocksRef.current.get(documentKey) ?? new Set<string>()

    root.querySelectorAll<HTMLPreElement>('pre').forEach((codeBlock, index) => {
      const sourceLine = codeBlock.getAttribute('data-source-line')
      const blockKey = sourceLine ? `line-${sourceLine}` : `index-${index}`
      const wrapper = document.createElement('div')
      const summary = document.createElement('div')
      const languageLabel = document.createElement('span')
      const firstLineLabel = document.createElement('span')
      const lineCountLabel = document.createElement('span')
      const toggle = document.createElement('button')
      const codeElement = codeBlock.querySelector('code')
      const normalizedCode = (codeElement?.textContent ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/\n$/, '')
      const codeLines = normalizedCode ? normalizedCode.split('\n') : []
      const firstLine = codeLines.find((line) => line.trim())?.trim() ?? '空代码块'
      const languageClass = Array.from(codeElement?.classList ?? []).find((className) =>
        className.startsWith('language-')
      )
      const rawLanguage = languageClass?.slice('language-'.length).toLowerCase() ?? 'code'

      wrapper.className = 'preview-code-block'
      codeBlock.parentNode?.insertBefore(wrapper, codeBlock)
      wrapper.append(codeBlock)

      summary.className = 'preview-code-summary'
      languageLabel.className = 'preview-code-language'
      languageLabel.textContent = CODE_LANGUAGE_LABELS[rawLanguage] ?? rawLanguage.toUpperCase()
      firstLineLabel.className = 'preview-code-first-line'
      firstLineLabel.textContent = firstLine
      firstLineLabel.title = firstLine
      lineCountLabel.className = 'preview-code-line-count'
      lineCountLabel.textContent = `${codeLines.length} 行`
      summary.append(languageLabel, firstLineLabel, lineCountLabel)
      wrapper.append(summary)

      toggle.type = 'button'
      toggle.className = 'preview-code-toggle'
      wrapper.append(toggle)

      const setCollapsed = (collapsed: boolean) => {
        codeBlock.hidden = collapsed
        summary.hidden = !collapsed
        wrapper.classList.toggle('is-collapsed', collapsed)
        toggle.setAttribute('aria-expanded', String(!collapsed))
        toggle.setAttribute('aria-label', collapsed ? '展开代码块' : '折叠代码块')
        toggle.title = collapsed ? '展开代码块' : '折叠代码块'
      }

      setCollapsed(collapsedBlockKeys.has(blockKey))

      toggle.addEventListener('click', () => {
        const collapsed = !codeBlock.hidden

        if (collapsed) {
          collapsedBlockKeys.add(blockKey)
          collapsedCodeBlocksRef.current.set(documentKey, collapsedBlockKeys)
        } else {
          collapsedBlockKeys.delete(blockKey)
        }

        setCollapsed(collapsed)
      })
    })

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
