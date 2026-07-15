import {
  pickedCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'

interface SlashCommand {
  label: string
  template: string
  cursorOffset?: number
}

const slashCommands: readonly SlashCommand[] = [
  {
    label: '正文',
    template: '',
  },
  {
    label: '一级标题',
    template: '# ',
  },
  {
    label: '二级标题',
    template: '## ',
  },
  {
    label: '三级标题',
    template: '### ',
  },
  {
    label: '无序列表',
    template: '- ',
  },
  {
    label: '有序列表',
    template: '1. ',
  },
  {
    label: '待办事项',
    template: '- [ ] ',
  },
  {
    label: '引用',
    template: '> ',
  },
  {
    label: '代码块',
    template: '```\n\n```',
    cursorOffset: 4,
  },
  {
    label: '分隔线',
    template: '---',
  },
  {
    label: '链接',
    template: '[]()',
    cursorOffset: 1,
  },
  {
    label: '图片',
    template: '![]()',
    cursorOffset: 2,
  },
  {
    label: '表格',
    template: '| 列 1 | 列 2 |\n| :--- | :--- |\n| 内容 | 内容 |',
    cursorOffset: 2,
  },
]

function applySlashCommand(command: SlashCommand) {
  return (view: EditorView, completion: Completion, from: number, to: number) => {
    const cursorOffset = command.cursorOffset ?? command.template.length

    view.dispatch({
      changes: { from, to, insert: command.template },
      selection: { anchor: from + cursorOffset },
      annotations: pickedCompletion.of(completion),
    })
  }
}

const completionOptions: readonly Completion[] = slashCommands.map((command, index) => ({
  label: command.label,
  type: 'keyword',
  boost: slashCommands.length - index,
  apply: applySlashCommand(command),
}))

/**
 * Offers block-level Markdown commands after a slash at the start of a line.
 */
export function slashCommandSource(context: CompletionContext): CompletionResult | null {
  const query = context.matchBefore(/\/[\w\u4e00-\u9fff-]*$/)
  if (!query) return null

  const line = context.state.doc.lineAt(context.pos)
  const textBeforeSlash = context.state.sliceDoc(line.from, query.from)
  if (textBeforeSlash.trim() !== '') return null

  const search = query.text.slice(1)
  const options = search
    ? completionOptions.filter((completion) => completion.label.includes(search))
    : completionOptions

  return {
    from: query.from,
    options,
    filter: false,
  }
}
