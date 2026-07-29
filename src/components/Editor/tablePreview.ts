import { StateField, type Range, type Text } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'

type TableAlignment = 'left' | 'center' | 'right' | null

export interface MarkdownTable {
  from: number
  to: number
  headers: string[]
  rows: string[][]
  alignments: TableAlignment[]
}

function splitTableRow(text: string): string[] | null {
  const trimmed = text.trim()
  if (!trimmed.includes('|')) return null

  const body = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let current = ''
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]

    if (character === '\\' && body[index + 1] === '|') {
      current += '|'
      index += 1
    } else if (character === '|') {
      cells.push(current.trim())
      current = ''
    } else {
      current += character
    }
  }

  cells.push(current.trim())
  return cells.length > 0 ? cells : null
}

function parseSeparator(cells: string[]): TableAlignment[] | null {
  const alignments: TableAlignment[] = []

  for (const cell of cells) {
    const marker = cell.replace(/\s+/g, '')
    if (!/^:?-+:?$/.test(marker)) return null

    if (marker.startsWith(':') && marker.endsWith(':')) {
      alignments.push('center')
    } else if (marker.endsWith(':')) {
      alignments.push('right')
    } else if (marker.startsWith(':')) {
      alignments.push('left')
    } else {
      alignments.push(null)
    }
  }

  return alignments
}

function normalizeCells(cells: string[], columnCount: number): string[] {
  return Array.from({ length: columnCount }, (_, index) => cells[index] ?? '')
}

export function findMarkdownTables(doc: Text): MarkdownTable[] {
  const tables: MarkdownTable[] = []
  let lineNumber = 1
  let fence: string | null = null

  while (lineNumber <= doc.lines) {
    const line = doc.line(lineNumber)
    const fenceMatch = line.text.match(/^\s{0,3}(`{3,}|~{3,})/)

    if (fenceMatch) {
      const marker = fenceMatch[1]
      if (!fence) {
        fence = marker[0]
      } else if (marker[0] === fence) {
        fence = null
      }
      lineNumber += 1
      continue
    }

    if (fence || lineNumber === doc.lines) {
      lineNumber += 1
      continue
    }

    const headerCells = splitTableRow(line.text)
    const separatorLine = doc.line(lineNumber + 1)
    const separatorCells = splitTableRow(separatorLine.text)
    const separatorText = separatorLine.text.trim()
    const hasAmbiguousListMarker = /^-\s/.test(separatorText)
    const alignments =
      separatorCells && !hasAmbiguousListMarker ? parseSeparator(separatorCells) : null

    if (!headerCells || !alignments || headerCells.length !== alignments.length) {
      lineNumber += 1
      continue
    }

    const columnCount = headerCells.length
    const rows: string[][] = []
    let lastLine = separatorLine
    let nextLineNumber = lineNumber + 2

    while (nextLineNumber <= doc.lines) {
      const rowLine = doc.line(nextLineNumber)
      if (!rowLine.text.trim()) break

      const cells = splitTableRow(rowLine.text)
      if (!cells) break

      rows.push(normalizeCells(cells, columnCount))
      lastLine = rowLine
      nextLineNumber += 1
    }

    tables.push({
      from: line.from,
      to: lastLine.to,
      headers: normalizeCells(headerCells, columnCount),
      rows,
      alignments,
    })
    lineNumber = nextLineNumber
  }

  return tables
}

function escapeCell(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim()
}

function separatorForAlignment(alignment: TableAlignment): string {
  if (alignment === 'center') return ':---:'
  if (alignment === 'right') return '---:'
  if (alignment === 'left') return ':---'
  return '---'
}

export function serializeMarkdownTable(table: MarkdownTable): string {
  const row = (cells: string[]) => `| ${cells.map(escapeCell).join(' | ')} |`

  return [
    row(table.headers),
    row(table.alignments.map(separatorForAlignment)),
    ...table.rows.map(row),
  ].join('\n')
}

interface TableCellPosition {
  rowIndex: number
  columnIndex: number
}

interface TableActionResult {
  table: MarkdownTable
  focusCell: TableCellPosition
}

class MarkdownTableWidget extends WidgetType {
  constructor(private readonly table: MarkdownTable) {
    super()
  }

  eq(other: MarkdownTableWidget): boolean {
    return (
      other.table.from === this.table.from &&
      other.table.to === this.table.to &&
      serializeMarkdownTable(other.table) === serializeMarkdownTable(this.table)
    )
  }

  private updateTable(
    view: EditorView,
    table: MarkdownTable,
    focusCell?: TableCellPosition
  ) {
    view.dispatch({
      changes: {
        from: this.table.from,
        to: this.table.to,
        insert: serializeMarkdownTable(table),
      },
      selection: { anchor: this.table.from },
    })

    if (focusCell) {
      view.dom
        .querySelector<HTMLInputElement>(
          `.cm-markdown-table[data-table-from="${this.table.from}"] ` +
            `input[data-row-index="${focusCell.rowIndex}"]` +
            `[data-column-index="${focusCell.columnIndex}"]`
        )
        ?.focus()
    }
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('div')
    const tableShell = document.createElement('span')
    const tableElement = document.createElement('table')
    const contextActions = document.createElement('div')

    root.className = 'cm-markdown-table'
    root.setAttribute('aria-label', 'Markdown 表格')
    root.dataset.tableFrom = String(this.table.from)
    tableShell.className = 'cm-markdown-table-shell'
    tableElement.className = 'cm-markdown-table-grid'
    contextActions.className = 'cm-markdown-table-context-actions'
    contextActions.setAttribute('role', 'toolbar')
    contextActions.setAttribute('aria-label', '表格边框操作')
    contextActions.hidden = true

    const cellInputs: HTMLInputElement[][] = []
    let selectedContainer: HTMLTableCellElement | null = null

    const readCurrentTable = (): MarkdownTable => ({
      ...this.table,
      headers: cellInputs[0].map((input) => input.value),
      rows: cellInputs.slice(1).map((row) => row.map((input) => input.value)),
    })

    const selectCell = (container: HTMLTableCellElement) => {
      selectedContainer?.classList.remove('is-active-cell')
      selectedContainer = container
      selectedContainer.classList.add('is-active-cell')
    }

    const commitCells = () => {
      const next: MarkdownTable = {
        ...this.table,
        headers: cellInputs[0].map((input) => input.value),
        rows: cellInputs.slice(1).map((row) => row.map((input) => input.value)),
      }
      this.updateTable(view, next)
    }

    const addContextAction = (
      label: string,
      title: string,
      action: (table: MarkdownTable) => TableActionResult,
      destructive = false
    ) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `cm-markdown-table-context-action${destructive ? ' is-destructive' : ''}`
      button.textContent = label
      button.title = title
      button.setAttribute('aria-label', title)
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', () => {
        const result = action(readCurrentTable())
        this.updateTable(view, result.table, result.focusCell)
      })
      contextActions.append(button)
    }

    const placeContextActions = (handle: HTMLElement, axis: 'column' | 'row') => {
      const rootRect = root.getBoundingClientRect()
      const handleRect = handle.getBoundingClientRect()
      const handleCenterX = handleRect.left - rootRect.left + handleRect.width / 2
      const handleCenterY = handleRect.top - rootRect.top + handleRect.height / 2

      contextActions.hidden = false
      contextActions.classList.remove(
        'is-edge-top',
        'is-edge-right',
        'is-edge-bottom',
        'is-edge-left'
      )

      if (axis === 'column') {
        const useTopEdge = handleCenterY <= rootRect.height / 2
        contextActions.classList.add(useTopEdge ? 'is-edge-top' : 'is-edge-bottom')

        const actionsRect = contextActions.getBoundingClientRect()
        const horizontalInset = actionsRect.width / 2 + 6
        const left = Math.min(
          Math.max(handleCenterX, horizontalInset),
          Math.max(horizontalInset, rootRect.width - horizontalInset)
        )

        contextActions.style.left = `${left}px`
        contextActions.style.top = `${useTopEdge ? 0 : rootRect.height}px`
      } else {
        const useLeftEdge = handleCenterX <= rootRect.width / 2
        contextActions.classList.add(useLeftEdge ? 'is-edge-left' : 'is-edge-right')

        const actionsRect = contextActions.getBoundingClientRect()
        const verticalInset = actionsRect.height / 2 + 6
        const top = Math.min(
          Math.max(handleCenterY, verticalInset),
          Math.max(verticalInset, rootRect.height - verticalInset)
        )

        contextActions.style.left = `${useLeftEdge ? 0 : rootRect.width}px`
        contextActions.style.top = `${top}px`
      }
    }

    const showColumnActions = (
      rowIndex: number,
      columnIndex: number,
      side: 'before' | 'after',
      handle: HTMLElement
    ) => {
      const table = readCurrentTable()
      const lastColumnIndex = table.headers.length - 1
      const outerLeft = columnIndex === 0 && side === 'before'
      const outerRight = columnIndex === lastColumnIndex && side === 'after'

      contextActions.replaceChildren()

      if (!outerRight) {
        addContextAction('←+', '左侧添加一列', (current) => {
          const headers = [...current.headers]
          const alignments = [...current.alignments]
          headers.splice(columnIndex, 0, '新列')
          alignments.splice(columnIndex, 0, null)
          return {
            table: {
              ...current,
              headers,
              alignments,
              rows: current.rows.map((row) => {
                const next = [...row]
                next.splice(columnIndex, 0, '')
                return next
              }),
            },
            focusCell: { rowIndex, columnIndex },
          }
        })
      }

      if (!outerLeft) {
        addContextAction('+→', '右侧添加一列', (current) => {
          const insertionIndex = columnIndex + 1
          const headers = [...current.headers]
          const alignments = [...current.alignments]
          headers.splice(insertionIndex, 0, '新列')
          alignments.splice(insertionIndex, 0, null)
          return {
            table: {
              ...current,
              headers,
              alignments,
              rows: current.rows.map((row) => {
                const next = [...row]
                next.splice(insertionIndex, 0, '')
                return next
              }),
            },
            focusCell: { rowIndex, columnIndex: insertionIndex },
          }
        })
      }

      if (table.headers.length > 1) {
        addContextAction(
          '−列',
          '删除本列',
          (current) => {
            const headers = [...current.headers]
            const alignments = [...current.alignments]
            headers.splice(columnIndex, 1)
            alignments.splice(columnIndex, 1)
            return {
              table: {
                ...current,
                headers,
                alignments,
                rows: current.rows.map((row) => {
                  const next = [...row]
                  next.splice(columnIndex, 1)
                  return next
                }),
              },
              focusCell: {
                rowIndex,
                columnIndex: Math.min(columnIndex, headers.length - 1),
              },
            }
          },
          true
        )
      }

      contextActions.className = 'cm-markdown-table-context-actions is-column'
      placeContextActions(handle, 'column')
    }

    const showRowActions = (
      rowIndex: number,
      columnIndex: number,
      side: 'before' | 'after',
      handle: HTMLElement
    ) => {
      const table = readCurrentTable()
      const lastBodyRowIndex = table.rows.length
      const outerTop = rowIndex === 1 && side === 'before'
      const outerBottom = rowIndex === lastBodyRowIndex && side === 'after'

      contextActions.replaceChildren()

      if (rowIndex > 0 && !outerBottom) {
        addContextAction('↑+', '上方添加一行', (current) => {
          const rows = [...current.rows]
          rows.splice(rowIndex - 1, 0, current.headers.map(() => ''))
          return {
            table: { ...current, rows },
            focusCell: { rowIndex, columnIndex },
          }
        })
      }

      if (rowIndex === 0 || !outerTop) {
        addContextAction('+↓', '下方添加一行', (current) => {
          const rows = [...current.rows]
          rows.splice(rowIndex, 0, current.headers.map(() => ''))
          return {
            table: { ...current, rows },
            focusCell: { rowIndex: rowIndex + 1, columnIndex },
          }
        })
      }

      if (rowIndex > 0) {
        addContextAction(
          '−行',
          '删除本行',
          (current) => {
            const rows = [...current.rows]
            rows.splice(rowIndex - 1, 1)
            return {
              table: { ...current, rows },
              focusCell: {
                rowIndex: Math.min(rowIndex, rows.length),
                columnIndex,
              },
            }
          },
          true
        )
      }

      contextActions.className = 'cm-markdown-table-context-actions is-row'
      placeContextActions(handle, 'row')
    }

    const createEdgeHandle = (
      axis: 'column' | 'row',
      side: 'before' | 'after',
      rowIndex: number,
      columnIndex: number
    ) => {
      const handle = document.createElement('span')
      const direction =
        axis === 'column'
          ? side === 'before'
            ? 'left'
            : 'right'
          : side === 'before'
            ? 'top'
            : 'bottom'

      handle.className = `cm-markdown-table-edge cm-markdown-table-edge-${direction}`
      handle.dataset.rowIndex = String(rowIndex)
      handle.dataset.columnIndex = String(columnIndex)
      handle.setAttribute('aria-hidden', 'true')
      handle.addEventListener('mouseenter', () => {
        if (axis === 'column') {
          showColumnActions(rowIndex, columnIndex, side, handle)
        } else {
          showRowActions(rowIndex, columnIndex, side, handle)
        }
      })
      return handle
    }

    const allRows = [this.table.headers, ...this.table.rows]
    allRows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr')
      const inputs: HTMLInputElement[] = []

      row.forEach((cell, columnIndex) => {
        const container = document.createElement(rowIndex === 0 ? 'th' : 'td')
        const input = document.createElement('input')
        input.type = 'text'
        input.value = cell
        input.className = 'cm-markdown-table-cell'
        input.dataset.rowIndex = String(rowIndex)
        input.dataset.columnIndex = String(columnIndex)
        input.setAttribute('aria-label', `第 ${rowIndex + 1} 行第 ${columnIndex + 1} 列`)
        input.addEventListener('focus', () => selectCell(container))
        input.addEventListener('change', commitCells)
        inputs.push(input)
        container.append(
          input,
          createEdgeHandle('column', 'before', rowIndex, columnIndex),
          createEdgeHandle('column', 'after', rowIndex, columnIndex)
        )

        if (rowIndex === 0) {
          container.append(createEdgeHandle('row', 'after', rowIndex, columnIndex))
        } else {
          container.append(
            createEdgeHandle('row', 'before', rowIndex, columnIndex),
            createEdgeHandle('row', 'after', rowIndex, columnIndex)
          )
        }
        tr.append(container)
      })

      cellInputs.push(inputs)
      tableElement.append(tr)
    })

    tableShell.append(tableElement)
    root.append(tableShell, contextActions)
    root.addEventListener('mouseleave', () => {
      contextActions.hidden = true
    })
    return root
  }
}

function createTableDecorations(tables: MarkdownTable[]): Range<Decoration>[] {
  return tables.map((table) =>
    Decoration.replace({
      widget: new MarkdownTableWidget(table),
      block: true,
    }).range(table.from, table.to)
  )
}

function buildTableDecorations(doc: Text) {
  return Decoration.set(createTableDecorations(findMarkdownTables(doc)), true)
}

export const tablePreviewExtension = StateField.define({
  create(state) {
    return buildTableDecorations(state.doc)
  },
  update(decorations, transaction) {
    if (transaction.docChanged) {
      return buildTableDecorations(transaction.newDoc)
    }
    return decorations
  },
  provide: (field) => EditorView.decorations.from(field),
})
