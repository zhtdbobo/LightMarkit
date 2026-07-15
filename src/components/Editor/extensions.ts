import { EditorState, Extension } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { EditorView } from 'codemirror'
import { slashCommandSource } from './slashCommands'

const headingHighlightStyle = HighlightStyle.define([{ tag: tags.heading, class: 'cm-heading' }])

/**
 * 包裹选中文字的辅助函数
 */
function wrapSelection(view: EditorView, before: string, after: string = before) {
  const { state } = view
  const { from, to } = state.selection.main
  const selectedText = state.sliceDoc(from, to)

  if (selectedText) {
    // 有选中文字，包裹它
    view.dispatch({
      changes: [{ from, to, insert: `${before}${selectedText}${after}` }],
      selection: { anchor: from + before.length + selectedText.length + after.length },
    })
  } else {
    // 没有选中文字，插入标记并将光标放在中间
    view.dispatch({
      changes: [{ from, insert: `${before}${after}` }],
      selection: { anchor: from + before.length },
    })
  }

  return true
}

/**
 * 检测当前行是否是列表项
 */
function getCurrentLineListPrefix(state: EditorState, pos: number): string | null {
  const line = state.doc.lineAt(pos)
  const lineText = line.text
  const match = lineText.match(/^(\s*[-*+]\s+)/)
  return match ? match[1] : null
}

/**
 * 列表自动续行
 */
function autoListContinuation(view: EditorView) {
  const { state } = view
  const { from } = state.selection.main
  const listPrefix = getCurrentLineListPrefix(state, from)

  if (listPrefix) {
    const line = state.doc.lineAt(from)
    const lineText = line.text

    // 如果当前行只有列表标记（空列表项），则删除标记
    if (lineText.trim() === listPrefix.trim()) {
      view.dispatch({
        changes: [{ from: line.from, to: line.to, insert: '' }],
        selection: { anchor: line.from },
      })
      return true
    }

    // 否则，插入换行并续行
    view.dispatch({
      changes: [{ from, insert: `\n${listPrefix}` }],
      selection: { anchor: from + 1 + listPrefix.length },
    })
    return true
  }

  return false
}

/**
 * 处理粘贴事件，自动生成链接
 */
function handlePaste(view: EditorView, event: ClipboardEvent) {
  const { state } = view
  const { from, to } = state.selection.main
  const selectedText = state.sliceDoc(from, to)
  const pastedText = event.clipboardData?.getData('text/plain')

  // 如果有选中文字，且粘贴的是 URL，则自动生成链接
  if (
    selectedText &&
    pastedText &&
    (pastedText.startsWith('http://') || pastedText.startsWith('https://'))
  ) {
    event.preventDefault()
    view.dispatch({
      changes: [{ from, to, insert: `[${selectedText}](${pastedText})` }],
      selection: { anchor: from + selectedText.length + pastedText.length + 4 },
    })
    return true
  }

  return false
}

/**
 * 创建编辑辅助扩展
 */
export function createEditingExtensions(): Extension[] {
  return [
    // 默认按键绑定
    keymap.of(defaultKeymap),

    // Tab 键绑定
    keymap.of([indentWithTab]),

    // 括号自动闭合
    closeBrackets(),
    keymap.of(closeBracketsKeymap),

    // Slash commands for common Markdown blocks
    autocompletion({
      override: [slashCommandSource],
      icons: false,
      maxRenderedOptions: 10,
    }),

    // Keep CodeMirror's default token colors while exposing headings to the editor theme.
    syntaxHighlighting(defaultHighlightStyle),
    syntaxHighlighting(headingHighlightStyle),

    // 自定义按键绑定
    keymap.of([
      // Ctrl+B 加粗
      {
        key: 'Mod-b',
        preventDefault: true,
        run: (view) => wrapSelection(view, '**'),
      },
      // Ctrl+I 斜体
      {
        key: 'Mod-i',
        preventDefault: true,
        run: (view) => wrapSelection(view, '*'),
      },
      // Enter 键 - 列表自动续行
      {
        key: 'Enter',
        run: (view) => {
          if (autoListContinuation(view)) {
            return true
          }
          return false // 返回 false 使用默认行为
        },
      },
    ]),

    // 粘贴事件处理
    EditorView.domEventHandlers({
      paste: (event, view) => {
        return handlePaste(view, event)
      },
    }),
  ]
}
