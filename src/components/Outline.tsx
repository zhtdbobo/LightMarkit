import type { OutlineItem } from '../utils/outline'
import './Outline.css'

interface OutlineProps {
  items: OutlineItem[]
  activeItemId?: string | null
  onItemClick?: (item: OutlineItem) => void
}

export function Outline({ items, activeItemId = null, onItemClick }: OutlineProps) {
  return items.length === 0 ? (
    <div className="outline-empty" aria-label="文档大纲为空">
      暂无标题
    </div>
  ) : (
    <nav className="outline-list" aria-label="标题列表">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`outline-item level-${item.level}${activeItemId === item.id ? ' active' : ''}`}
          data-outline-id={item.id}
          title={item.text}
          onClick={() => onItemClick?.(item)}
        >
          <span className="outline-item-text">{item.text}</span>
        </button>
      ))}
    </nav>
  )
}
