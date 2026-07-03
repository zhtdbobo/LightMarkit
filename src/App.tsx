import { useState, useEffect, useCallback, useRef } from 'react'
import { open, save } from '@tauri-apps/plugin-dialog'
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
  const autoSaveTimerRef = useRef<number | null>(null)

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
  }, [content])

  // 另存为
  const handleSaveAsFile = useCallback(async () => {
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

      // 打开文件快捷键
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault()
        handleOpenFile()
      }

      // 打开文件夹快捷键
      if (e.ctrlKey && e.shiftKey && e.key === 'O') {
        e.preventDefault()
        handleOpenFolder()
      }

      // 保存文件快捷键
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        handleSaveFile()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleOpenFile, handleOpenFolder, handleSaveFile])

  return (
    <div className="app-container">
      <header className="app-header">
        <div>
          <h1>LightMarkit</h1>
          <p className="subtitle">
            {currentFile ? currentFile.split(/[\\/]/).pop() : '轻量级 Markdown 编辑器'}
          </p>
        </div>
        <div className="header-actions">
          {saveStatus === 'saved' && <span className="save-status">✓ 已自动保存</span>}
          <button className="action-button" onClick={handleOpenFile} title="打开文件 (Ctrl+O)">
            打开文件
          </button>
          <button className="action-button" onClick={handleOpenFolder} title="打开文件夹 (Ctrl+Shift+O)">
            打开文件夹
          </button>
          <button className="action-button" onClick={handleSaveFile} title="保存文件 (Ctrl+S)">
            保存
          </button>
          <button className="action-button" onClick={handleExportHtml} title="导出 HTML">
            导出 HTML
          </button>
          <button className="action-button" onClick={handleExportPdf} title="导出 PDF">
            导出 PDF
          </button>
          <button className="action-button" onClick={handleExportMarkdown} title="导出 Markdown">
            导出 Markdown
          </button>
          <div className="view-mode-switcher">
            <button
              className={`mode-button ${viewMode === 'edit' ? 'active' : ''}`}
              onClick={() => setViewMode('edit')}
              title="纯编辑模式 (Ctrl+/)"
            >
              编辑
            </button>
            <button
              className={`mode-button ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => setViewMode('split')}
              title="分屏模式 (Ctrl+/)"
            >
              分屏
            </button>
            <button
              className={`mode-button ${viewMode === 'preview' ? 'active' : ''}`}
              onClick={() => setViewMode('preview')}
              title="纯预览模式 (Ctrl+/)"
            >
              预览
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
          {viewMode === 'split' && <Resizer onResize={setLeftWidth} initialLeftWidth={leftWidth} />}
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
