import { describe, expect, it } from 'vitest'
import { resolvePreviewSourceLine } from './scrollSync'

function setRect(element: HTMLElement, top: number, height: number): void {
  element.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      left: 0,
      right: 400,
      width: 400,
      height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
}

function createScroller(): HTMLElement {
  const scroller = document.createElement('div')
  Object.defineProperty(scroller, 'clientHeight', { value: 600 })
  setRect(scroller, 0, 600)
  return scroller
}

describe('resolvePreviewSourceLine', () => {
  it('uses a reading probe inside the viewport instead of the strict top line', () => {
    const scroller = createScroller()
    const first = document.createElement('p')
    const current = document.createElement('p')
    first.dataset.sourceLine = '4'
    current.dataset.sourceLine = '12'
    setRect(first, 20, 90)
    setRect(current, 150, 120)
    scroller.append(first, current)

    expect(resolvePreviewSourceLine(scroller)).toBe(12)
  })

  it.each([
    ['table', 'table'],
    ['diagram', 'div'],
  ])('keeps a %s on its top source line while the probe is inside it', (_, tagName) => {
    const scroller = createScroller()
    const block = document.createElement(tagName)
    if (tagName === 'div') {
      block.className = 'mermaid'
    }
    block.dataset.sourceLine = '20'
    setRect(block, 120, 320)

    const child = document.createElement(tagName === 'table' ? 'tr' : 'svg')
    child.dataset.sourceLine = '28'
    setRect(child, 180, 80)
    block.append(child)
    scroller.append(block)

    expect(resolvePreviewSourceLine(scroller)).toBe(20)
  })

  it('moves to the next block only after its upper boundary crosses the probe', () => {
    const scroller = createScroller()
    const table = document.createElement('table')
    const next = document.createElement('p')
    table.dataset.sourceLine = '20'
    next.dataset.sourceLine = '35'
    setRect(table, -140, 300)
    setRect(next, 210, 80)
    scroller.append(table, next)

    expect(resolvePreviewSourceLine(scroller)).toBe(20)

    setRect(next, 185, 80)
    expect(resolvePreviewSourceLine(scroller)).toBe(35)
  })
})
