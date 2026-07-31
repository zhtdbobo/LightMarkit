import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { EditorView, basicSetup } from 'codemirror'
import { afterEach, describe, expect, it } from 'vitest'
import { createEditingExtensions } from './extensions'
import { createLivePreview } from './livePreview'
import './Editor.css'

describe('live preview task lists', () => {
  let view: EditorView | null = null

  const mount = (doc: string) => {
    const parent = document.body.appendChild(document.createElement('div'))
    parent.className = 'editor-wrapper'
    view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          markdown(),
          ...createEditingExtensions(),
          ...createLivePreview({}),
        ],
      }),
      parent,
    })
    return view
  }

  const checkboxes = (editor: EditorView) =>
    Array.from(editor.dom.querySelectorAll<HTMLInputElement>('.cm-wysiwyg-task-checkbox'))

  afterEach(() => {
    const parent = view?.dom.parentElement
    view?.destroy()
    parent?.remove()
    view = null
  })

  it('不应把围栏代码块内的 "- [ ]" 渲染成复选框', () => {
    const editor = mount(
      ['```markdown', '- [ ] 代码块内的示例', '```', '', '- [ ] 真正的任务'].join('\n')
    )

    expect(checkboxes(editor)).toHaveLength(1)
  })

  it('不应把缩进代码块内的 "- [ ]" 渲染成复选框', () => {
    const editor = mount(['段落：', '', '    - [ ] 缩进代码块内的示例', ''].join('\n'))

    expect(checkboxes(editor)).toHaveLength(0)
  })

  it('应该为引用块内的任务列表渲染复选框', () => {
    const editor = mount('> - [x] 引用块内的任务')
    const boxes = checkboxes(editor)

    expect(boxes).toHaveLength(1)
    expect(boxes[0].checked).toBe(true)
  })

  it('应该继续支持无序、有序和缩进任务列表', () => {
    const editor = mount(['- [ ] 无序', '1. [x] 有序', '  * [ ] 缩进'].join('\n'))
    const boxes = checkboxes(editor)

    expect(boxes).toHaveLength(3)
    expect(boxes.map((box) => box.checked)).toEqual([false, true, false])
  })

  it('勾选复选框应该只改写状态字符', () => {
    const editor = mount('- [ ] 待办事项')
    const [box] = checkboxes(editor)

    box.checked = true
    box.dispatchEvent(new Event('change'))

    expect(editor.state.doc.toString()).toBe('- [x] 待办事项')
  })

  it('勾选引用块内的复选框应该只改写状态字符', () => {
    const editor = mount('> - [ ] 引用块内的任务')
    const [box] = checkboxes(editor)

    box.checked = true
    box.dispatchEvent(new Event('change'))

    expect(editor.state.doc.toString()).toBe('> - [x] 引用块内的任务')
  })
})
