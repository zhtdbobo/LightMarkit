import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { EditorView, basicSetup } from 'codemirror'
import { afterEach, describe, expect, it } from 'vitest'
import { createEditingExtensions } from './extensions'
import './Editor.css'

describe('heading highlighting', () => {
  let view: EditorView | null = null

  afterEach(() => {
    const parent = view?.dom.parentElement
    view?.destroy()
    parent?.remove()
    view = null
  })

  it('renders ATX headings without an underline', () => {
    const parent = document.body.appendChild(document.createElement('div'))
    parent.className = 'editor-wrapper'
    view = new EditorView({
      state: EditorState.create({
        doc: '### fdsf fdsfsd',
        extensions: [basicSetup, markdown(), ...createEditingExtensions()],
      }),
      parent,
    })

    const headingParts = Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-heading'))
    expect(headingParts.map((part) => part.textContent).join(' ')).toContain('fdsf fdsfsd')
    expect(headingParts.length).toBeGreaterThan(0)
    headingParts.forEach((part) => {
      expect(getComputedStyle(part).textDecoration).toBe('none')
    })
  })
})
