import { useState, useEffect, useCallback, useRef } from 'react'
import { open, save } from '@tauri-apps/plugin-dialog'
import { getCurrentWindow } from '@tauri-apps/api/window'
import Editor from './components/Editor'
import { Preview } from './components/Preview'
import { Resizer } from './components/Resizer'
import { FileList } from './components/FileList'
import { fileRead, fileWrite, getCurrentFile, setCurrentFile } from './utils/fileApi'
import { scanFolder, type FileInfo } from './utils/folderApi'
import { exportHtml, exportPdf, exportMarkdown } from './utils/exportApi'
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import './App.css'

type ViewMode = 'edit' | 'split' | 'preview'
type SaveStatus = 'idle' | 'saving' | 'saved'
type ToolbarMenu = 'file' | 'export' | null
type ExportExtension = 'html' | 'pdf' | 'md'

const FALLBACK_DOCUMENT_NAME = 'LightMarkit Document'
const MARKDOWN_EXTENSION_PATTERN = /\.(md|markdown)$/i
const INVALID_FILE_NAME_CHARACTERS = /[<>:"/\\|?*]/g

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    return character.charCodeAt(0) < 32 ? ' ' : character
  }).join('')
}

function getExportFileName(
  content: string,
  currentFile: string | null,
  extension: ExportExtension
): string {
  const currentFileName = currentFile?.split(/[\\/]/).pop()
  const currentBaseName = currentFileName?.replace(MARKDOWN_EXTENSION_PATTERN, '').trim()
  const firstHeading = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const documentName = currentBaseName || firstHeading || FALLBACK_DOCUMENT_NAME
  const sanitizedName = replaceControlCharacters(documentName)
    .replace(INVALID_FILE_NAME_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')

  return `${sanitizedName || FALLBACK_DOCUMENT_NAME}.${extension}`
}

function ViewModeIcon({ mode }: { mode: ViewMode }) {
  if (mode === 'edit') {
    return (
      <svg className="mode-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19h4L19 9l-4-4L5 15v4z" />
        <path d="M14 6l4 4" />
      </svg>
    )
  }

  if (mode === 'split') {
    return (
      <svg className="mode-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M12 5v14" />
      </svg>
    )
  }

  return (
    <svg className="mode-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

function WindowControlIcon({ action }: { action: 'minimize' | 'maximize' | 'close' }) {
  if (action === 'minimize') {
    return (
      <svg className="window-control-icon" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2 8.5h8" />
      </svg>
    )
  }

  if (action === 'maximize') {
    return (
      <svg className="window-control-icon" viewBox="0 0 12 12" aria-hidden="true">
        <rect x="2.5" y="2.5" width="7" height="7" rx="0.5" />
      </svg>
    )
  }

  return (
    <svg className="window-control-icon" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3 3l6 6" />
      <path d="M9 3L3 9" />
    </svg>
  )
}

// 创建 Markdown 渲染器（用于导出）
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
})
  .use(taskLists, {
    enabled: true,
    label: true,
    labelAfter: true,
  })
  .enable(['table', 'strikethrough'])

// 添加 Mermaid 代码块处理
const defaultFenceRenderer = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const code = token.content.trim()
  const info = token.info ? token.info.trim() : ''

  if (info === 'mermaid') {
    return `<div class="mermaid">${code}</div>`
  }

  return defaultFenceRenderer(tokens, idx, options, env, self)
}

function App() {
  const [content, setContent] = useState(
    '# Welcome to LightMarkit\n\n开始编辑你的 Markdown 文档...\n\n## 特性\n\n- 实时语法高亮\n- Markdown 支持\n- 自动保存\n\n**粗体文本** 和 *斜体文本*\n\n```javascript\nconst hello = "world";\n```\n\n## GFM 扩展支持\n\n### 表格\n\n| 功能 | 状态 |\n| --- | --- |\n| 语法高亮 | ✅ 完成 |\n| 实时预览 | ✅ 完成 |\n\n### 任务列表\n\n- [x] 集成 CodeMirror 6\n- [x] 集成 markdown-it\n- [ ] 实现自动保存\n\n### 删除线\n\n这是~~错误的文本~~正确的文本。'
  )
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [leftWidth, setLeftWidth] = useState(50)
  const [currentFile, setCurrentFilePath] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [folderFiles, setFolderFiles] = useState<FileInfo[]>([])
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<ToolbarMenu>(null)
  const autoSaveTimerRef = useRef<number | null>(null)
  const headerActionsRef = useRef<HTMLElement | null>(null)

  const runToolbarAction = useCallback((action: () => void | Promise<void>) => {
    setOpenMenu(null)
    void action()
  }, [])

  const handleMinimizeWindow = useCallback(() => {
    void getCurrentWindow().minimize()
  }, [])

  const handleToggleMaximizeWindow = useCallback(() => {
    void getCurrentWindow().toggleMaximize()
  }, [])

  const handleDragWindow = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || event.detail > 1) {
      return
    }

    const target = event.target
    if (
      target instanceof Element &&
      target.closest('button, [role="menu"], .menu-panel, .window-controls')
    ) {
      return
    }

    void getCurrentWindow().startDragging()
  }, [])

  // 打开文件
  const handleOpenFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Markdown',
            extensions: ['md', 'markdown'],
          },
        ],
      })

      if (selected && typeof selected === 'string') {
        const fileContent = await fileRead(selected)
        setContent(fileContent)
        setCurrentFilePath(selected)
        await setCurrentFile(selected)
      }
    } catch (error) {
      console.error('Failed to open file:', error)
    }
  }, [])

  // 打开文件夹
  const handleOpenFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      })

      if (selected && typeof selected === 'string') {
        const files = await scanFolder(selected)
        setFolderFiles(files)
        setCurrentFolder(selected)
        console.log('Folder opened:', selected, 'Files:', files)
      }
    } catch (error) {
      console.error('Failed to open folder:', error)
    }
  }, [])

  // 从文件列表选择文件
  const handleFileSelect = useCallback(async (filePath: string) => {
    try {
      const fileContent = await fileRead(filePath)
      setContent(fileContent)
      setCurrentFilePath(filePath)
      await setCurrentFile(filePath)
    } catch (error) {
      console.error('Failed to open file from list:', error)
    }
  }, [])

  // 导出 HTML
  const handleExportHtml = useCallback(async () => {
    try {
      const filePath = await save({
        defaultPath: getExportFileName(content, currentFile, 'html'),
        filters: [
          {
            name: 'HTML',
            extensions: ['html'],
          },
        ],
      })

      if (filePath) {
        // 渲染 Markdown 为 HTML
        const htmlContent = md.render(content)

        // 获取文档标题（从当前文件名或内容的第一个标题）
        let title = 'LightMarkit Document'
        if (currentFile) {
          title = currentFile.split(/[\\/]/).pop()?.replace(/\.md$/, '') || title
        } else {
          const firstHeading = content.match(/^#\s+(.+)$/m)
          if (firstHeading) {
            title = firstHeading[1]
          }
        }

        await exportHtml(filePath, htmlContent, title)
        console.log('HTML exported successfully:', filePath)
      }
    } catch (error) {
      console.error('Failed to export HTML:', error)
    }
  }, [content, currentFile])

  // 导出 PDF
  const handleExportPdf = useCallback(async () => {
    try {
      const filePath = await save({
        defaultPath: getExportFileName(content, currentFile, 'pdf'),
        filters: [
          {
            name: 'PDF',
            extensions: ['pdf'],
          },
        ],
      })

      if (filePath) {
        // 渲染 Markdown 为 HTML
        const htmlContent = md.render(content)

        // 获取文档标题
        let title = 'LightMarkit Document'
        if (currentFile) {
          title = currentFile.split(/[\\/]/).pop()?.replace(/\.md$/, '') || title
        } else {
          const firstHeading = content.match(/^#\s+(.+)$/m)
          if (firstHeading) {
            title = firstHeading[1]
          }
        }

        await exportPdf(filePath, htmlContent, title)
        console.log('PDF exported successfully:', filePath)
      }
    } catch (error) {
      console.error('Failed to export PDF:', error)
    }
  }, [content, currentFile])

  // 导出 Markdown（标准化格式）
  const handleExportMarkdown = useCallback(async () => {
    try {
      const filePath = await save({
        defaultPath: getExportFileName(content, currentFile, 'md'),
        filters: [
          {
            name: 'Markdown',
            extensions: ['md', 'markdown'],
          },
        ],
      })

      if (filePath) {
        await exportMarkdown(filePath, content)
        console.log('Markdown exported successfully:', filePath)
      }
    } catch (error) {
      console.error('Failed to export Markdown:', error)
    }
  }, [content, currentFile])

  // 另存为
  const handleSaveAsFile = useCallback(async () => {
    try {
      const selected = await save({
        filters: [
          {
            name: 'Markdown',
            extensions: ['md', 'markdown'],
          },
        ],
      })

      if (selected) {
        await fileWrite(selected, content)
        setCurrentFilePath(selected)
        await setCurrentFile(selected)
        console.log('File saved as:', selected)
      }
    } catch (error) {
      console.error('Failed to save file:', error)
    }
  }, [content])

  // 保存文件
  const handleSaveFile = useCallback(async () => {
    if (!currentFile) {
      // 如果没有当前文件，则另存为
      return handleSaveAsFile()
    }

    try {
      setSaveStatus('saving')
      await fileWrite(currentFile, content)
      setSaveStatus('saved')
      console.log('File saved successfully')

      // 2秒后重置状态
      setTimeout(() => {
        setSaveStatus('idle')
      }, 2000)
    } catch (error) {
      console.error('Failed to save file:', error)
      setSaveStatus('idle')
    }
  }, [currentFile, content, handleSaveAsFile])

  const handleCloseWindow = useCallback(async () => {
    if (currentFile) {
      await handleSaveFile()
    }

    await getCurrentWindow().close()
  }, [currentFile, handleSaveFile])

  // 自动保存：内容变更后 500ms 防抖触发
  useEffect(() => {
    // 清除之前的定时器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    // 只有在有当前文件时才启用自动保存
    if (!currentFile) {
      return
    }

    // 设置 500ms 防抖
    autoSaveTimerRef.current = window.setTimeout(() => {
      handleSaveFile()
    }, 500)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [content, currentFile, handleSaveFile])

  // 窗口失焦/关闭前强制保存
  useEffect(() => {
    const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
      if (currentFile && saveStatus !== 'saved') {
        e.preventDefault()
        await handleSaveFile()
      }
    }

    const handleVisibilityChange = async () => {
      if (document.hidden && currentFile) {
        await handleSaveFile()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [currentFile, saveStatus, handleSaveFile])

  // 加载当前文件
  useEffect(() => {
    const loadCurrentFile = async () => {
      try {
        const path = await getCurrentFile()
        if (path) {
          setCurrentFilePath(path)
          const fileContent = await fileRead(path)
          setContent(fileContent)
        }
      } catch (error) {
        console.error('Failed to load current file:', error)
      }
    }

    loadCurrentFile()
  }, [])

  // 处理 Ctrl+/ 快捷键切换模式
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 模式切换快捷键
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault()
        setViewMode((prev) => {
          if (prev === 'edit') return 'split'
          if (prev === 'split') return 'preview'
          return 'edit'
        })
      }

      // 打开文件夹快捷键
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        handleOpenFolder()
        return
      }

      // 打开文件快捷键
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        handleOpenFile()
      }

      // 保存文件快捷键
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSaveFile()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleOpenFile, handleOpenFolder, handleSaveFile])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (!(target instanceof Node) || !headerActionsRef.current?.contains(target)) {
        setOpenMenu(null)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  return (
    <div className="app-container">
      <header className="app-header" ref={headerActionsRef} onPointerDown={handleDragWindow}>
        <nav className="app-menu-bar" aria-label="应用菜单">
          <div className={`toolbar-menu ${openMenu === 'file' ? 'open' : ''}`}>
            <button
              type="button"
              className="menu-trigger"
              onClick={() => setOpenMenu((menu) => (menu === 'file' ? null : 'file'))}
              aria-haspopup="menu"
              aria-expanded={openMenu === 'file'}
              aria-label="文件"
            >
              文件
            </button>
            <div className="menu-panel" role="menu">
              <button
                type="button"
                className="menu-item"
                onClick={() => runToolbarAction(handleOpenFile)}
                title="打开文件 (Ctrl+O)"
                role="menuitem"
              >
                打开文件
              </button>
              <button
                type="button"
                className="menu-item"
                onClick={() => runToolbarAction(handleOpenFolder)}
                title="打开文件夹 (Ctrl+Shift+O)"
                role="menuitem"
              >
                打开文件夹
              </button>
            </div>
          </div>

          <div className={`toolbar-menu ${openMenu === 'export' ? 'open' : ''}`}>
            <button
              type="button"
              className="menu-trigger"
              onClick={() => setOpenMenu((menu) => (menu === 'export' ? null : 'export'))}
              aria-haspopup="menu"
              aria-expanded={openMenu === 'export'}
              aria-label="导出"
            >
              导出
            </button>
            <div className="menu-panel" role="menu">
              <button
                type="button"
                className="menu-item"
                onClick={() => runToolbarAction(handleExportHtml)}
                title="导出 HTML"
                role="menuitem"
              >
                导出 HTML
              </button>
              <button
                type="button"
                className="menu-item"
                onClick={() => runToolbarAction(handleExportPdf)}
                title="导出 PDF"
                role="menuitem"
              >
                导出 PDF
              </button>
              <button
                type="button"
                className="menu-item"
                onClick={() => runToolbarAction(handleExportMarkdown)}
                title="导出 Markdown"
                role="menuitem"
              >
                导出 Markdown
              </button>
            </div>
          </div>
        </nav>

        <div className="header-actions" aria-label="文档工具栏">
          {saveStatus === 'saved' && <span className="save-status">✓ 已自动保存</span>}
          <div className="view-mode-switcher" aria-label="视图模式">
            <button
              type="button"
              className={`mode-button ${viewMode === 'edit' ? 'active' : ''}`}
              onClick={() => setViewMode('edit')}
              title="纯编辑模式 (Ctrl+/)"
              aria-label="编辑"
            >
              <ViewModeIcon mode="edit" />
            </button>
            <button
              type="button"
              className={`mode-button ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => setViewMode('split')}
              title="分屏模式 (Ctrl+/)"
              aria-label="分屏"
            >
              <ViewModeIcon mode="split" />
            </button>
            <button
              type="button"
              className={`mode-button ${viewMode === 'preview' ? 'active' : ''}`}
              onClick={() => setViewMode('preview')}
              title="纯预览模式 (Ctrl+/)"
              aria-label="预览"
            >
              <ViewModeIcon mode="preview" />
            </button>
          </div>
          <div className="window-controls" aria-label="窗口控制">
            <button
              type="button"
              className="window-control-button"
              onClick={handleMinimizeWindow}
              title="最小化"
              aria-label="最小化"
            >
              <WindowControlIcon action="minimize" />
            </button>
            <button
              type="button"
              className="window-control-button"
              onClick={handleToggleMaximizeWindow}
              title="最大化"
              aria-label="最大化"
            >
              <WindowControlIcon action="maximize" />
            </button>
            <button
              type="button"
              className="window-control-button close"
              onClick={handleCloseWindow}
              title="关闭"
              aria-label="关闭"
            >
              <WindowControlIcon action="close" />
            </button>
          </div>
        </div>
      </header>
      <main className="app-main">
        <div className={`main-content ${currentFolder ? 'with-sidebar' : ''}`}>
          {currentFolder && (
            <aside className="file-sidebar">
              <FileList
                files={folderFiles}
                currentFile={currentFile}
                onFileSelect={handleFileSelect}
              />
            </aside>
          )}
          <div className={`editor-preview-container mode-${viewMode}`}>
            {(viewMode === 'edit' || viewMode === 'split') && (
              <div
                className="editor-panel"
                style={viewMode === 'split' ? { width: `${leftWidth}%` } : undefined}
              >
                <Editor value={content} onChange={setContent} />
              </div>
            )}
            {viewMode === 'split' && (
              <Resizer onResize={setLeftWidth} initialLeftWidth={leftWidth} />
            )}
            {(viewMode === 'preview' || viewMode === 'split') && (
              <div
                className="preview-panel"
                style={viewMode === 'split' ? { width: `${100 - leftWidth}%` } : undefined}
              >
                <Preview content={content} />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
