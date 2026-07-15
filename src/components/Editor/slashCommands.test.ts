import {
  acceptCompletion,
  CompletionContext,
  completionStatus,
  startCompletion,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { markdown } from '@codemirror/lang-markdown'
import { EditorState, StateEffect } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { afterEach, describe, expect, it } from 'vitest'
import { createEditingExtensions } from './extensions'
import { slashCommandSource } from './slashCommands'

describe('slash commands', () => {
  let view: EditorView | null = null

  afterEach(() => {
    const parent = view?.dom.parentElement
    view?.destroy()
    parent?.remove()
    view = null
  })

  function createEditor(doc: string, cursor = doc.length): EditorView {
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: cursor },
      }),
      parent: document.body.appendChild(document.createElement('div')),
    })
    return view
  }

  it('offers common Markdown commands after a slash at the start of a line', () => {
    const state = EditorState.create({ doc: '/' })
    const result = slashCommandSource(new CompletionContext(state, 1, false)) as CompletionResult

    expect(result.from).toBe(0)
    expect(result.options.map((option) => option.label)).toEqual(
      expect.arrayContaining(['一级标题', '无序列表', '有序列表', '待办事项', '代码块', '表格'])
    )
    expect(result.options.every((option) => option.detail === undefined)).toBe(true)
    expect(result.options.every((option) => !option.label.includes('/'))).toBe(true)
  })

  it('applies a slash command and preserves indentation', () => {
    const editor = createEditor('  /一级标题')
    const result = slashCommandSource(
      new CompletionContext(editor.state, editor.state.selection.main.head, false, editor)
    ) as CompletionResult
    const heading = result.options.find((option) => option.label === '一级标题')

    expect(typeof heading?.apply).toBe('function')
    if (typeof heading?.apply === 'function') {
      heading.apply(editor, heading, result.from, editor.state.selection.main.head)
    }

    expect(editor.state.doc.toString()).toBe('  # ')
    expect(editor.state.selection.main.head).toBe(4)
  })

  it('places the cursor inside templates with editable placeholders', () => {
    const editor = createEditor('/链接')
    const result = slashCommandSource(
      new CompletionContext(editor.state, editor.state.selection.main.head, false, editor)
    ) as CompletionResult
    const link = result.options.find((option) => option.label === '链接')

    if (typeof link?.apply === 'function') {
      link.apply(editor, link, result.from, editor.state.selection.main.head)
    }

    expect(editor.state.doc.toString()).toBe('[]()')
    expect(editor.state.selection.main.head).toBe(1)
  })

  it('creates tables with explicitly left-aligned columns', () => {
    const editor = createEditor('/表格')
    const result = slashCommandSource(
      new CompletionContext(editor.state, editor.state.selection.main.head, false, editor)
    ) as CompletionResult
    const table = result.options.find((option) => option.label === '表格')

    if (typeof table?.apply === 'function') {
      table.apply(editor, table, result.from, editor.state.selection.main.head)
    }

    expect(editor.state.doc.toString()).toContain('| :--- | :--- |')
  })

  it('does not offer slash commands in regular text or URLs', () => {
    const textState = EditorState.create({ doc: 'text /' })
    const urlState = EditorState.create({ doc: 'https://' })

    expect(slashCommandSource(new CompletionContext(textState, 6, false))).toBeNull()
    expect(slashCommandSource(new CompletionContext(urlState, 8, false))).toBeNull()
  })

  it('renders ten command options when the menu first opens', async () => {
    const editor = createEditor('/')
    editor.dispatch({
      effects: StateEffect.appendConfig.of([basicSetup, markdown(), ...createEditingExtensions()]),
    })

    expect(startCompletion(editor)).toBe(true)
    await vi.waitFor(() => expect(completionStatus(editor.state)).toBe('active'))
    expect(editor.dom.querySelectorAll('.cm-tooltip-autocomplete li')).toHaveLength(10)
  })

  it('opens and accepts a command through the editor completion integration', async () => {
    const editor = createEditor('/一级标题')
    editor.dispatch({
      effects: StateEffect.appendConfig.of([basicSetup, markdown(), ...createEditingExtensions()]),
    })

    expect(startCompletion(editor)).toBe(true)
    await vi.waitFor(() => expect(completionStatus(editor.state)).toBe('active'))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(acceptCompletion(editor)).toBe(true)
    expect(editor.state.doc.toString()).toBe('# ')
  })
})
