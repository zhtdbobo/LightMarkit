import { Prec, StateEffect, StateField, type EditorState, type Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { copyTextToClipboard } from '../../utils/clipboard'
import { readImageAsDataUrl } from '../../utils/imageApi'
import { resolveLocalImagePath } from '../../utils/markdownRenderer'
import { findMarkdownTables, tablePreviewExtension } from './tablePreview'

const HEADING_NODE_PATTERN = /^(?:ATX|Setext)Heading([1-6])$/
// 分组：1=引用/缩进前缀，2=列表标记，3=复选框，4=勾选状态
const TASK_MARKER_PATTERN = /^((?:\s*>)*\s*)((?:[-+*]|\d+[.)])\s+)(\[([ xX])\])(?=\s)/

interface LivePreviewOptions {
  currentFile?: string | null
}

const toggleCodeBlockEffect = StateEffect.define<number>({
  map: (position, changes) => changes.mapPos(position, 1),
})

interface CollapsedCodeBlocksState {
  positions: ReadonlySet<number>
  decorations: DecorationSet
}

function buildCollapsedCodeDecorations(
  state: EditorState,
  positions: ReadonlySet<number>
): DecorationSet {
  const ranges: Range<Decoration>[] = []

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return

      const openingLine = state.doc.lineAt(node.from)
      if (positions.has(openingLine.from) && node.to > openingLine.to) {
        ranges.push(Decoration.replace({}).range(openingLine.to, node.to))
      }
    },
  })

  return Decoration.set(ranges, true)
}

const collapsedCodeBlocksField = StateField.define<CollapsedCodeBlocksState>({
  create: (state) => ({
    positions: new Set<number>(),
    decorations: buildCollapsedCodeDecorations(state, new Set<number>()),
  }),
  update(value, transaction) {
    let next = value.positions

    if (transaction.docChanged && value.positions.size > 0) {
      next = new Set(
        Array.from(value.positions, (position) => transaction.changes.mapPos(position, 1))
      )
    }

    for (const effect of transaction.effects) {
      if (!effect.is(toggleCodeBlockEffect)) continue

      const mutable = new Set(next)
      if (mutable.has(effect.value)) {
        mutable.delete(effect.value)
      } else {
        mutable.add(effect.value)
      }
      next = mutable
    }

    if (!transaction.docChanged && next === value.positions) {
      return value
    }

    return {
      positions: next,
      decorations: buildCollapsedCodeDecorations(transaction.state, next),
    }
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
})

function rangeIsActive(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some((range) => {
    if (range.empty) {
      return range.head >= from && range.head <= to
    }

    return range.from <= to && range.to >= from
  })
}

function parentSource(
  view: EditorView,
  node: { from: number; to: number; node: { parent: unknown } }
) {
  const parent = node.node.parent

  if (!parent || typeof parent !== 'object' || !('from' in parent) || !('to' in parent)) {
    return ''
  }

  return view.state.sliceDoc(parent.from as number, parent.to as number)
}

class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly markerFrom: number
  ) {
    super()
  }

  eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked && other.markerFrom === this.markerFrom
  }

  toDOM(view: EditorView): HTMLElement {
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.className = 'cm-wysiwyg-task-checkbox'
    checkbox.checked = this.checked
    checkbox.setAttribute('aria-label', this.checked ? '标记为未完成' : '标记为已完成')
    checkbox.title = this.checked ? '标记为未完成' : '标记为已完成'
    checkbox.addEventListener('change', () => {
      view.dispatch({
        changes: {
          from: this.markerFrom + 1,
          to: this.markerFrom + 2,
          insert: checkbox.checked ? 'x' : ' ',
        },
      })
      view.focus()
    })
    return checkbox
  }
}

class HorizontalRuleWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const rule = document.createElement('span')
    rule.className = 'cm-wysiwyg-horizontal-rule'
    rule.setAttribute('aria-hidden', 'true')
    return rule
  }
}

class ImagePreviewWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
    private readonly from: number,
    private readonly currentFile?: string | null
  ) {
    super()
  }

  eq(other: ImagePreviewWidget): boolean {
    return (
      other.src === this.src &&
      other.alt === this.alt &&
      other.from === this.from &&
      other.currentFile === this.currentFile
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span')
    const image = document.createElement('img')
    const fallback = document.createElement('span')
    const localPath = resolveLocalImagePath(this.src, this.currentFile)

    wrapper.className = 'cm-wysiwyg-image'
    wrapper.title = this.alt || this.src
    image.alt = this.alt
    image.draggable = false
    fallback.className = 'cm-wysiwyg-image-fallback'
    fallback.textContent = `图片加载失败：${this.alt || this.src}`

    const showFallback = () => {
      if (!wrapper.isConnected) return
      image.hidden = true
      fallback.hidden = false
    }

    fallback.hidden = true
    image.addEventListener('error', showFallback)

    if (localPath) {
      wrapper.classList.add('is-loading')
      void readImageAsDataUrl(localPath)
        .then((dataUrl) => {
          if (!wrapper.isConnected) return
          image.src = dataUrl
          wrapper.classList.remove('is-loading')
        })
        .catch(() => {
          wrapper.classList.remove('is-loading')
          showFallback()
        })
    } else {
      image.src = this.src
    }

    wrapper.append(image, fallback)
    wrapper.addEventListener('mousedown', (event) => {
      event.preventDefault()
    })
    wrapper.addEventListener('click', () => {
      view.dispatch({ selection: { anchor: this.from } })
      view.focus()
    })
    return wrapper
  }
}

const CODE_LANGUAGE_SUGGESTIONS = [
  'text',
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'html',
  'css',
  'json',
  'markdown',
  'python',
  'java',
  'c',
  'cpp',
  'csharp',
  'go',
  'rust',
  'php',
  'ruby',
  'swift',
  'kotlin',
  'sql',
  'bash',
  'powershell',
  'yaml',
] as const

function codeFenceInfoRange(view: EditorView, blockFrom: number) {
  const openingLine = view.state.doc.lineAt(blockFrom)
  const openingMatch = openingLine.text.match(/^(\s*)(`{3,}|~{3,})(.*)$/)
  if (!openingMatch) return null

  const from = openingLine.from + openingMatch[1].length + openingMatch[2].length
  return { from, to: openingLine.to }
}

function focusCodeBlockBody(view: EditorView, blockFrom: number) {
  const openingLine = view.state.doc.lineAt(blockFrom)

  if (openingLine.number === view.state.doc.lines) {
    view.dispatch({
      changes: { from: openingLine.to, insert: '\n' },
      selection: { anchor: openingLine.to + 1 },
    })
    view.focus()
    return
  }

  const nextLine = view.state.doc.line(openingLine.number + 1)
  if (/^\s*(?:`{3,}|~{3,})\s*$/.test(nextLine.text)) {
    view.dispatch({
      changes: { from: nextLine.from, insert: '\n' },
      selection: { anchor: nextLine.from },
    })
  } else {
    view.dispatch({ selection: { anchor: nextLine.from } })
  }
  view.focus()
}

function expandCollapsedCodeBlockOnEnter(view: EditorView): boolean {
  const selection = view.state.selection.main
  if (!selection.empty) return false

  const collapsedPositions = view.state.field(collapsedCodeBlocksField).positions
  for (const blockFrom of collapsedPositions) {
    const openingLine = view.state.doc.lineAt(blockFrom)

    // 检查光标是否在折叠代码块的首行或紧随其后的摘要行
    // 摘要 widget 渲染在 openingLine.to 之后，所以需要检查下一行的起始位置
    const nextLineStart = openingLine.number < view.state.doc.lines
      ? view.state.doc.line(openingLine.number + 1).from
      : view.state.doc.length

    if (selection.head >= openingLine.from && selection.head < nextLineStart) {
      view.dispatch({ effects: toggleCodeBlockEffect.of(blockFrom) })
      focusCodeBlockBody(view, blockFrom)
      return true
    }
  }

  return false
}

class CodeLanguageWidget extends WidgetType {
  constructor(
    private readonly language: string,
    private readonly blockFrom: number,
    private readonly collapsed: boolean
  ) {
    super()
  }

  eq(other: CodeLanguageWidget): boolean {
    return (
      other.language === this.language &&
      other.blockFrom === this.blockFrom &&
      other.collapsed === this.collapsed
    )
  }

  updateDOM(dom: HTMLElement): boolean {
    if (
      dom.dataset.blockFrom !== String(this.blockFrom) ||
      dom.dataset.collapsed !== String(this.collapsed)
    ) {
      return false
    }

    const input = dom.querySelector<HTMLInputElement>('.cm-code-language-input')
    if (!input) return false
    if (document.activeElement !== input) {
      input.value = this.language
    }
    input.style.setProperty('--language-length', String(Math.max(this.language.length, 4)))
    return true
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span')
    const input = document.createElement('input')
    const suggestions = document.createElement('datalist')
    const suggestionsId = `cm-code-languages-${this.blockFrom}`

    wrapper.className = 'cm-code-language-field'
    wrapper.dataset.blockFrom = String(this.blockFrom)
    wrapper.dataset.collapsed = String(this.collapsed)
    input.type = 'text'
    input.className = 'cm-code-language-input'
    input.value = this.language
    input.placeholder = '语言'
    input.autocomplete = 'off'
    input.spellcheck = false
    input.setAttribute('aria-label', '代码语言')
    input.setAttribute('list', suggestionsId)
    input.style.setProperty('--language-length', String(Math.max(this.language.length, 4)))
    suggestions.id = suggestionsId

    for (const language of CODE_LANGUAGE_SUGGESTIONS) {
      const option = document.createElement('option')
      option.value = language
      suggestions.append(option)
    }

    const commitLanguage = () => {
      const range = codeFenceInfoRange(view, this.blockFrom)
      if (!range || view.state.sliceDoc(range.from, range.to) === input.value) return
      view.dispatch({ changes: { ...range, insert: input.value } })
    }

    input.addEventListener('input', () => {
      const nextLanguage = input.value.replace(/\s+/g, '')
      if (nextLanguage !== input.value) {
        input.value = nextLanguage
      }
      input.style.setProperty('--language-length', String(Math.max(nextLanguage.length, 4)))
    })
    input.addEventListener('change', commitLanguage)
    input.addEventListener('blur', commitLanguage)

    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      event.stopPropagation()
      commitLanguage()
      if (this.collapsed) {
        view.dispatch({ effects: toggleCodeBlockEffect.of(this.blockFrom) })
      }
      focusCodeBlockBody(view, this.blockFrom)
    })

    wrapper.append(input, suggestions)
    return wrapper
  }
}

class CodeActionsWidget extends WidgetType {
  constructor(
    private readonly code: string,
    private readonly blockFrom: number,
    private readonly collapsed: boolean
  ) {
    super()
  }

  eq(other: CodeActionsWidget): boolean {
    return (
      other.code === this.code &&
      other.blockFrom === this.blockFrom &&
      other.collapsed === this.collapsed
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const actions = document.createElement('span')
    const copyButton = document.createElement('button')
    const toggleButton = document.createElement('button')

    actions.className = 'cm-code-actions'
    copyButton.type = 'button'
    copyButton.className = 'cm-code-copy-button'
    copyButton.textContent = '复制'
    copyButton.setAttribute('aria-label', '复制代码')
    copyButton.title = '复制代码'

    let feedbackTimer: number | undefined
    copyButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()

      void copyTextToClipboard(this.code)
        .then(() => {
          copyButton.textContent = '已复制'
          copyButton.classList.add('is-copied')
        })
        .catch(() => {
          copyButton.textContent = '复制失败'
          copyButton.classList.add('is-error')
        })
        .finally(() => {
          window.clearTimeout(feedbackTimer)
          feedbackTimer = window.setTimeout(() => {
            copyButton.textContent = '复制'
            copyButton.classList.remove('is-copied', 'is-error')
          }, 1600)
        })
    })

    toggleButton.type = 'button'
    toggleButton.className = 'cm-code-toggle-button'
    toggleButton.setAttribute('aria-expanded', String(!this.collapsed))
    toggleButton.setAttribute('aria-label', this.collapsed ? '展开代码块' : '折叠代码块')
    toggleButton.title = this.collapsed ? '展开代码块' : '折叠代码块'
    toggleButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      view.dispatch({ effects: toggleCodeBlockEffect.of(this.blockFrom) })
    })

    actions.append(copyButton, toggleButton)
    return actions
  }
}

class CollapsedCodeSummaryWidget extends WidgetType {
  constructor(
    private readonly firstLine: string,
    private readonly lineCount: number
  ) {
    super()
  }

  eq(other: CollapsedCodeSummaryWidget): boolean {
    return other.firstLine === this.firstLine && other.lineCount === this.lineCount
  }

  toDOM(): HTMLElement {
    const summary = document.createElement('span')
    summary.className = 'cm-code-collapse-summary'
    summary.textContent = `${this.firstLine} · ${this.lineCount} 行`
    summary.title = this.firstLine
    return summary
  }
}

function addLineClass(
  ranges: Range<Decoration>[],
  seen: Set<string>,
  view: EditorView,
  position: number,
  className: string
) {
  const lineFrom = view.state.doc.lineAt(position).from
  const key = `${lineFrom}:${className}`

  if (seen.has(key)) {
    return
  }

  seen.add(key)
  ranges.push(Decoration.line({ class: className }).range(lineFrom))
}

function addClassToLines(
  ranges: Range<Decoration>[],
  seen: Set<string>,
  view: EditorView,
  from: number,
  to: number,
  className: string
) {
  let line = view.state.doc.lineAt(from)
  const lastLine = view.state.doc.lineAt(Math.max(from, to - 1)).number

  while (line.number <= lastLine) {
    addLineClass(ranges, seen, view, line.from, className)
    if (line.number === view.state.doc.lines) break
    line = view.state.doc.line(line.number + 1)
  }
}

function decorateFencedCode(
  ranges: Range<Decoration>[],
  seenLines: Set<string>,
  view: EditorView,
  from: number,
  to: number,
  collapsedCodeBlocks: ReadonlySet<number>
) {
  const openingLine = view.state.doc.lineAt(from)
  const closingLine = view.state.doc.lineAt(Math.max(from, to - 1))
  const openingMatch = openingLine.text.match(/^(\s*)(`{3,}|~{3,})(.*)$/)
  const fenceCharacter = openingMatch?.[2][0]
  const minimumFenceLength = openingMatch?.[2].length ?? 3
  const closingPattern = fenceCharacter
    ? new RegExp(`^\\s*\\${fenceCharacter}{${minimumFenceLength},}\\s*$`)
    : null
  const hasClosingFence =
    closingLine.number > openingLine.number && closingPattern?.test(closingLine.text) === true
  const collapsed = collapsedCodeBlocks.has(openingLine.from)

  addLineClass(ranges, seenLines, view, openingLine.from, 'cm-wysiwyg-code-start')

  if (openingMatch) {
    const fenceFrom = openingLine.from + openingMatch[1].length
    const fenceTo = fenceFrom + openingMatch[2].length
    ranges.push(Decoration.replace({}).range(fenceFrom, fenceTo))

    const info = openingMatch[3]
    const trimmedInfo = info.trim()
    const languageWidget = new CodeLanguageWidget(trimmedInfo, openingLine.from, collapsed)
    ranges.push(Decoration.widget({ widget: languageWidget, side: 1 }).range(fenceTo))
    if (info.length > 0) {
      ranges.push(Decoration.replace({}).range(fenceTo, openingLine.to))
    }
  }

  const contentFrom = Math.min(openingLine.to + 1, to)
  const contentTo = hasClosingFence ? closingLine.from : to
  const code = view.state.sliceDoc(contentFrom, contentTo).replace(/\n$/, '')
  const codeLines = code ? code.split('\n') : []
  const firstCodeLine = codeLines.find((line) => line.trim())?.trim() ?? '空代码块'
  const lastCodeLineNumber = hasClosingFence ? closingLine.number - 1 : closingLine.number

  if (collapsed) {
    addLineClass(ranges, seenLines, view, openingLine.from, 'cm-wysiwyg-code-collapsed')
    ranges.push(
      Decoration.widget({
        widget: new CollapsedCodeSummaryWidget(firstCodeLine, codeLines.length),
        side: -2,
      }).range(openingLine.to)
    )
  } else if (openingLine.number <= lastCodeLineNumber) {
    // 每一行代码都需要相同的块级背景和左右边界。只装饰首行会让多行代码块断裂。
    for (
      let lineNumber = openingLine.number + 1;
      lineNumber <= lastCodeLineNumber;
      lineNumber += 1
    ) {
      const line = view.state.doc.line(lineNumber)
      addLineClass(ranges, seenLines, view, line.from, 'cm-wysiwyg-code-line')
    }
  }

  if (hasClosingFence && !collapsed) {
    addLineClass(ranges, seenLines, view, closingLine.from, 'cm-wysiwyg-code-end')
    if (closingLine.length > 0) {
      ranges.push(Decoration.replace({}).range(closingLine.from, closingLine.to))
    }
  } else if (!collapsed && lastCodeLineNumber > openingLine.number) {
    addLineClass(
      ranges,
      seenLines,
      view,
      view.state.doc.line(lastCodeLineNumber).from,
      'cm-wysiwyg-code-last-line'
    )
  } else if (!collapsed && lastCodeLineNumber === openingLine.number && !hasClosingFence) {
    // 空代码块没有结束标记时，给开头行添加底部边框
    addLineClass(
      ranges,
      seenLines,
      view,
      openingLine.from,
      'cm-wysiwyg-code-last-line'
    )
  }

  if (contentTo >= contentFrom) {
    ranges.push(
      Decoration.widget({
        widget: new CodeActionsWidget(code, openingLine.from, collapsed),
        side: -1,
      }).range(openingLine.to)
    )
  }
}

interface DocumentRange {
  from: number
  to: number
}

function overlapsAnyRange(ranges: readonly DocumentRange[], from: number, to: number): boolean {
  return ranges.some((range) => from < range.to && to > range.from)
}

function buildLivePreviewDecorations(view: EditorView, options: LivePreviewOptions): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const seenLines = new Set<string>()
  const tables = findMarkdownTables(view.state.doc)
  const collapsedCodeBlocks = view.state.field(collapsedCodeBlocksField).positions
  // 代码块与表格内的文本不参与任务列表识别，否则会误渲染出可点击的复选框
  const codeRanges: DocumentRange[] = []

  syntaxTree(view.state).iterate({
    enter(node) {
      const table = tables.find(
        (candidate) => node.from >= candidate.from && node.to <= candidate.to
      )
      if (table) return false

      const headingMatch = node.name.match(HEADING_NODE_PATTERN)
      if (headingMatch) {
        addLineClass(
          ranges,
          seenLines,
          view,
          node.from,
          `cm-wysiwyg-heading cm-wysiwyg-h${headingMatch[1]}`
        )
      }

      if (node.name === 'StrongEmphasis') {
        ranges.push(Decoration.mark({ class: 'cm-wysiwyg-strong' }).range(node.from, node.to))
      } else if (node.name === 'Emphasis') {
        ranges.push(Decoration.mark({ class: 'cm-wysiwyg-emphasis' }).range(node.from, node.to))
      } else if (node.name === 'InlineCode') {
        ranges.push(Decoration.mark({ class: 'cm-wysiwyg-inline-code' }).range(node.from, node.to))
      } else if (node.name === 'Strikethrough') {
        ranges.push(
          Decoration.mark({ class: 'cm-wysiwyg-strikethrough' }).range(node.from, node.to)
        )
      } else if (node.name === 'Blockquote') {
        addClassToLines(ranges, seenLines, view, node.from, node.to, 'cm-wysiwyg-blockquote')
      } else if (node.name === 'FencedCode') {
        codeRanges.push({ from: node.from, to: node.to })
        decorateFencedCode(ranges, seenLines, view, node.from, node.to, collapsedCodeBlocks)
        return false
      } else if (node.name === 'CodeBlock') {
        codeRanges.push({ from: node.from, to: node.to })
        return false
      } else if (node.name === 'HorizontalRule') {
        ranges.push(
          Decoration.replace({ widget: new HorizontalRuleWidget() }).range(node.from, node.to)
        )
        addLineClass(ranges, seenLines, view, node.from, 'cm-wysiwyg-hr-line')
        return false
      }

      const parent = node.node.parent
      const parentFrom = parent?.from ?? node.from
      const parentTo = parent?.to ?? node.to
      const active = rangeIsActive(view, parentFrom, parentTo)

      if (node.name === 'Image' && !active) {
        const urlNode = node.node.getChild('URL')

        if (urlNode) {
          const source = view.state.sliceDoc(node.from, node.to)
          const alt = source.match(/^!\[([^\]]*)\]/)?.[1] ?? ''
          const src = view.state.sliceDoc(urlNode.from, urlNode.to)
          ranges.push(
            Decoration.replace({
              widget: new ImagePreviewWidget(src, alt, node.from, options.currentFile),
            }).range(node.from, node.to)
          )
          return false
        }
      }

      if (
        !active &&
        (node.name === 'HeaderMark' ||
          node.name === 'EmphasisMark' ||
          node.name === 'CodeMark' ||
          node.name === 'QuoteMark')
      ) {
        ranges.push(Decoration.replace({}).range(node.from, node.to))
      }

      if (!active && (node.name === 'LinkMark' || node.name === 'URL')) {
        const source = parentSource(view, node)
        if (!/^\[[ xX]\]$/.test(source)) {
          ranges.push(Decoration.replace({}).range(node.from, node.to))
        }
      }

      if (node.name === 'Link' && !/^\[[ xX]\]$/.test(view.state.sliceDoc(node.from, node.to))) {
        ranges.push(Decoration.mark({ class: 'cm-wysiwyg-link' }).range(node.from, node.to))
      }
    },
  })

  const taskExclusions: DocumentRange[] = [...codeRanges, ...tables]

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber)

    if (overlapsAnyRange(taskExclusions, line.from, line.to)) {
      continue
    }

    const taskMatch = line.text.match(TASK_MARKER_PATTERN)

    if (!taskMatch) {
      continue
    }

    const listMarkerFrom = line.from + taskMatch[1].length
    const markerFrom = listMarkerFrom + taskMatch[2].length
    ranges.push(
      Decoration.replace({
        widget: new TaskCheckboxWidget(taskMatch[4].toLowerCase() === 'x', markerFrom),
      }).range(listMarkerFrom, markerFrom + taskMatch[3].length)
    )
    addLineClass(ranges, seenLines, view, line.from, 'cm-wysiwyg-task-line')
  }

  return Decoration.set(ranges, true)
}

class LivePreviewPlugin {
  decorations: DecorationSet

  constructor(
    view: EditorView,
    private readonly options: LivePreviewOptions
  ) {
    this.decorations = buildLivePreviewDecorations(view, options)
  }

  update(update: ViewUpdate) {
    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      update.startState.field(collapsedCodeBlocksField) !==
        update.state.field(collapsedCodeBlocksField)
    ) {
      this.decorations = buildLivePreviewDecorations(update.view, this.options)
    }
  }
}

const livePreviewPlugin = ViewPlugin.fromClass<LivePreviewPlugin, LivePreviewOptions>(
  LivePreviewPlugin,
  {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      dblclick: (event, view) => {
        const target = event.target as HTMLElement
        const codeLine = target.closest('.cm-line')
        if (!codeLine) return false

        const pos = view.posAtDOM(codeLine)
        if (pos === null) return false

        const collapsedPositions = view.state.field(collapsedCodeBlocksField).positions

        // 检查是否双击了代码块的首行
        for (const blockFrom of collapsedPositions) {
          const openingLine = view.state.doc.lineAt(blockFrom)
          if (pos >= openingLine.from && pos <= openingLine.to) {
            view.dispatch({ effects: toggleCodeBlockEffect.of(blockFrom) })
            return true
          }
        }

        // 检查是否双击了展开的代码块首行
        const clickedLine = view.state.doc.lineAt(pos)
        if (codeLine.classList.contains('cm-wysiwyg-code-start')) {
          view.dispatch({ effects: toggleCodeBlockEffect.of(clickedLine.from) })
          return true
        }

        return false
      },
    },
  }
)

export function createLivePreview(options: LivePreviewOptions = {}) {
  return [
    collapsedCodeBlocksField,
    Prec.highest(
      keymap.of([
        {
          key: 'Enter',
          run: expandCollapsedCodeBlockOnEnter,
        },
      ])
    ),
    livePreviewPlugin.of(options),
    tablePreviewExtension,
  ]
}
