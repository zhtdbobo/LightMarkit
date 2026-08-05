import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { EditorView } from 'codemirror'
import { undo, undoDepth } from '@codemirror/commands'
import { listen } from '@tauri-apps/api/event'
import { open, save } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { getCurrentWindow } from '@tauri-apps/api/window'
import Editor from './components/Editor'
import { Preview } from './components/Preview'
import { FileList, type FolderGroup } from './components/FileList'
import { Outline } from './components/Outline'
import {
  fileRead,
  fileWrite,
  getCurrentFile,
  markFrontendReady,
  setCurrentFile,
  watchCurrentFile,
} from './utils/fileApi'
import { scanFolder } from './utils/folderApi'
import { exportHtml, exportPdf } from './utils/exportApi'
import { extractMarkdownOutline, type OutlineItem } from './utils/outline'
import { renderMarkdownToExportHtml } from './utils/markdownRenderer'
import {
  collectPreviewAnchors,
  editorScrollTopForLine,
  previewScrollTopForLine,
  previewScrollTopForSourceLine,
  resolvePreviewSourceLine,
} from './utils/scrollSync'
import appIconUrl from '../src-tauri/icons/icon.png'
import packageInfo from '../package.json'
import './App.css'

const APP_STATE_STORAGE_KEY = 'lightmarkit.app-state.v1'
const APP_VERSION = packageInfo.version
const REPOSITORY_URL = 'https://github.com/zhtdbobo/LightMarkit'
const UPDATE_CHECK_TIMEOUT_MS = 30_000

type ViewMode = 'edit' | 'preview'
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

function UndoIcon() {
  return (
    <svg className="mode-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 7H4v5" />
      <path d="M4 12c2.3-4.1 7.2-5.7 11.2-3.6 3.5 1.8 4.8 6.1 3 9.6-1.1 2-3.1 3.4-5.4 3.7" />
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
  onClose: () => void
  onMinimize: () => void
  onToggleMaximize: () => void
}

function WindowControls({ onClose, onMinimize, onToggleMaximize }: WindowControlsProps) {
  const controls = [
    { action: 'minimize' as const, label: '最小化', onClick: onMinimize },
    { action: 'maximize' as const, label: '最大化', onClick: onToggleMaximize },
    { action: 'close' as const, label: '关闭', onClick: onClose },
  ]

  return (
    <div className="window-controls windows" role="group" aria-label="窗口控制">
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

function getShortcutLabel(isMacOS: boolean, key: string, shift = false): string {
  if (isMacOS) {
    return `${shift ? '⇧' : ''}⌘${key}`
  }

  return `Ctrl+${shift ? 'Shift+' : ''}${key}`
}

interface SettingsPageProps {
  fullWidth: boolean
  isMacOS: boolean
  updateStatus: UpdateStatus
  onClose: () => void
  onWidthChange: (fullWidth: boolean) => void
  onOpenRepository: () => void
  onCheckForUpdates: () => void
  onInstallUpdate: () => void
}

function SettingsPage({
  fullWidth,
  isMacOS,
  updateStatus,
  onClose,
  onWidthChange,
  onOpenRepository,
  onCheckForUpdates,
  onInstallUpdate,
}: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<'editor' | 'about'>('editor')
  const closeButton = (
    <button
      type="button"
      className="settings-close-button"
      onClick={onClose}
      aria-label="关闭设置"
      title="关闭设置"
    >
      ×
    </button>
  )

  return (
    <section
      className={`settings-page ${isMacOS ? 'platform-macos' : 'platform-windows'}`}
      aria-labelledby="settings-page-title"
    >
      <aside className="settings-sidebar">
        <header className="settings-sidebar-header">
          {isMacOS && closeButton}
          <h1 id="settings-page-title">设置</h1>
        </header>
        <nav className="settings-navigation" aria-label="设置分类">
          <button
            type="button"
            className={`settings-navigation-item ${activeSection === 'editor' ? 'active' : ''}`}
            onClick={() => setActiveSection('editor')}
            aria-current={activeSection === 'editor' ? 'page' : undefined}
          >
            编辑
          </button>
          <button
            type="button"
            className={`settings-navigation-item ${activeSection === 'about' ? 'active' : ''}`}
            onClick={() => setActiveSection('about')}
            aria-current={activeSection === 'about' ? 'page' : undefined}
          >
            关于
          </button>
        </nav>
      </aside>

      <main className="settings-detail">
        {!isMacOS && closeButton}

        {activeSection === 'editor' ? (
          <section className="settings-detail-section" aria-labelledby="editor-settings-title">
            <header className="settings-content-header">
              <h2 id="editor-settings-title">编辑</h2>
              <p>设置编辑与预览内容的显示宽度。</p>
            </header>
            <div className="settings-card">
              <div className="settings-card-heading">
                <h3>内容宽度</h3>
                <p>选择适合当前写作习惯的页面布局。</p>
              </div>
              <div className="settings-width-options" role="radiogroup" aria-label="内容宽度">
                <button
                  type="button"
                  className={`settings-width-card ${fullWidth ? 'selected' : ''}`}
                  role="radio"
                  aria-checked={fullWidth}
                  onClick={() => onWidthChange(true)}
                >
                  <span className="settings-width-preview full" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>
                    <strong>铺满</strong>
                    <small>充分利用编辑区域宽度，左右保留 24px 间距</small>
                  </span>
                </button>
                <button
                  type="button"
                  className={`settings-width-card ${fullWidth ? '' : 'selected'}`}
                  role="radio"
                  aria-checked={!fullWidth}
                  onClick={() => onWidthChange(false)}
                >
                  <span className="settings-width-preview reading" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>
                    <strong>默认阅读宽度</strong>
                    <small>正文居中显示，最大宽度 920px</small>
                  </span>
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="settings-detail-section" aria-labelledby="about-title">
            <header className="settings-content-header">
              <h2 id="about-title">关于 LightMarkit</h2>
              <p>版本信息、开源许可与软件更新。</p>
            </header>
            <div className="settings-card settings-about-card">
              <div className="about-dialog-hero">
                <div className="about-dialog-logo-frame">
                  <img className="about-dialog-logo" src={appIconUrl} alt="LightMarkit 图标" />
                </div>
                <p className="about-dialog-version">版本 {APP_VERSION}</p>
                <p className="about-dialog-description">
                  一款轻量、简洁的 Markdown 编辑器，支持所见即所得、文档大纲、Mermaid
                  图表与多格式导出。
                </p>
              </div>

              <div className="about-feature-grid" aria-label="产品特点">
                <div className="about-feature-card">
                  <span className="about-feature-icon" aria-hidden="true">
                    #
                  </span>
                  <div>
                    <h3>专注写作</h3>
                    <p>源码编辑与独立预览，输入位置清晰准确</p>
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
                      onOpenRepository()
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
                    <button type="button" className="about-update-button" onClick={onInstallUpdate}>
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
                      onClick={onCheckForUpdates}
                      disabled={updateStatus.state === 'checking'}
                    >
                      {updateStatus.state === 'checking' ? '正在检查…' : '检查更新'}
                    </button>
                  )}
                </div>
              </div>

              <p className="about-dialog-footer">© 2026 zhtdbobo · 让 Markdown 写作更轻松</p>
            </div>
          </section>
        )}
      </main>
    </section>
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

function getEditorViewportTopLine(view: EditorView): number {
  try {
    const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop + 1)
    return view.state.doc.lineAt(block.from).number
  } catch {
    return 1
  }
}

function App() {
  const isMacOS = useMemo(() => isMacOSPlatform(), [])
  const openFileShortcut = getShortcutLabel(isMacOS, 'O')
  const openFolderShortcut = getShortcutLabel(isMacOS, 'O', true)
  const undoShortcut = getShortcutLabel(isMacOS, 'Z')
  const [content, setContent] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('edit')
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
  const [isSettingsPageOpen, setIsSettingsPageOpen] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [fileError, setFileError] = useState<string | null>(null)
  const outlineItems = useMemo(() => extractMarkdownOutline(content), [content])
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null)
  const [isEditorFullWidth, setIsEditorFullWidth] = useState(() => {
    try {
      const raw = localStorage.getItem(APP_STATE_STORAGE_KEY)
      if (!raw) return true
      const parsed = JSON.parse(raw) as { editorWidthMode?: 'full' | 'reading' }
      return parsed.editorWidthMode !== 'reading'
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
  const isProgrammaticCloseRef = useRef(false)
  const activeOutlineIdRef = useRef<string | null>(null)
  const pendingViewScrollLineRef = useRef<number | null>(null)
  const fileLoadRequestRef = useRef(0)
  const systemOpenRequestRef = useRef(0)

  const updateUndoAvailability = useCallback((view: EditorView | null = editorViewRef.current) => {
    setCanUndo(view ? undoDepth(view.state) > 0 : false)
  }, [])

  const handleToggleViewMode = useCallback(() => {
    const editorView = editorViewRef.current
    const previewScroller =
      previewPanelRef.current?.querySelector<HTMLElement>('.preview-container')

    pendingViewScrollLineRef.current =
      viewMode === 'edit' && editorView
        ? getEditorViewportTopLine(editorView)
        : previewScroller
          ? resolvePreviewSourceLine(previewScroller, 0)
          : null

    setViewMode((current) => (current === 'edit' ? 'preview' : 'edit'))
  }, [viewMode])

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
          editorWidthMode: isEditorFullWidth ? 'full' : 'reading',
          currentFile,
        })
      )
    } catch {
      // ignore storage failures
    }
  }, [openedFolders, isEditorFullWidth, currentFile])

  const runToolbarAction = useCallback((action: () => unknown | Promise<unknown>) => {
    setOpenMenu(null)
    void action()
  }, [])

  const handleUndo = useCallback(() => {
    const view = editorViewRef.current

    if (!view || viewMode !== 'edit' || isSettingsPageOpen) {
      updateUndoAvailability(null)
      return
    }

    undo(view)
    view.focus()
    updateUndoAvailability(view)
  }, [isSettingsPageOpen, updateUndoAvailability, viewMode])

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

  const loadFile = useCallback(async (filePath: string) => {
    const requestId = ++fileLoadRequestRef.current
    const fileContent = await fileRead(filePath)

    if (requestId !== fileLoadRequestRef.current) {
      return
    }

    await setCurrentFile(filePath)

    if (requestId !== fileLoadRequestRef.current) {
      return
    }

    setContent(fileContent)
    lastSyncedContentRef.current = fileContent
    setCurrentFilePath(filePath)
    setFileError(null)
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
        await loadFile(selected)
      }
    } catch (error) {
      console.error('Failed to open file:', error)
      setFileError(`无法打开文件：${getErrorMessage(error)}`)
    }
  }, [loadFile])

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
  const handleFileSelect = useCallback(
    async (filePath: string) => {
      try {
        await loadFile(filePath)
      } catch (error) {
        console.error('Failed to open file from list:', error)
        setFileError(`无法打开文件：${getErrorMessage(error)}`)
      }
    },
    [loadFile]
  )

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

    // 所有保存入口最终都经过这里。内容未变化时不触碰磁盘，避免只切换视图、
    // 窗口失焦或关闭窗口就刷新文件时间戳并被 Git/文件监视器误判。
    if (content === lastSyncedContentRef.current) {
      return true
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

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined

    void listen<string>('system-menu-action', (event) => {
      if (disposed) {
        return
      }

      setOpenMenu(null)

      switch (event.payload) {
        case 'open-file':
          setIsSettingsPageOpen(false)
          void handleOpenFile()
          break
        case 'open-folder':
          setIsSettingsPageOpen(false)
          void handleOpenFolder()
          break
        case 'save-file':
          void handleSaveFile()
          break
        case 'export-html':
          setIsSettingsPageOpen(false)
          void handleExportHtml()
          break
        case 'export-pdf':
          setIsSettingsPageOpen(false)
          void handleExportPdf()
          break
        case 'toggle-view':
          setIsSettingsPageOpen(false)
          handleToggleViewMode()
          break
        case 'settings':
          setIsSettingsPageOpen(true)
          break
        default:
          break
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
  }, [
    handleExportHtml,
    handleExportPdf,
    handleOpenFile,
    handleOpenFolder,
    handleSaveFile,
    handleToggleViewMode,
  ])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined

    void listen<string>('open-file-requested', (event) => {
      if (disposed) {
        return
      }

      systemOpenRequestRef.current += 1
      setOpenMenu(null)
      setIsSettingsPageOpen(false)
      void loadFile(event.payload).catch((error) => {
        console.error('Failed to open file requested by the system:', error)
        setFileError(`无法打开文件：${getErrorMessage(error)}`)
      })
    }).then((unsubscribe) => {
      if (disposed) {
        unsubscribe()
        return
      }
      unlisten = unsubscribe

      void markFrontendReady().catch((error) => {
        console.error('Failed to mark frontend ready:', error)
      })
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [loadFile])

  const handleCloseWindow = useCallback(async () => {
    if (!currentFile && content.trim().length > 0) {
      const saved = await handleSaveAsFile()
      if (!saved) {
        return
      }
    } else if (currentFile && content !== lastSyncedContentRef.current) {
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
      if (currentFile && content !== lastSyncedContentRef.current) {
        e.preventDefault()
        await handleSaveFile()
      }
    }

    const handleVisibilityChange = async () => {
      if (document.hidden && currentFile && content !== lastSyncedContentRef.current) {
        await handleSaveFile()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [content, currentFile, handleSaveFile])

  // 加载当前文件 + 恢复上次文件夹
  useEffect(() => {
    const loadCurrentFile = async () => {
      const systemOpenRequest = systemOpenRequestRef.current

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

        if (path && systemOpenRequestRef.current === systemOpenRequest) {
          await loadFile(path)
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
  }, [loadFile])

  // 使用当前平台的主修饰键：Windows/Linux 为 Ctrl，macOS 为 Command。
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const hasPrimaryModifier = isMacOS ? e.metaKey : e.ctrlKey

      // 模式切换快捷键
      if (hasPrimaryModifier && e.key === '/') {
        e.preventDefault()
        e.stopPropagation()
        handleToggleViewMode()
        return
      }

      // 打开文件夹快捷键
      if (hasPrimaryModifier && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        handleOpenFolder()
        return
      }

      // 打开文件快捷键
      if (hasPrimaryModifier && !e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        handleOpenFile()
      }

      // 保存文件快捷键
      if (hasPrimaryModifier && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSaveFile()
      }
    }

    // 使用捕获阶段抢先处理 Ctrl/Command+/，避免 CodeMirror 将它解释为“注释当前行”
    // 并向文档写入 <!-- -->。
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [handleOpenFile, handleOpenFolder, handleSaveFile, handleToggleViewMode, isMacOS])

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
        setIsSettingsPageOpen(false)
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
    editorViewRef.current = null
  }, [viewMode])

  useEffect(() => {
    if (!isSettingsPageOpen) {
      return
    }

    editorViewRef.current = null
  }, [isSettingsPageOpen])

  const handleOutlineItemClick = useCallback(
    (item: OutlineItem) => {
      activeOutlineIdRef.current = item.id
      setActiveOutlineId(item.id)

      if (viewMode === 'preview') {
        const previewScroller =
          previewPanelRef.current?.querySelector<HTMLElement>('.preview-container')
        if (!previewScroller) return

        const nextScrollTop = previewScrollTopForSourceLine(previewScroller, item.line)
        if (nextScrollTop !== null) {
          previewScroller.scrollTop = nextScrollTop
        }
        return
      }

      const view = editorViewRef.current
      if (!view) return

      const lineNumber = Math.min(Math.max(item.line, 1), view.state.doc.lines)
      const lineInfo = view.state.doc.line(lineNumber)
      view.dispatch({ selection: { anchor: lineInfo.from, head: lineInfo.from } })
      view.focus()
      view.requestMeasure({
        read: () => editorScrollTopForLine(view.scrollDOM, view, lineNumber),
        write: (scrollTop) => {
          view.scrollDOM.scrollTop = scrollTop
        },
      })
    },
    [viewMode]
  )

  useEffect(() => {
    const line = pendingViewScrollLineRef.current
    if (line === null) return

    const frame = window.requestAnimationFrame(() => {
      if (viewMode === 'preview') {
        const previewScroller =
          previewPanelRef.current?.querySelector<HTMLElement>('.preview-container')
        if (!previewScroller) return

        const exactScrollTop = previewScrollTopForSourceLine(previewScroller, line)
        const anchors = exactScrollTop === null ? collectPreviewAnchors(previewScroller) : []
        const nextScrollTop =
          exactScrollTop ??
          (anchors.length > 0 ? previewScrollTopForLine(anchors, line, previewScroller) : null)
        if (nextScrollTop !== null) {
          previewScroller.scrollTop = nextScrollTop
          pendingViewScrollLineRef.current = null
        }
        return
      }

      const view = editorViewRef.current
      if (!view) return

      view.requestMeasure({
        read: () => editorScrollTopForLine(view.scrollDOM, view, line),
        write: (scrollTop) => {
          view.scrollDOM.scrollTop = scrollTop
          pendingViewScrollLineRef.current = null
        },
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [viewMode])

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

  // 根据当前单栏视图的滚动位置更新大纲高亮。
  useEffect(() => {
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

  const isUndoDisabled = isSettingsPageOpen || viewMode !== 'edit' || !canUndo
  const toggleViewShortcut = getShortcutLabel(isMacOS, '/')
  const toggleViewLabel = viewMode === 'edit' ? '切换到预览' : '切换到编辑'

  return (
    <div className="app-container">
      <header
        className={`app-header ${isMacOS ? 'platform-macos' : 'platform-windows'}`}
        ref={headerActionsRef}
        onPointerDown={handleDragWindow}
      >
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
                title={`打开文件 (${openFileShortcut})`}
                role="menuitem"
              >
                打开文件
              </button>
              <button
                type="button"
                className="menu-item"
                onClick={() => runToolbarAction(handleOpenFolder)}
                title={`打开文件夹 (${openFolderShortcut})`}
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
            className={`menu-trigger settings-trigger ${isSettingsPageOpen ? 'active' : ''}`}
            onClick={() => {
              setOpenMenu(null)
              setIsSettingsPageOpen((isOpen) => !isOpen)
            }}
            title="设置"
            aria-label="设置"
            aria-pressed={isSettingsPageOpen}
          >
            设置
          </button>

          <button
            type="button"
            className="undo-button"
            onClick={handleUndo}
            disabled={isUndoDisabled}
            title={`撤销上一步 (${undoShortcut})`}
            aria-label="撤销"
          >
            <UndoIcon />
          </button>
        </nav>

        <div className="header-actions" aria-label="文档工具栏">
          {saveStatus === 'saved' && <span className="save-status">✓ 已自动保存</span>}
          {!isMacOS && (
            <WindowControls
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
        {isSettingsPageOpen ? (
          <SettingsPage
            fullWidth={isEditorFullWidth}
            isMacOS={isMacOS}
            updateStatus={updateStatus}
            onClose={() => setIsSettingsPageOpen(false)}
            onWidthChange={setIsEditorFullWidth}
            onOpenRepository={() => void openUrl(REPOSITORY_URL)}
            onCheckForUpdates={() => void handleCheckForUpdates()}
            onInstallUpdate={() => void handleInstallUpdate()}
          />
        ) : (
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
                <button
                  type="button"
                  className="view-mode-switch"
                  onClick={handleToggleViewMode}
                  aria-label={toggleViewLabel}
                  title={`${toggleViewLabel} (${toggleViewShortcut})`}
                >
                  <span>{viewMode === 'edit' ? '预览' : '编辑'}</span>
                  <kbd>{toggleViewShortcut}</kbd>
                </button>
                {viewMode === 'edit' && (
                  <div ref={editorPanelRef} className="editor-panel">
                    <Editor
                      value={content}
                      onChange={setContent}
                      wysiwyg={false}
                      currentFile={currentFile}
                      className={isEditorFullWidth ? 'full-width-editor' : ''}
                      onReady={(view) => {
                        editorViewRef.current = view
                        updateUndoAvailability(view)
                      }}
                      onUpdate={updateUndoAvailability}
                    />
                  </div>
                )}
                {viewMode === 'preview' && (
                  <div ref={previewPanelRef} className="preview-panel">
                    <Preview
                      content={content}
                      currentFile={currentFile}
                      className={isEditorFullWidth ? 'full-width-preview' : ''}
                    />
                  </div>
                )}
              </div>
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
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
