import { useMemo, useState } from 'react'
import type { OutlineItem } from '../utils/outline'
import './Outline.css'

interface OutlineProps {
  items: OutlineItem[]
  activeItemId?: string | null
  onItemClick?: (item: OutlineItem) => void
}

export function Outline({ items, activeItemId = null, onItemClick }: OutlineProps) {
  const [collapsedItemIds, setCollapsedItemIds] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  )
  const visibleItems = useMemo(() => {
    const collapsedAncestorLevels: number[] = []

    return items.filter((item, index) => {
      while (
        collapsedAncestorLevels.length > 0 &&
        collapsedAncestorLevels[collapsedAncestorLevels.length - 1] >= item.level
      ) {
        collapsedAncestorLevels.pop()
      }

      const visible = collapsedAncestorLevels.length === 0
      const hasChildren = index + 1 < items.length && items[index + 1].level > item.level

      if (hasChildren && collapsedItemIds.has(item.id)) {
        collapsedAncestorLevels.push(item.level)
      }

      return visible
    })
  }, [collapsedItemIds, items])

  const toggleItem = (itemId: string) => {
    setCollapsedItemIds((current) => {
      const next = new Set(current)

      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }

      return next
    })
  }

  return items.length === 0 ? (
    <div className="outline-empty" aria-label="文档大纲为空">
      暂无标题
    </div>
  ) : (
    <nav className="outline-list" aria-label="标题列表">
      {visibleItems.map((item) => {
        const itemIndex = items.findIndex((candidate) => candidate.id === item.id)
        const hasChildren = itemIndex + 1 < items.length && items[itemIndex + 1].level > item.level
        const collapsed = collapsedItemIds.has(item.id)

        return (
          <div key={item.id} className={`outline-row level-${item.level}`}>
            {hasChildren ? (
              <button
                type="button"
                className="outline-toggle"
                aria-label={`${collapsed ? '展开' : '折叠'}“${item.text}”`}
                aria-expanded={!collapsed}
                title={collapsed ? '展开子标题' : '折叠子标题'}
                onClick={() => toggleItem(item.id)}
              />
            ) : (
              <span className="outline-toggle-spacer" aria-hidden="true" />
            )}
            <button
              type="button"
              className={`outline-item${activeItemId === item.id ? ' active' : ''}`}
              data-outline-id={item.id}
              title={item.text}
              onClick={() => onItemClick?.(item)}
            >
              <span className="outline-item-text">{item.text}</span>
            </button>
          </div>
        )
      })}
    </nav>
  )
}
