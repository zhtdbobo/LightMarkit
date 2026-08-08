import MarkdownIt from 'markdown-it'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import { readImageAsDataUrl } from './imageApi'

interface MarkdownRenderOptions {
  currentFile?: string | null
}

interface MarkdownRenderEnv {
  currentFile?: string | null
}

const MATH_SYMBOLS: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ϵ',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  sigma: 'σ',
  phi: 'ϕ',
  omega: 'ω',
  sum: '∑',
  prod: '∏',
  infty: '∞',
  cdot: '⋅',
  times: '×',
  mid: '∣',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  neq: '≠',
  pm: '±',
}

function escapeMathText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderMathText(value: string, variant = 'normal'): string {
  return `<mrow>${Array.from(value)
    .map((character) => {
      if (/\d/.test(character)) return `<mn>${character}</mn>`
      if (/[A-Za-z]/.test(character)) {
        return `<mi mathvariant="${variant}">${escapeMathText(character)}</mi>`
      }
      return `<mo>${escapeMathText(character)}</mo>`
    })
    .join('')}</mrow>`
}

function renderMathExpression(source: string): string {
  let cursor = 0

  const skipWhitespace = () => {
    while (/\s/.test(source[cursor] ?? '')) cursor += 1
  }

  const readRawArgument = (): string => {
    skipWhitespace()
    if (source[cursor] !== '{') return source[cursor++] ?? ''

    cursor += 1
    const start = cursor
    let depth = 1

    while (cursor < source.length && depth > 0) {
      if (source[cursor] === '{') depth += 1
      if (source[cursor] === '}') depth -= 1
      cursor += 1
    }

    return source.slice(start, Math.max(start, cursor - 1))
  }

  const parseSequence = (stopAtClosingBrace = false): string => {
    const nodes: string[] = []

    while (cursor < source.length) {
      skipWhitespace()
      const character = source[cursor]

      if (!character) break
      if (stopAtClosingBrace && character === '}') {
        cursor += 1
        break
      }

      if (character === '^' || character === '_') {
        cursor += 1
        const script = parseArgument()
        const base = nodes.pop() ?? '<mo>□</mo>'
        nodes.push(character === '^' ? `<msup>${base}${script}</msup>` : `<msub>${base}${script}</msub>`)
        continue
      }

      nodes.push(parseAtom())
    }

    return nodes.join('')
  }

  const parseArgument = (): string => {
    skipWhitespace()
    if (source[cursor] === '{') {
      cursor += 1
      return `<mrow>${parseSequence(true)}</mrow>`
    }
    return parseAtom()
  }

  const parseCommand = (): string => {
    cursor += 1
    const commandStart = cursor

    while (/[A-Za-z]/.test(source[cursor] ?? '')) cursor += 1

    const command = source.slice(commandStart, cursor)
    if (!command) {
      return `<mo>${escapeMathText(source[cursor++] ?? '')}</mo>`
    }

    if (command === 'frac') {
      return `<mfrac>${parseArgument()}${parseArgument()}</mfrac>`
    }

    if (command === 'mathrm' || command === 'text' || command === 'operatorname') {
      const variant = command === 'text' ? 'normal' : 'normal'
      return renderMathText(readRawArgument(), variant)
    }

    if (command === 'mathbf' || command === 'boldsymbol') {
      return renderMathText(readRawArgument(), 'bold')
    }

    if (command === 'mathit') {
      return renderMathText(readRawArgument(), 'italic')
    }

    if (command === 'left' || command === 'right') {
      return ''
    }

    if (command === 'log' || command === 'ln' || command === 'sin' || command === 'cos') {
      return `<mi mathvariant="normal">${command}</mi>`
    }

    const symbol = MATH_SYMBOLS[command]
    if (symbol) return `<mo>${symbol}</mo>`

    return `<mtext>${escapeMathText(`\\${command}`)}</mtext>`
  }

  const parseAtom = (): string => {
    const character = source[cursor]

    if (character === '{') {
      cursor += 1
      return `<mrow>${parseSequence(true)}</mrow>`
    }

    if (character === '\\') return parseCommand()

    if (/\d/.test(character ?? '')) {
      const start = cursor
      while (/[\d.]/.test(source[cursor] ?? '')) cursor += 1
      return `<mn>${source.slice(start, cursor)}</mn>`
    }

    cursor += 1
    if (/[A-Za-z]/.test(character ?? '')) return `<mi>${escapeMathText(character)}</mi>`
    if ('=+-*/(),[]<>|'.includes(character ?? '')) {
      const operator = character === '-' ? '−' : character
      return `<mo>${escapeMathText(operator)}</mo>`
    }
    return `<mtext>${escapeMathText(character ?? '')}</mtext>`
  }

  return parseSequence()
}

function renderMathHtml(source: string, displayMode: boolean): string {
  const display = displayMode ? 'block' : 'inline'
  const body = renderMathExpression(source.trim()) || '<mtext>□</mtext>'
  return `<math class="math-${display}" xmlns="http://www.w3.org/1998/Math/MathML" display="${display}"><mrow>${body}</mrow></math>`
}

const WINDOWS_DRIVE_PATH_PATTERN = /^[a-zA-Z]:(?:[\\/]|$)/
const WINDOWS_DRIVE_ENCODED_PATH_PATTERN = /^[a-zA-Z]:(?:%5[cC]|%2[fF])/
const LOCAL_IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)(?:[?#].*)?$/i
const URL_PROTOCOL_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/

function safeDecodeUrl(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    try {
      return decodeURI(value)
    } catch {
      return value
    }
  }
}

function stripQueryAndHash(path: string): string {
  const queryIndex = path.indexOf('?')
  const hashIndex = path.indexOf('#')
  const indexes = [queryIndex, hashIndex].filter((index) => index >= 0)

  return indexes.length > 0 ? path.slice(0, Math.min(...indexes)) : path
}

function isImagePath(path: string): boolean {
  return LOCAL_IMAGE_EXTENSION_PATTERN.test(path)
}

function fileUrlToPath(value: string): string | null {
  try {
    const url = new URL(value)

    if (url.protocol !== 'file:') {
      return null
    }

    const decodedPath = safeDecodeUrl(url.pathname)

    if (url.host) {
      return `\\\\${url.host}${decodedPath.replace(/\//g, '\\')}`
    }

    if (/^\/[a-zA-Z]:\//.test(decodedPath)) {
      return decodedPath.slice(1).replace(/\//g, '\\')
    }

    return decodedPath
  } catch {
    return null
  }
}

function getDirectoryName(path: string): string {
  const normalizedPath = stripQueryAndHash(path)
  const separatorIndex = Math.max(normalizedPath.lastIndexOf('\\'), normalizedPath.lastIndexOf('/'))

  return separatorIndex >= 0 ? normalizedPath.slice(0, separatorIndex) : ''
}

function normalizeJoinedPath(path: string): string {
  const isWindowsPath = WINDOWS_DRIVE_PATH_PATTERN.test(path) || path.includes('\\')
  const separator = isWindowsPath ? '\\' : '/'
  const driveMatch = path.match(/^([a-zA-Z]:)[\\/]?/)
  const hasRoot = path.startsWith('/') || path.startsWith('\\')
  const prefix = driveMatch ? driveMatch[1] : hasRoot ? separator : ''
  const rest = driveMatch ? path.slice(driveMatch[0].length) : path.replace(/^[\\/]+/, '')
  const parts: string[] = []

  rest.split(/[\\/]+/).forEach((part) => {
    if (!part || part === '.') {
      return
    }

    if (part === '..') {
      parts.pop()
      return
    }

    parts.push(part)
  })

  if (driveMatch) {
    return `${prefix}${separator}${parts.join(separator)}`
  }

  return `${prefix}${parts.join(separator)}`
}

function resolveRelativeImagePath(src: string, currentFile?: string | null): string | null {
  if (!currentFile || !isImagePath(src)) {
    return null
  }

  const baseDirectory = getDirectoryName(currentFile)

  if (!baseDirectory) {
    return null
  }

  const separator = WINDOWS_DRIVE_PATH_PATTERN.test(currentFile) || currentFile.includes('\\') ? '\\' : '/'

  return normalizeJoinedPath(`${baseDirectory}${separator}${src}`)
}

export function resolveLocalImagePath(src: string | null, currentFile?: string | null): string | null {
  if (!src) {
    return null
  }

  const rawSrc = src.trim()

  if (!rawSrc) {
    return null
  }

  if (WINDOWS_DRIVE_ENCODED_PATH_PATTERN.test(rawSrc)) {
    const decodedPath = stripQueryAndHash(safeDecodeUrl(rawSrc))
    return isImagePath(decodedPath) ? decodedPath : null
  }

  const fileUrlPath = fileUrlToPath(rawSrc)

  if (fileUrlPath) {
    const cleanPath = stripQueryAndHash(fileUrlPath)
    return isImagePath(cleanPath) ? cleanPath : null
  }

  const decodedSrc = safeDecodeUrl(rawSrc)
  const cleanSrc = stripQueryAndHash(decodedSrc)

  if (WINDOWS_DRIVE_PATH_PATTERN.test(cleanSrc) || cleanSrc.startsWith('\\\\')) {
    return isImagePath(cleanSrc) ? cleanSrc : null
  }

  if (cleanSrc.startsWith('/') && isImagePath(cleanSrc)) {
    return cleanSrc
  }

  if (URL_PROTOCOL_PATTERN.test(cleanSrc) || cleanSrc.startsWith('//')) {
    return null
  }

  return resolveRelativeImagePath(cleanSrc, currentFile)
}

// 创建 markdown-it 实例并配置 GFM 插件
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
})
  // 预览为只读视图，复选框仅作展示；勾选请在编辑器中进行
  .use(taskLists, {
    enabled: false,
    label: true,
    labelAfter: true,
  })
  .use(footnote)
  .enable(['table', 'strikethrough'])

md.block.ruler.before('fence', 'math_block', (state, startLine, _endLine, silent) => {
  const start = state.bMarks[startLine] + state.tShift[startLine]
  const end = state.eMarks[startLine]
  const firstLine = state.src.slice(start, end).trim()

  if (!firstLine.startsWith('$$')) return false

  let nextLine = startLine + 1
  let content = ''

  if (firstLine.length > 4 && firstLine.endsWith('$$')) {
    content = firstLine.slice(2, -2).trim()
  } else if (firstLine === '$$') {
    while (nextLine < _endLine) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine]
      const lineEnd = state.eMarks[nextLine]
      const line = state.src.slice(lineStart, lineEnd).trim()

      if (line === '$$') break
      nextLine += 1
    }

    if (nextLine >= _endLine) return false
    content = state.getLines(startLine + 1, nextLine, state.blkIndent, true).trim()
    nextLine += 1
  } else {
    return false
  }

  if (silent) return true

  const token = state.push('math_block', 'div', 0)
  token.block = true
  token.map = [startLine, nextLine]
  token.content = content
  state.line = nextLine
  return true
})

md.inline.ruler.before('escape', 'math_inline', (state, silent) => {
  const start = state.pos
  if (state.src.charCodeAt(start) !== 0x24 || state.src.charCodeAt(start + 1) === 0x24) {
    return false
  }

  let end = start + 1
  while (end < state.posMax) {
    if (state.src.charCodeAt(end) === 0x24 && state.src.charCodeAt(end - 1) !== 0x5c) break
    if (state.src.charCodeAt(end) === 0x0a) return false
    end += 1
  }

  if (end >= state.posMax || end === start + 1) return false

  const content = state.src.slice(start + 1, end)
  if (!content.trim() || /^\s|\s$/.test(content)) return false
  if (silent) return true

  const token = state.push('math_inline', '', 0)
  token.content = content
  token.markup = '$'
  state.pos = end + 1
  return true
})

md.renderer.rules.math_block = (tokens, idx) => {
  const sourceLine = tokens[idx].attrGet('data-source-line')
  const sourceAttr = sourceLine ? ` data-source-line="${sourceLine}"` : ''
  return `<div class="math-block"${sourceAttr}>${renderMathHtml(tokens[idx].content, true)}</div>`
}
md.renderer.rules.math_inline = (tokens, idx) => renderMathHtml(tokens[idx].content, false)

const defaultValidateLink = md.validateLink.bind(md)
md.validateLink = (url) => {
  return url.toLowerCase().startsWith('file:') || defaultValidateLink(url)
}

// 为块级节点写入源码行号，供分屏滚动同步使用
md.core.ruler.push('source_line_attrs', (state) => {
  for (const token of state.tokens) {
    if (token.map && token.map.length >= 1 && token.type.endsWith('_open')) {
      token.attrSet('data-source-line', String(token.map[0] + 1))
    }

    if (token.map && token.type === 'fence') {
      token.attrSet('data-source-line', String(token.map[0] + 1))
    }

    if (token.map && token.type === 'html_block') {
      token.attrSet('data-source-line', String(token.map[0] + 1))
    }

    if (token.map && token.type === 'math_block') {
      token.attrSet('data-source-line', String(token.map[0] + 1))
    }
  }
})

// 添加 Mermaid 代码块处理
const defaultFenceRenderer = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const code = token.content.trim()
  const info = token.info ? token.info.trim() : ''

  if (info === 'mermaid') {
    const sourceLine = token.attrGet('data-source-line')
    const sourceAttr = sourceLine ? ` data-source-line="${sourceLine}"` : ''
    return `<div class="mermaid"${sourceAttr}>${md.utils.escapeHtml(code)}</div>`
  }

  return defaultFenceRenderer(tokens, idx, options, env, self)
}

const defaultImageRenderer = md.renderer.rules.image
md.renderer.rules.image = (tokens, idx, options, env: MarkdownRenderEnv, self) => {
  const token = tokens[idx]
  const rawSrc = token.attrGet('src')
  const localPath = resolveLocalImagePath(rawSrc, env.currentFile)

  if (localPath) {
    token.attrSet('data-local-src', localPath)
    token.attrSet('data-original-src', rawSrc ?? localPath)
  }

  return defaultImageRenderer
    ? defaultImageRenderer(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options)
}

const defaultLinkOpenRenderer = md.renderer.rules.link_open
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const href = token.attrGet('href') ?? ''

  if (/^https?:\/\//i.test(href)) {
    token.attrJoin('class', 'preview-external-link')
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noopener noreferrer')
    token.attrSet('data-external-link', 'true')
  }

  return defaultLinkOpenRenderer
    ? defaultLinkOpenRenderer(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options)
}

export function renderMarkdownToHtml(content: string, options: MarkdownRenderOptions = {}): string {
  return md.render(content, { currentFile: options.currentFile })
}

export async function renderMermaidDiagrams(root: ParentNode): Promise<void> {
  const mermaidElements = Array.from(root.querySelectorAll<HTMLElement>('.mermaid'))

  if (mermaidElements.length === 0 || typeof window === 'undefined') {
    return
  }

  const mermaidModule = await import('mermaid')
  const mermaid = mermaidModule.default

  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
  })

  await Promise.all(
    mermaidElements.map(async (element, index) => {
      const graphDefinition = element.textContent?.trim() ?? ''

      if (!graphDefinition || element.querySelector('svg')) {
        return
      }

      const id = `mermaid-${Date.now()}-${index}`

      try {
        const { svg, bindFunctions } = await mermaid.render(id, graphDefinition)

        element.innerHTML = svg
        element.removeAttribute('data-mermaid-error')
        element.querySelectorAll<SVGTextElement>('text').forEach((textElement) => {
          const hasExplicitFill = textElement.hasAttribute('fill')
          const hasStyleFill = /(?:^|;)\s*fill\s*:/.test(textElement.getAttribute('style') ?? '')

          if (!hasExplicitFill && !hasStyleFill) {
            textElement.setAttribute('fill', 'currentColor')
          }
        })
        bindFunctions?.(element)
      } catch (error) {
        // 单个图表失败不应影响其他图表，同时要让用户看到失败原因而不是一段原始文本
        const message = error instanceof Error ? error.message : String(error)

        element.setAttribute('data-mermaid-error', 'true')
        element.textContent = ''

        const errorTitle = document.createElement('strong')
        errorTitle.className = 'mermaid-error-title'
        errorTitle.textContent = 'Mermaid 图表渲染失败'

        const errorMessage = document.createElement('pre')
        errorMessage.className = 'mermaid-error-message'
        errorMessage.textContent = message

        const source = document.createElement('pre')
        source.className = 'mermaid-error-source'
        source.textContent = graphDefinition

        element.append(errorTitle, errorMessage, source)

        // mermaid 解析失败时会把临时节点留在 body 上，需要自行清理
        document.getElementById(id)?.remove()
        document.getElementById(`d${id}`)?.remove()
      }
    })
  )
}

export async function hydrateLocalImages(
  root: ParentNode,
  options: MarkdownRenderOptions = {}
): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'))

  await Promise.all(
    images.map(async (image) => {
      const localPath =
        image.getAttribute('data-local-src') ||
        resolveLocalImagePath(image.getAttribute('src'), options.currentFile)

      if (!localPath) {
        return
      }

      image.setAttribute('data-local-src', localPath)
      image.setAttribute('data-local-image-state', 'loading')

      try {
        const dataUrl = await readImageAsDataUrl(localPath)
        image.setAttribute('src', dataUrl)
        image.removeAttribute('data-local-src')
        image.removeAttribute('data-local-image-state')
      } catch (error) {
        image.setAttribute('data-local-image-state', 'error')
        image.setAttribute(
          'title',
          `图片加载失败：${error instanceof Error ? error.message : String(error)}`
        )
      }
    })
  )
}

export async function renderMarkdownToHtmlWithEmbeddedImages(
  content: string,
  options: MarkdownRenderOptions = {}
): Promise<string> {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = renderMarkdownToHtml(content, options)
  await hydrateLocalImages(wrapper, options)

  return wrapper.innerHTML
}

export async function renderMarkdownToExportHtml(
  content: string,
  options: MarkdownRenderOptions = {}
): Promise<string> {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = renderMarkdownToHtml(content, options)
  await hydrateLocalImages(wrapper, options)
  await renderMermaidDiagrams(wrapper)

  return wrapper.innerHTML
}
