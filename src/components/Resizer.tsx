import { useEffect, useRef, useState } from 'react'
import './Resizer.css'

interface ResizerProps {
  onResize: (leftWidth: number) => void
  initialLeftWidth?: number
  minLeftWidth?: number
  minRightWidth?: number
}

export function Resizer({ onResize, minLeftWidth = 20, minRightWidth = 20 }: ResizerProps) {
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return

      const container = containerRef.current.parentElement
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const offsetX = e.clientX - containerRect.left
      const percentage = (offsetX / containerRect.width) * 100

      // 限制在最小宽度范围内
      const clampedPercentage = Math.max(minLeftWidth, Math.min(100 - minRightWidth, percentage))
      onResize(clampedPercentage)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, onResize, minLeftWidth, minRightWidth])

  const handleMouseDown = () => {
    setIsDragging(true)
  }

  return (
    <div
      ref={containerRef}
      className={`resizer ${isDragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
      data-testid="resizer"
    >
      <div className="resizer-line" />
    </div>
  )
}
