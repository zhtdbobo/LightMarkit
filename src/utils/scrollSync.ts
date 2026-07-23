/**
 * 将 Markdown 源码按行映射到预览 DOM 的滚动锚点。
 * 预览块在渲染时带 data-source-line（1-based 起始行），用于表格/图表等高差内容的分屏同步。
 */

export type SourceAnchor = {
  line: number
  top: number
}

const PRIORITY_BLOCK_SELECTOR = 'table, .mermaid'

/**
 * Resolve the source line represented by a reading probe inside the preview.
 * Tables and diagrams are treated as atomic blocks so their internal anchors
 * cannot repeatedly move the active outline item while the block is visible.
 */
export function resolvePreviewSourceLine(
  scroller: HTMLElement,
  probeRatio = 0.32
): number | null {
  const nodes = Array.from(
    scroller.querySelectorAll<HTMLElement>('[data-source-line]')
  )
  if (nodes.length === 0) {
    return null
  }

  const scrollerRect = scroller.getBoundingClientRect()
  const probeY = scrollerRect.top + scroller.clientHeight * probeRatio
  const priorityBlocks = nodes.filter((node) => node.matches(PRIORITY_BLOCK_SELECTOR))

  for (const block of priorityBlocks) {
    const rect = block.getBoundingClientRect()
    if (rect.top <= probeY && rect.bottom > probeY) {
      return parseSourceLine(block)
    }
  }

  let latestPassed: { line: number; top: number } | null = null
  let firstUpcoming: { line: number; top: number } | null = null

  for (const node of nodes) {
    const line = parseSourceLine(node)
    if (line === null) {
      continue
    }

    const priorityParent = node.closest(PRIORITY_BLOCK_SELECTOR)
    if (priorityParent && priorityParent !== node) {
      continue
    }

    const top = node.getBoundingClientRect().top
    if (top <= probeY) {
      if (
        latestPassed === null ||
        top > latestPassed.top ||
        (top === latestPassed.top && line > latestPassed.line)
      ) {
        latestPassed = { line, top }
      }
    } else if (
      firstUpcoming === null ||
      top < firstUpcoming.top ||
      (top === firstUpcoming.top && line < firstUpcoming.line)
    ) {
      firstUpcoming = { line, top }
    }
  }

  return latestPassed?.line ?? firstUpcoming?.line ?? null
}

function parseSourceLine(element: Element): number | null {
  const raw = element.getAttribute('data-source-line')
  if (!raw) {
    return null
  }

  const line = Number.parseInt(raw, 10)
  return Number.isFinite(line) && line > 0 ? line : null
}

export function collectPreviewAnchors(previewRoot: HTMLElement): SourceAnchor[] {
  const elements = previewRoot.querySelectorAll<HTMLElement>('[data-source-line]')
  const anchors: SourceAnchor[] = []
  const rootTop = previewRoot.getBoundingClientRect().top

  elements.forEach((element) => {
    const line = parseSourceLine(element)
    if (line === null) {
      return
    }

    const top = element.getBoundingClientRect().top - rootTop + previewRoot.scrollTop
    anchors.push({ line, top })
  })

  anchors.sort((a, b) => a.line - b.line || a.top - b.top)
  return anchors
}

export function estimateEditorLineFromScroll(
  scroller: HTMLElement,
  totalLines: number
): number {
  if (totalLines <= 1) {
    return 1
  }

  const maxScroll = scroller.scrollHeight - scroller.clientHeight
  if (maxScroll <= 0) {
    return 1
  }

  const ratio = Math.min(1, Math.max(0, scroller.scrollTop / maxScroll))
  return Math.min(totalLines, Math.max(1, Math.round(ratio * (totalLines - 1)) + 1))
}

export function getEditorLineAtViewportTop(
  scroller: HTMLElement,
  view: { lineBlockAtHeight: (height: number) => { from: number }; state: { doc: { lineAt: (pos: number) => { number: number } } } }
): number {
  const scrollerRect = scroller.getBoundingClientRect()
  const content = scroller.querySelector('.cm-content') as HTMLElement | null
  if (!content) {
    return 1
  }

  const contentRect = content.getBoundingClientRect()
  const yInDoc = scroller.scrollTop + (scrollerRect.top - contentRect.top) + 8
  try {
    const block = view.lineBlockAtHeight(Math.max(0, yInDoc))
    return view.state.doc.lineAt(block.from).number
  } catch {
    return 1
  }
}

/** 根据源码行在锚点列表中插值得到预览 scrollTop */
export function previewScrollTopForLine(
  anchors: SourceAnchor[],
  line: number,
  previewScroller: HTMLElement
): number {
  if (anchors.length === 0) {
    return 0
  }

  if (line <= anchors[0].line) {
    return Math.max(0, anchors[0].top)
  }

  const last = anchors[anchors.length - 1]
  if (line >= last.line) {
    const maxScroll = Math.max(0, previewScroller.scrollHeight - previewScroller.clientHeight)
    return maxScroll
  }

  let lower = anchors[0]
  let upper = last

  for (let index = 0; index < anchors.length - 1; index += 1) {
    if (anchors[index].line <= line && anchors[index + 1].line >= line) {
      lower = anchors[index]
      upper = anchors[index + 1]
      break
    }
  }

  if (upper.line === lower.line) {
    return lower.top
  }

  const t = (line - lower.line) / (upper.line - lower.line)
  return lower.top + t * (upper.top - lower.top)
}

/** 根据预览 scrollTop 反查源码行 */
export function sourceLineForPreviewScroll(
  anchors: SourceAnchor[],
  scrollTop: number,
  totalLines: number
): number {
  if (anchors.length === 0) {
    return 1
  }

  if (scrollTop <= anchors[0].top) {
    return anchors[0].line
  }

  const last = anchors[anchors.length - 1]
  if (scrollTop >= last.top) {
    return Math.min(totalLines, last.line)
  }

  let lower = anchors[0]
  let upper = last

  for (let index = 0; index < anchors.length - 1; index += 1) {
    if (anchors[index].top <= scrollTop && anchors[index + 1].top >= scrollTop) {
      lower = anchors[index]
      upper = anchors[index + 1]
      break
    }
  }

  if (upper.top === lower.top) {
    return lower.line
  }

  const t = (scrollTop - lower.top) / (upper.top - lower.top)
  return Math.round(lower.line + t * (upper.line - lower.line))
}

export function editorScrollTopForLine(
  _scroller: HTMLElement,
  view: {
    lineBlockAt: (pos: number) => { top: number }
    state: { doc: { line: (n: number) => { from: number }; lines: number } }
  },
  line: number
): number {
  const safeLine = Math.min(Math.max(1, line), view.state.doc.lines)
  const lineInfo = view.state.doc.line(safeLine)
  const block = view.lineBlockAt(lineInfo.from)
  return Math.max(0, block.top)
}
