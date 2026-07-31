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
    const toolbar = document.createElement('div')
    const tableShell = document.createElement('span')
    const tableElement = document.createElement('table')

    root.className = 'cm-markdown-table'
    root.setAttribute('aria-label', 'Markdown 表格')
    root.dataset.tableFrom = String(this.table.from)
    toolbar.className = 'cm-markdown-table-toolbar'
    toolbar.setAttribute('role', 'toolbar')
    toolbar.setAttribute('aria-label', '当前单元格操作')
    toolbar.hidden = true
    tableShell.className = 'cm-markdown-table-shell'
    tableElement.className = 'cm-markdown-table-grid'

    const cellInputs: HTMLInputElement[][] = []
    let selectedContainer: HTMLTableCellElement | null = null
    let selectedPosition: TableCellPosition = {
      rowIndex: this.table.rows.length > 0 ? 1 : 0,
      columnIndex: 0,
    }

    const readCurrentTable = (): MarkdownTable => ({
      ...this.table,
      headers: cellInputs[0].map((input) => input.value),
      rows: cellInputs.slice(1).map((row) => row.map((input) => input.value)),
    })

    const commitCells = () => {
      const next: MarkdownTable = {
        ...this.table,
        headers: cellInputs[0].map((input) => input.value),
        rows: cellInputs.slice(1).map((row) => row.map((input) => input.value)),
      }
      this.updateTable(view, next)
    }

    const createActionButton = (
      label: string,
      title: string,
      action: (table: MarkdownTable) => TableActionResult,
      destructive = false
    ): HTMLButtonElement => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `cm-markdown-table-action${destructive ? ' is-destructive' : ''}`
      button.textContent = label
      button.title = title
      button.setAttribute('aria-label', title)
      button.setAttribute('role', 'menuitem')
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', () => {
        const result = action(readCurrentTable())
        this.updateTable(view, result.table, result.focusCell)
      })
      return button
    }

    const insertRowAboveButton = createActionButton(
      '上方插入',
      '在当前行上方插入一行',
      (current) => {
        const { rowIndex, columnIndex } = selectedPosition
        const rows = [...current.rows]
        rows.splice(rowIndex - 1, 0, current.headers.map(() => ''))
        return {
          table: { ...current, rows },
          focusCell: { rowIndex, columnIndex },
        }
      }
    )
    const insertRowBelowButton = createActionButton(
      '下方插入',
      '在当前行下方插入一行',
      (current) => {
        const { rowIndex, columnIndex } = selectedPosition
        const rows = [...current.rows]
        rows.splice(rowIndex, 0, current.headers.map(() => ''))
        return {
          table: { ...current, rows },
          focusCell: { rowIndex: rowIndex + 1, columnIndex },
        }
      }
    )
    const deleteRowButton = createActionButton(
      '删除行',
      '删除当前行',
      (current) => {
        const { rowIndex, columnIndex } = selectedPosition
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

    const insertColumnLeftButton = createActionButton(
      '左侧插入',
      '在当前列左侧插入一列',
      (current) => {
        const { rowIndex, columnIndex } = selectedPosition
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
      }
    )
    const insertColumnRightButton = createActionButton(
      '右侧插入',
      '在当前列右侧插入一列',
      (current) => {
        const { rowIndex, columnIndex } = selectedPosition
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
      }
    )
    const deleteColumnButton = createActionButton(
      '删除列',
      '删除当前列',
      (current) => {
        const { rowIndex, columnIndex } = selectedPosition
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

    const actionMenus: Array<{
      trigger: HTMLButtonElement
      panel: HTMLElement
    }> = []

    const closeMenus = () => {
      actionMenus.forEach(({ trigger, panel }) => {
        panel.hidden = true
        trigger.setAttribute('aria-expanded', 'false')
      })
    }

    const createActionMenu = (label: string, buttons: HTMLButtonElement[]) => {
      const menu = document.createElement('span')
      const trigger = document.createElement('button')
      const panel = document.createElement('span')

      menu.className = 'cm-markdown-table-menu'
      trigger.type = 'button'
      trigger.className = 'cm-markdown-table-menu-trigger'
      trigger.textContent = label
      trigger.title = `${label}操作`
      trigger.setAttribute('aria-label', `${label}操作`)
      trigger.setAttribute('aria-haspopup', 'menu')
      trigger.setAttribute('aria-expanded', 'false')
      panel.className = 'cm-markdown-table-menu-panel'
      panel.setAttribute('role', 'menu')
      panel.setAttribute('aria-label', `${label}操作`)
      panel.hidden = true

      trigger.addEventListener('mousedown', (event) => event.preventDefault())
      trigger.addEventListener('click', () => {
        const shouldOpen = panel.hidden
        closeMenus()
        panel.hidden = !shouldOpen
        trigger.setAttribute('aria-expanded', String(shouldOpen))
      })

      panel.append(...buttons)
      menu.append(trigger, panel)
      actionMenus.push({ trigger, panel })
      return menu
    }

    const updateToolbarState = () => {
      const { rowIndex, columnIndex } = selectedPosition
      const positionLabel =
        rowIndex === 0
          ? `表头第 ${columnIndex + 1} 列`
          : `第 ${rowIndex} 行第 ${columnIndex + 1} 列`
      toolbar.setAttribute('aria-label', `${positionLabel}操作`)
      insertRowAboveButton.disabled = rowIndex === 0
      deleteRowButton.disabled = rowIndex === 0
      deleteColumnButton.disabled = readCurrentTable().headers.length <= 1
    }

    const positionToolbar = (container: HTMLTableCellElement) => {
      const rootRect = root.getBoundingClientRect()
      const cellRect = container.getBoundingClientRect()
      const toolbarRect = toolbar.getBoundingClientRect()
      const halfWidth = Math.max(toolbarRect.width / 2, 96)
      const cellCenter = cellRect.left - rootRect.left + cellRect.width / 2
      const left =
        rootRect.width > halfWidth * 2
          ? Math.min(Math.max(cellCenter, halfWidth + 6), rootRect.width - halfWidth - 6)
          : cellCenter

      toolbar.style.left = `${left}px`
      toolbar.style.top = `${cellRect.top - rootRect.top}px`
    }

    const selectCell = (
      container: HTMLTableCellElement,
      position: TableCellPosition
    ) => {
      selectedContainer?.classList.remove('is-active-cell')
      selectedContainer = container
      selectedPosition = position
      selectedContainer.classList.add('is-active-cell')
      updateToolbarState()
      closeMenus()
      toolbar.hidden = false
      positionToolbar(container)
    }

    toolbar.append(
      createActionMenu('行', [
        insertRowAboveButton,
        insertRowBelowButton,
        deleteRowButton,
      ]),
      createActionMenu('列', [
        insertColumnLeftButton,
        insertColumnRightButton,
        deleteColumnButton,
      ])
    )

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
        input.addEventListener('focus', () =>
          selectCell(container, { rowIndex, columnIndex })
        )
        input.addEventListener('change', commitCells)
        inputs.push(input)
        container.append(input)
        tr.append(container)
      })

      cellInputs.push(inputs)
      tableElement.append(tr)
    })

    tableShell.append(tableElement)
    root.append(toolbar, tableShell)
    root.addEventListener('focusout', () => {
      queueMicrotask(() => {
        if (root.contains(document.activeElement)) {
          return
        }

        closeMenus()
        toolbar.hidden = true
        selectedContainer?.classList.remove('is-active-cell')
        selectedContainer = null
      })
    })
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMenus()
      }
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
