import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { EditorView } from 'codemirror'
import { listen } from '@tauri-apps/api/event'
import { open, save } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { getCurrentWindow } from '@tauri-apps/api/window'
import Editor from './components/Editor'
import { Preview } from './components/Preview'
import { Resizer } from './components/Resizer'
import { FileList, type FolderGroup } from './components/FileList'
import { Outline } from './components/Outline'
import {
  fileRead,
  fileWrite,
  getCurrentFile,
  setCurrentFile,
  watchCurrentFile,
} from './utils/fileApi'
import { scanFolder } from './utils/folderApi'
import { exportHtml, exportPdf } from './utils/exportApi'
import { extractMarkdownOutline, type OutlineItem } from './utils/outline'
import { renderMarkdownToExportHtml } from './utils/markdownRenderer'
import { resolvePreviewSourceLine } from './utils/scrollSync'
import appIconUrl from '../src-tauri/icons/icon.png'
import packageInfo from '../package.json'
import './App.css'

const APP_STATE_STORAGE_KEY = 'lightmarkit.app-state.v1'
const APP_VERSION = packageInfo.version
const REPOSITORY_URL = 'https://github.com/zhtdbobo/LightMarkit'
const UPDATE_CHECK_TIMEOUT_MS = 30_000

type ViewMode = 'edit' | 'split' | 'preview'
type SaveStatus = 'idle' | 'saving' | 'saved'
type ToolbarMenu = 'file' | 'export' | null
type ExportExtension = 'html' | 'pdf' | 'md'
type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'latest'; version: string }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; progress: number }
  | { state: 'installing'; version: string }
  | { state: 'error'; message: string }

const FALLBACK_DOCUMENT_NAME = 'LightMarkit Document'
const MARKDOWN_EXTENSION_PATTERN = /\.(md|markdown)$/i
const INVALID_FILE_NAME_CHARACTERS = /[<>:"/\\|?*]/g
const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 520
const MIN_OUTLINE_WIDTH = 220
const MAX_OUTLINE_WIDTH = 480
const APP_LAYOUT_STORAGE_KEY = 'lightmarkit.layout.v1'

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    return character.charCodeAt(0) < 32 ? ' ' : character
  }).join('')
}

function getPathBaseName(path: string): string {
  const trimmedPath = path.replace(/[\\/]+$/g, '')
  const baseName = trimmedPath.split(/[\\/]/).pop()?.trim()

  return baseName || path
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return '未知错误'
}

function getUpdateErrorMessage(error: unknown): string {
  const message = getErrorMessage(error)

  if (/signature|public key|base64|minisign/i.test(message)) {
    return '更新签名验证失败，已停止安装。'
  }

  if (/network|request|fetch|timeout|timed out|connect|dns|http status/i.test(message)) {
    return '连接更新服务器失败，请检查网络后重试。'
  }

  return `更新失败，未安装任何文件。${message ? ` ${message}` : ''}`
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

interface WindowControlsProps {
  isMacOS: boolean
  onClose: () => void
  onMinimize: () => void
  onToggleMaximize: () => void
}

function WindowControls({ isMacOS, onClose, onMinimize, onToggleMaximize }: WindowControlsProps) {
  const controls = isMacOS
    ? [
        { action: 'close' as const, label: '关闭', onClick: onClose },
        { action: 'minimize' as const, label: '最小化', onClick: onMinimize },
        { action: 'maximize' as const, label: '缩放', onClick: onToggleMaximize },
      ]
    : [
        { action: 'minimize' as const, label: '最小化', onClick: onMinimize },
        { action: 'maximize' as const, label: '最大化', onClick: onToggleMaximize },
        { action: 'close' as const, label: '关闭', onClick: onClose },
      ]

  return (
    <div
      className={`window-controls ${isMacOS ? 'macos' : 'windows'}`}
      role="group"
      aria-label="窗口控制"
    >
      {controls.map(({ action, label, onClick }) => (
        <button
          key={action}
          type="button"
          className={`window-control-button ${action}`}
          onClick={onClick}
          title={label}
          aria-label={label}
        >
          <WindowControlIcon action={action} />
        </button>
      ))}
    </div>
  )
}

function isMacOSPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }

  return /^Mac/.test(navigator.platform) || /Macintosh|Mac OS X/.test(navigator.userAgent)
}

function OutlineToggleIcon({ visible }: { visible: boolean }) {
  return (
    <svg className="mode-icon" viewBox="0 0 24 24" aria-hidden="true">
      {visible ? (
        <>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M9 8h8M9 12h8M9 16h5" />
          <path d="M6 8h1M6 12h1M6 16h1" />
        </>
      ) : (
        <>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M10 8h7" opacity="0.35" />
          <path d="M10 12h7" opacity="0.35" />
          <path d="M10 16h4" opacity="0.35" />
          <path d="M7 7l10 10" />
        </>
      )}
    </svg>
  )
}

function findActiveOutlineId(items: OutlineItem[], line: number): string | null {
  let activeId: string | null = null

  for (const item of items) {
    if (item.line <= line) {
      activeId = item.id
    } else {
      break
    }
  }

  return activeId
}

/** 视口内用于判定“当前章节”的垂直探针位置（偏上，避免跳到过远的下一段） */
const VIEWPORT_PROBE_RATIO = 0.32

function getEditorViewportLine(view: EditorView): number {
  try {
    const probeOffset = Math.max(12, view.scrollDOM.clientHeight * VIEWPORT_PROBE_RATIO)
    const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop + probeOffset)
    return view.state.doc.lineAt(block.from).number
  } catch {
    return 1
  }
}

function App() {
  const isMacOS = useMemo(() => isMacOSPlatform(), [])
  const [content, setContent] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [leftWidth, setLeftWidth] = useState(50)
  const [currentFile, setCurrentFilePath] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [openedFolders, setOpenedFolders] = useState<FolderGroup[]>(() => {
    try {
      const raw = localStorage.getItem(APP_STATE_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as { openedFolders?: FolderGroup[] }
      return Array.isArray(parsed.openedFolders) ? parsed.openedFolders : []
    } catch {
      return []
    }
  })
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const raw = localStorage.getItem(APP_LAYOUT_STORAGE_KEY)
      if (!raw) return 250
      const parsed = JSON.parse(raw) as { sidebarWidth?: number }
      if (typeof parsed.sidebarWidth !== 'number') return 250
      return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, parsed.sidebarWidth))
    } catch {
      return 250
    }
  })
  const [outlineWidth, setOutlineWidth] = useState(() => {
    try {
      const raw = localStorage.getItem(APP_LAYOUT_STORAGE_KEY)
      if (!raw) return 260
      const parsed = JSON.parse(raw) as { outlineWidth?: number }
      if (typeof parsed.outlineWidth !== 'number') return 260
      return Math.max(MIN_OUTLINE_WIDTH, Math.min(MAX_OUTLINE_WIDTH, parsed.outlineWidth))
    } catch {
      return 260
    }
  })
  const [openMenu, setOpenMenu] = useState<ToolbarMenu>(null)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [fileError, setFileError] = useState<string | null>(null)
  const outlineItems = useMemo(() => extractMarkdownOutline(content), [content])
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null)
  const [isOutlineVisible, setIsOutlineVisible] = useState(() => {
    try {
      const raw = localStorage.getItem(APP_STATE_STORAGE_KEY)
      if (!raw) return true
      const parsed = JSON.parse(raw) as { isOutlineVisible?: boolean }
      return parsed.isOutlineVisible ?? true
    } catch {
      return true
    }
  })
  const autoSaveTimerRef = useRef<number | null>(null)
  const lastSyncedContentRef = useRef('')
  const contentRef = useRef('')
  const headerActionsRef = useRef<HTMLElement | null>(null)
  const editorPanelRef = useRef<HTMLDivElement | null>(null)
  const previewPanelRef = useRef<HTMLDivElement | null>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const availableUpdateRef = useRef<Update | null>(null)
  const isSyncingScrollRef = useRef(false)
  const isProgrammaticCloseRef = useRef(false)
  const activeOutlineIdRef = useRef<string | null>(null)

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    try {
      localStorage.setItem(APP_LAYOUT_STORAGE_KEY, JSON.stringify({ sidebarWidth, outlineWidth }))
    } catch {
      // ignore storage failures
    }
  }, [sidebarWidth, outlineWidth])

  useEffect(() => {
    try {
      localStorage.setItem(
        APP_STATE_STORAGE_KEY,
        JSON.stringify({
          openedFolders: openedFolders.map((folder) => ({
            name: folder.name,
            path: folder.path,
            files: [],
          })),
          isOutlineVisible,
          currentFile,
        })
      )
    } catch {
      // ignore storage failures
    }
  }, [openedFolders, isOutlineVisible, currentFile])

  const runToolbarAction = useCallback((action: () => unknown | Promise<unknown>) => {
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
        lastSyncedContentRef.current = fileContent
        setCurrentFilePath(selected)
        setFileError(null)
        await setCurrentFile(selected)
      }
    } catch (error) {
      console.error('Failed to open file:', error)
      setFileError(`无法打开文件：${getErrorMessage(error)}`)
    }
  }, [])

  // 打开文件夹
  const handleOpenFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: true,
      })

      const selectedFolders = (Array.isArray(selected) ? selected : [selected]).filter(
        (folderPath): folderPath is string =>
          typeof folderPath === 'string' && folderPath.length > 0
      )

      if (selectedFolders.length > 0) {
        const scannedFolders = await Promise.all(
          selectedFolders.map(async (folderPath) => {
            const files = await scanFolder(folderPath)
            return {
              name: getPathBaseName(folderPath),
              path: folderPath,
              files,
            }
          })
        )

        setOpenedFolders((folders) => {
          const nextFolders = [...folders]

          scannedFolders.forEach((folder) => {
            const existingIndex = nextFolders.findIndex((item) => item.path === folder.path)

            if (existingIndex >= 0) {
              nextFolders[existingIndex] = folder
            } else {
              nextFolders.push(folder)
            }
          })

          return nextFolders
        })

        console.log('Folders opened:', scannedFolders)
      }
    } catch (error) {
      console.error('Failed to open folder:', error)
      setFileError(`无法打开文件夹：${getErrorMessage(error)}`)
    }
  }, [])

  // 从文件列表选择文件
  const handleFileSelect = useCallback(async (filePath: string) => {
    try {
      const fileContent = await fileRead(filePath)
      setContent(fileContent)
      lastSyncedContentRef.current = fileContent
      setCurrentFilePath(filePath)
      setFileError(null)
      await setCurrentFile(filePath)
    } catch (error) {
      console.error('Failed to open file from list:', error)
      setFileError(`无法打开文件：${getErrorMessage(error)}`)
    }
  }, [])

  const handleFolderClose = useCallback((folderPath: string) => {
    setOpenedFolders((folders) => folders.filter((folder) => folder.path !== folderPath))
  }, [])

  const handleSidebarResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()

      const startX = event.clientX
      const startWidth = sidebarWidth

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = startWidth + moveEvent.clientX - startX
        setSidebarWidth(Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, nextWidth)))
      }

      const handlePointerUp = () => {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
    },
    [sidebarWidth]
  )

  const handleOutlineResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()

      const startX = event.clientX
      const startWidth = outlineWidth

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = startWidth + (startX - moveEvent.clientX)
        setOutlineWidth(Math.max(MIN_OUTLINE_WIDTH, Math.min(MAX_OUTLINE_WIDTH, nextWidth)))
      }

      const handlePointerUp = () => {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
    },
    [outlineWidth]
  )

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
        const htmlContent = await renderMarkdownToExportHtml(content, { currentFile })

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
        const htmlContent = await renderMarkdownToExportHtml(content, { currentFile })

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

  // 另存为
  const handleSaveAsFile = useCallback(async (): Promise<boolean> => {
    try {
      const selected = await save({
        defaultPath: getExportFileName(content, currentFile, 'md'),
        filters: [
          {
            name: 'Markdown',
            extensions: ['md', 'markdown'],
          },
        ],
      })

      if (selected) {
        await fileWrite(selected, content)
        lastSyncedContentRef.current = content
        setCurrentFilePath(selected)
        await setCurrentFile(selected)
        console.log('File saved as:', selected)
        return true
      }

      return false
    } catch (error) {
      console.error('Failed to save file:', error)
      return false
    }
  }, [content, currentFile])

  // 保存文件
  const handleSaveFile = useCallback(async (): Promise<boolean> => {
    if (!currentFile) {
      return handleSaveAsFile()
    }

    try {
      setSaveStatus('saving')
      await fileWrite(currentFile, content)
      lastSyncedContentRef.current = content
      setSaveStatus('saved')
      console.log('File saved successfully')

      // 2秒后重置状态
      setTimeout(() => {
        setSaveStatus('idle')
      }, 1200)
      return true
    } catch (error) {
      console.error('Failed to save file:', error)
      setSaveStatus('idle')
      return false
    }
  }, [currentFile, content, handleSaveAsFile])

  const handleCloseWindow = useCallback(async () => {
    if (!currentFile && content.trim().length > 0) {
      const saved = await handleSaveAsFile()
      if (!saved) {
        return
      }
    } else if (currentFile) {
      const saved = await handleSaveFile()
      if (!saved) {
        return
      }
    }

    isProgrammaticCloseRef.current = true
    await getCurrentWindow().destroy()
  }, [content, currentFile, handleSaveAsFile, handleSaveFile])

  useEffect(() => {
    let unlisten: (() => void) | undefined

    void getCurrentWindow()
      .onCloseRequested((event) => {
        if (isProgrammaticCloseRef.current) {
          return
        }

        event.preventDefault()
        void handleCloseWindow()
      })
      .then((unsubscribe) => {
        unlisten = unsubscribe
      })

    return () => {
      unlisten?.()
    }
  }, [handleCloseWindow])

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

    // 外部同步写入时不重复触发自动保存
    if (content === lastSyncedContentRef.current) {
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

  // 加载当前文件 + 恢复上次文件夹
  useEffect(() => {
    const loadCurrentFile = async () => {
      try {
        let path = await getCurrentFile()

        if (!path) {
          try {
            const raw = localStorage.getItem(APP_STATE_STORAGE_KEY)
            if (raw) {
              const parsed = JSON.parse(raw) as { currentFile?: string | null }
              if (typeof parsed.currentFile === 'string' && parsed.currentFile.length > 0) {
                path = parsed.currentFile
              }
            }
          } catch {
            // ignore
          }
        }

        if (path) {
          const fileContent = await fileRead(path)
          setContent(fileContent)
          lastSyncedContentRef.current = fileContent
          setCurrentFilePath(path)
          setFileError(null)
          await setCurrentFile(path)
        }
      } catch (error) {
        console.error('Failed to load current file:', error)
        setFileError(`无法恢复上次打开的文件：${getErrorMessage(error)}`)
      }
    }

    const restoreFolders = async () => {
      try {
        const raw = localStorage.getItem(APP_STATE_STORAGE_KEY)
        if (!raw) {
          return
        }

        const parsed = JSON.parse(raw) as { openedFolders?: FolderGroup[] }
        const folders = Array.isArray(parsed.openedFolders) ? parsed.openedFolders : []
        if (folders.length === 0) {
          return
        }

        const restored = await Promise.all(
          folders.map(async (folder) => {
            try {
              const files = await scanFolder(folder.path)
              return {
                name: folder.name || getPathBaseName(folder.path),
                path: folder.path,
                files,
              }
            } catch {
              return null
            }
          })
        )

        setOpenedFolders(restored.filter((folder): folder is FolderGroup => folder !== null))
      } catch (error) {
        console.error('Failed to restore folders:', error)
      }
    }

    void loadCurrentFile()
    void restoreFolders()
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
        setIsAboutOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  useEffect(() => {
    if (viewMode !== 'edit') {
      return
    }

    previewPanelRef.current = null
  }, [viewMode])

  useEffect(() => {
    if (viewMode !== 'preview') {
      return
    }

    editorPanelRef.current = null
  }, [viewMode])

  const handleOutlineItemClick = useCallback((item: OutlineItem) => {
    const view = editorViewRef.current
    if (!view) {
      return
    }

    const lineNumber = Math.min(Math.max(item.line, 1), view.state.doc.lines)
    const lineInfo = view.state.doc.line(lineNumber)
    activeOutlineIdRef.current = item.id
    setActiveOutlineId(item.id)
    view.focus()
    view.dispatch({
      selection: { anchor: lineInfo.from, head: lineInfo.from },
      effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start', yMargin: 24 }),
    })
  }, [])

  useEffect(() => {
    if (!currentFile) {
      return
    }

    let disposed = false
    let unlisten: (() => void) | undefined

    void watchCurrentFile().catch((error) => {
      console.error('Failed to start file watcher:', error)
    })

    void listen<string>('file-changed', async (event) => {
      if (disposed || event.payload !== currentFile) {
        return
      }

      try {
        const latestContent = await fileRead(currentFile)
        if (latestContent === lastSyncedContentRef.current) {
          return
        }

        // 本地有未同步修改时不覆盖，避免与其他程序编辑冲突时丢字
        if (contentRef.current !== lastSyncedContentRef.current) {
          return
        }

        lastSyncedContentRef.current = latestContent
        setContent(latestContent)
        setFileError(null)
      } catch (error) {
        console.error('Failed to refresh file content:', error)
      }
    }).then((unsubscribe) => {
      if (disposed) {
        unsubscribe()
        return
      }
      unlisten = unsubscribe
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [currentFile])

  const updateActiveOutlineFromLine = useCallback(
    (line: number) => {
      const nextId = findActiveOutlineId(outlineItems, line)
      if (nextId === activeOutlineIdRef.current) {
        return
      }

      activeOutlineIdRef.current = nextId
      setActiveOutlineId(nextId)

      if (!nextId) {
        return
      }

      const activeButton = document.querySelector<HTMLButtonElement>(
        `[data-outline-id="${nextId}"]`
      )
      if (!activeButton) {
        return
      }

      const list = activeButton.closest('.outline-list') as HTMLElement | null
      if (list) {
        const listRect = list.getBoundingClientRect()
        const itemRect = activeButton.getBoundingClientRect()
        const offset =
          itemRect.top - listRect.top - listRect.height / 2 + itemRect.height / 2 + list.scrollTop
        list.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' })
      } else {
        activeButton.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    },
    [outlineItems]
  )

  // 单栏模式直接监听当前视口；分屏模式由滚动同步逻辑按实际滚动来源更新。
  useEffect(() => {
    if (viewMode === 'split') {
      return
    }

    const editorScroller = editorPanelRef.current?.querySelector<HTMLElement>('.cm-scroller')
    const previewScroller =
      previewPanelRef.current?.querySelector<HTMLElement>('.preview-container')
    const view = editorViewRef.current

    const refreshHighlight = () => {
      if (viewMode === 'edit' && view) {
        updateActiveOutlineFromLine(getEditorViewportLine(view))
        return
      }

      if (!previewScroller) {
        return
      }

      const previewLine = resolvePreviewSourceLine(previewScroller)
      if (previewLine !== null) {
        updateActiveOutlineFromLine(previewLine)
      }
    }

    let rafId: number | null = null
    const scheduleRefresh = () => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        refreshHighlight()
      })
    }

    refreshHighlight()
    editorScroller?.addEventListener('scroll', scheduleRefresh, { passive: true })
    previewScroller?.addEventListener('scroll', scheduleRefresh, { passive: true })

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      editorScroller?.removeEventListener('scroll', scheduleRefresh)
      previewScroller?.removeEventListener('scroll', scheduleRefresh)
    }
  }, [viewMode, content, outlineItems, updateActiveOutlineFromLine])

  // 分屏滚动同步：按阅读探针和块级锚点对齐，避免大块内容造成漂移
  useEffect(() => {
    if (viewMode !== 'split') {
      return
    }

    const editorScroller = editorPanelRef.current?.querySelector<HTMLElement>('.cm-scroller')
    const previewScroller =
      previewPanelRef.current?.querySelector<HTMLElement>('.preview-container')
    const view = editorViewRef.current

    if (!editorScroller || !previewScroller || !view) {
      return
    }

    type Anchor = { line: number; top: number }

    const collectAnchors = (): Anchor[] => {
      const nodes = previewScroller.querySelectorAll<HTMLElement>('[data-source-line]')
      const anchors: Anchor[] = []
      const rootTop = previewScroller.getBoundingClientRect().top

      nodes.forEach((node) => {
        const line = Number.parseInt(node.getAttribute('data-source-line') || '', 10)
        if (!Number.isFinite(line) || line <= 0) {
          return
        }
        const top = node.getBoundingClientRect().top - rootTop + previewScroller.scrollTop
        anchors.push({ line, top })
      })

      anchors.sort((a, b) => a.line - b.line || a.top - b.top)
      return anchors
    }

    const previewTopForLine = (anchors: Anchor[], line: number): number => {
      if (anchors.length === 0) return 0
      if (line <= anchors[0].line) return Math.max(0, anchors[0].top)
      const last = anchors[anchors.length - 1]
      if (line >= last.line)
        return Math.max(0, previewScroller.scrollHeight - previewScroller.clientHeight)

      for (let i = 0; i < anchors.length - 1; i += 1) {
        const a = anchors[i]
        const b = anchors[i + 1]
        if (line >= a.line && line <= b.line) {
          if (b.line === a.line) return a.top
          const t = (line - a.line) / (b.line - a.line)
          return a.top + t * (b.top - a.top)
        }
      }

      return last.top
    }

    const sourceLineForPreviewViewport = (): number => {
      return resolvePreviewSourceLine(previewScroller) ?? 1
    }

    const editorScrollTopForLine = (line: number): number => {
      const safeLine = Math.min(Math.max(1, line), view.state.doc.lines)
      const lineInfo = view.state.doc.line(safeLine)
      return Math.max(0, view.lineBlockAt(lineInfo.from).top)
    }

    let syncRaf: number | null = null

    const syncOutlineFromEditor = () => {
      if (isSyncingScrollRef.current) return
      const line = getEditorViewportLine(view)
      updateActiveOutlineFromLine(line)
    }

    const syncFromEditor = () => {
      if (isSyncingScrollRef.current || syncRaf !== null) return
      syncRaf = window.requestAnimationFrame(() => {
        syncRaf = null
        if (isSyncingScrollRef.current) return
        const anchors = collectAnchors()
        if (anchors.length === 0) return
        const line = getEditorViewportLine(view)
        updateActiveOutlineFromLine(line)
        const targetTop = previewTopForLine(anchors, line)
        if (Math.abs(previewScroller.scrollTop - targetTop) < 1) return
        isSyncingScrollRef.current = true
        previewScroller.scrollTop = targetTop
        window.requestAnimationFrame(() => {
          isSyncingScrollRef.current = false
        })
      })
    }

    const syncFromPreview = () => {
      if (isSyncingScrollRef.current || syncRaf !== null) return
      syncRaf = window.requestAnimationFrame(() => {
        syncRaf = null
        if (isSyncingScrollRef.current) return
        const anchors = collectAnchors()
        if (anchors.length === 0) return
        const line = sourceLineForPreviewViewport()
        updateActiveOutlineFromLine(line)
        const targetTop = editorScrollTopForLine(line)
        if (Math.abs(editorScroller.scrollTop - targetTop) < 1) return
        isSyncingScrollRef.current = true
        editorScroller.scrollTop = targetTop
        window.requestAnimationFrame(() => {
          isSyncingScrollRef.current = false
        })
      })
    }

    editorScroller.addEventListener('scroll', syncFromEditor, { passive: true })
    previewScroller.addEventListener('scroll', syncFromPreview, { passive: true })
    syncOutlineFromEditor()

    return () => {
      if (syncRaf !== null) {
        window.cancelAnimationFrame(syncRaf)
      }
      editorScroller.removeEventListener('scroll', syncFromEditor)
      previewScroller.removeEventListener('scroll', syncFromPreview)
    }
  }, [viewMode, content, outlineItems, updateActiveOutlineFromLine])

  const handleCheckForUpdates = async () => {
    setUpdateStatus({ state: 'checking' })

    try {
      await availableUpdateRef.current?.close()
      availableUpdateRef.current = await check({ timeout: UPDATE_CHECK_TIMEOUT_MS })

      if (availableUpdateRef.current) {
        setUpdateStatus({ state: 'available', version: availableUpdateRef.current.version })
      } else {
        setUpdateStatus({ state: 'latest', version: APP_VERSION })
      }
    } catch (error) {
      console.error('检查更新失败', error)
      availableUpdateRef.current = null
      setUpdateStatus({ state: 'error', message: getUpdateErrorMessage(error) })
    }
  }

  const handleInstallUpdate = async () => {
    const update = availableUpdateRef.current
    if (updateStatus.state !== 'available' || !update) return

    const version = update.version
    let downloadedBytes = 0
    let contentLength: number | undefined
    setUpdateStatus({ state: 'downloading', version, progress: 0 })

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === 'Started') {
          downloadedBytes = 0
          contentLength = event.data.contentLength
          setUpdateStatus({ state: 'downloading', version, progress: 0 })
          return
        }

        if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength
          const progress = contentLength
            ? Math.min(99, Math.round((downloadedBytes / contentLength) * 100))
            : 0
          setUpdateStatus({ state: 'downloading', version, progress })
          return
        }

        setUpdateStatus({ state: 'installing', version })
      })

      await relaunch()
    } catch (error) {
      console.error('下载或安装更新失败', error)
      setUpdateStatus({ state: 'error', message: getUpdateErrorMessage(error) })
    }
  }

  return (
    <div className="app-container">
      <header
        className={`app-header ${isMacOS ? 'platform-macos' : 'platform-windows'}`}
        ref={headerActionsRef}
        onPointerDown={handleDragWindow}
      >
        {isMacOS && (
          <WindowControls
            isMacOS
            onClose={handleCloseWindow}
            onMinimize={handleMinimizeWindow}
            onToggleMaximize={handleToggleMaximizeWindow}
          />
        )}
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
            </div>
          </div>

          <button
            type="button"
            className="menu-trigger"
            onClick={() => {
              setOpenMenu(null)
              setIsAboutOpen(true)
            }}
            aria-haspopup="dialog"
            aria-expanded={isAboutOpen}
            aria-label="关于"
          >
            关于
          </button>
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
          <button
            type="button"
            className={`mode-button outline-toolbar-toggle ${isOutlineVisible ? 'active' : ''}`}
            onClick={() => setIsOutlineVisible((value) => !value)}
            title={isOutlineVisible ? '隐藏大纲' : '显示大纲'}
            aria-label={isOutlineVisible ? '隐藏大纲' : '显示大纲'}
            aria-pressed={isOutlineVisible}
          >
            <OutlineToggleIcon visible={isOutlineVisible} />
          </button>
          {!isMacOS && (
            <WindowControls
              isMacOS={false}
              onClose={handleCloseWindow}
              onMinimize={handleMinimizeWindow}
              onToggleMaximize={handleToggleMaximizeWindow}
            />
          )}
        </div>
      </header>
      {fileError && (
        <div className="file-error-banner" role="alert">
          <span>{fileError}</span>
          <button
            type="button"
            className="file-error-dismiss"
            onClick={() => setFileError(null)}
            aria-label="关闭提示"
            title="关闭提示"
          >
            ×
          </button>
        </div>
      )}
      <main className="app-main">
        <div
          className={`main-content ${openedFolders.length > 0 ? 'with-sidebar' : ''}`}
          style={
            {
              ...(openedFolders.length > 0 ? { '--sidebar-width': `${sidebarWidth}px` } : {}),
              '--outline-width': `${outlineWidth}px`,
            } as React.CSSProperties
          }
        >
          {openedFolders.length > 0 && (
            <aside className="file-sidebar">
              <FileList
                folders={openedFolders}
                currentFile={currentFile}
                onFileSelect={handleFileSelect}
                onFolderClose={handleFolderClose}
              />
              <div
                className="sidebar-resizer"
                onPointerDown={handleSidebarResizeStart}
                role="separator"
                aria-orientation="vertical"
                aria-label="调整文件夹栏宽度"
                title="拖动调整文件夹栏宽度"
              />
            </aside>
          )}
          <div className={`editor-preview-container mode-${viewMode}`}>
            <div className="editor-preview-surface">
              {(viewMode === 'edit' || viewMode === 'split') && (
                <div
                  ref={editorPanelRef}
                  className="editor-panel"
                  style={viewMode === 'split' ? { width: `${leftWidth}%` } : undefined}
                >
                  <Editor
                    value={content}
                    onChange={setContent}
                    onReady={(view) => {
                      editorViewRef.current = view
                    }}
                  />
                </div>
              )}
              {viewMode === 'split' && (
                <Resizer onResize={setLeftWidth} initialLeftWidth={leftWidth} />
              )}
              {(viewMode === 'preview' || viewMode === 'split') && (
                <div
                  ref={previewPanelRef}
                  className="preview-panel"
                  style={viewMode === 'split' ? { width: `${100 - leftWidth}%` } : undefined}
                >
                  <Preview content={content} currentFile={currentFile} />
                </div>
              )}
            </div>
            {isOutlineVisible && (
              <aside
                className="outline-sidebar"
                style={{ width: outlineWidth, flex: `0 0 ${outlineWidth}px` }}
              >
                <Outline
                  items={outlineItems}
                  activeItemId={activeOutlineId}
                  onItemClick={handleOutlineItemClick}
                />
                <div
                  className="outline-resizer"
                  onPointerDown={handleOutlineResizeStart}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="调整大纲栏宽度"
                  title="拖动调整大纲栏宽度"
                />
              </aside>
            )}
          </div>
        </div>
      </main>
      {isAboutOpen && (
        <div
          className="about-dialog-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsAboutOpen(false)
            }
          }}
        >
          <section
            className="about-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-dialog-title"
          >
            <button
              type="button"
              className="about-dialog-close"
              onClick={() => setIsAboutOpen(false)}
              aria-label="关闭关于窗口"
              title="关闭"
              autoFocus
            >
              ×
            </button>
            <div className="about-dialog-hero">
              <div className="about-dialog-logo-frame">
                <img className="about-dialog-logo" src={appIconUrl} alt="LightMarkit 图标" />
              </div>
              <h2 id="about-dialog-title">LightMarkit</h2>
              <p className="about-dialog-version">版本 {APP_VERSION}</p>
              <p className="about-dialog-description">
                一款轻量、简洁的 Markdown 编辑器，支持实时预览、文档大纲、Mermaid 图表与多格式导出。
              </p>
            </div>

            <div className="about-feature-grid" aria-label="产品特点">
              <div className="about-feature-card">
                <span className="about-feature-icon" aria-hidden="true">
                  #
                </span>
                <div>
                  <h3>专注写作</h3>
                  <p>简洁的 Markdown 编辑与实时预览</p>
                </div>
              </div>
              <div className="about-feature-card">
                <span className="about-feature-icon" aria-hidden="true">
                  ↔
                </span>
                <div>
                  <h3>轻巧高效</h3>
                  <p>基于 Tauri 构建，快速启动、低资源占用</p>
                </div>
              </div>
            </div>

            <div className="about-details">
              <div className="about-detail-row">
                <span className="about-detail-label">开源许可</span>
                <span className="about-detail-value">MIT License</span>
              </div>
              <div className="about-detail-row">
                <span className="about-detail-label">项目主页</span>
                <a
                  href={REPOSITORY_URL}
                  className="about-repository-link"
                  onClick={(event) => {
                    event.preventDefault()
                    void openUrl(REPOSITORY_URL)
                  }}
                >
                  GitHub
                </a>
              </div>
              <div className="about-detail-row about-update-row">
                <div>
                  <span className="about-detail-label">软件更新</span>
                  {updateStatus.state === 'latest' && (
                    <p role="status" className="about-update-status latest">
                      当前已是最新版本 v{updateStatus.version}
                    </p>
                  )}
                  {updateStatus.state === 'available' && (
                    <p role="status" className="about-update-status available">
                      发现新版本 v{updateStatus.version}
                    </p>
                  )}
                  {updateStatus.state === 'downloading' && (
                    <div className="about-update-progress" role="status" aria-live="polite">
                      <span>
                        正在下载 v{updateStatus.version}：{updateStatus.progress}%
                      </span>
                      <progress max="100" value={updateStatus.progress}>
                        {updateStatus.progress}%
                      </progress>
                    </div>
                  )}
                  {updateStatus.state === 'installing' && (
                    <p role="status" className="about-update-status available">
                      下载完成，正在验证签名并安装 v{updateStatus.version}…
                    </p>
                  )}
                  {updateStatus.state === 'error' && (
                    <p role="alert" className="about-update-status error">
                      {updateStatus.message}
                    </p>
                  )}
                </div>
                {updateStatus.state === 'available' ? (
                  <button
                    type="button"
                    className="about-update-button"
                    onClick={() => void handleInstallUpdate()}
                  >
                    下载并安装
                  </button>
                ) : updateStatus.state === 'downloading' ? (
                  <button type="button" className="about-update-button" disabled>
                    下载中 {updateStatus.progress}%
                  </button>
                ) : updateStatus.state === 'installing' ? (
                  <button type="button" className="about-update-button" disabled>
                    正在安装…
                  </button>
                ) : (
                  <button
                    type="button"
                    className="about-update-button secondary"
                    onClick={() => void handleCheckForUpdates()}
                    disabled={updateStatus.state === 'checking'}
                  >
                    {updateStatus.state === 'checking' ? '正在检查…' : '检查更新'}
                  </button>
                )}
              </div>
            </div>

            <p className="about-dialog-footer">© 2026 zhtdbobo · 让 Markdown 写作更轻松</p>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
