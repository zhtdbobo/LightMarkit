import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import { readImageAsDataUrl } from './imageApi'

interface MarkdownRenderOptions {
  currentFile?: string | null
}

interface MarkdownRenderEnv {
  currentFile?: string | null
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
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
})
  .use(taskLists, {
    enabled: true,
    label: true,
    labelAfter: true,
  })
  .enable(['table', 'strikethrough'])

const defaultValidateLink = md.validateLink.bind(md)
md.validateLink = (url) => {
  return url.toLowerCase().startsWith('file:') || defaultValidateLink(url)
}

// 添加 Mermaid 代码块处理
const defaultFenceRenderer = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const code = token.content.trim()
  const info = token.info ? token.info.trim() : ''

  if (info === 'mermaid') {
    return `<div class="mermaid">${md.utils.escapeHtml(code)}</div>`
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
    securityLevel: 'loose',
  })

  await Promise.all(
    mermaidElements.map(async (element, index) => {
      const graphDefinition = element.textContent?.trim() ?? ''

      if (!graphDefinition || element.querySelector('svg')) {
        return
      }

      const id = `mermaid-${Date.now()}-${index}`
      const { svg, bindFunctions } = await mermaid.render(id, graphDefinition)

      element.innerHTML = svg
      element.querySelectorAll<SVGTextElement>('text').forEach((textElement) => {
        const hasExplicitFill = textElement.hasAttribute('fill')
        const hasStyleFill = /(?:^|;)\s*fill\s*:/.test(textElement.getAttribute('style') ?? '')

        if (!hasExplicitFill && !hasStyleFill) {
          textElement.setAttribute('fill', 'currentColor')
        }
      })
      bindFunctions?.(element)
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
