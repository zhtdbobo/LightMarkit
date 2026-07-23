export type OutlineItem = {
  id: string
  text: string
  level: number
  line: number
}

/**
 * 从 Markdown 正文提取 ATX 标题大纲（# ~ ######）。
 * line 为 1-based 行号，便于跳转到编辑器对应位置。
 */
export function extractMarkdownOutline(content: string): OutlineItem[] {
  const items: OutlineItem[] = []
  const lines = content.split('\n')

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line)

    if (!headingMatch) {
      continue
    }

    const level = headingMatch[1].length
    const text = headingMatch[2].replace(/\s+#+\s*$/, '').trim()

    if (!text) {
      continue
    }

    items.push({
      id: `outline-${index}-${level}`,
      text,
      level,
      line: index + 1,
    })
  }

  return items
}
