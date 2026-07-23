import { describe, expect, it } from 'vitest'
import { extractMarkdownOutline } from './outline'

describe('extractMarkdownOutline', () => {
  it('extracts ATX headings with levels and 1-based line numbers', () => {
    const markdown = ['# Title', '', '## Section', 'paragraph', '### Detail'].join('\n')

    expect(extractMarkdownOutline(markdown)).toEqual([
      { id: 'outline-0-1', text: 'Title', level: 1, line: 1 },
      { id: 'outline-2-2', text: 'Section', level: 2, line: 3 },
      { id: 'outline-4-3', text: 'Detail', level: 3, line: 5 },
    ])
  })

  it('strips trailing closing hashes from heading text', () => {
    expect(extractMarkdownOutline('## Hello ##')).toEqual([
      { id: 'outline-0-2', text: 'Hello', level: 2, line: 1 },
    ])
  })

  it('ignores empty heading titles', () => {
    expect(extractMarkdownOutline('#   ')).toEqual([])
  })
})
