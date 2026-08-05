import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { open, save } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import App from './App'
import { scanFolder } from './utils/folderApi'
import { fileRead, fileWrite, getCurrentFile, markFrontendReady } from './utils/fileApi'
import packageInfo from '../package.json'

// Mock Tauri APIs
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    startDragging: vi.fn(),
    onCloseRequested: vi.fn().mockResolvedValue(vi.fn()),
  })),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}))

vi.mock('./utils/fileApi', () => ({
  fileRead: vi.fn(),
  fileWrite: vi.fn(),
  getCurrentFile: vi.fn().mockResolvedValue(null),
  markFrontendReady: vi.fn().mockResolvedValue(undefined),
  setCurrentFile: vi.fn(),
  watchCurrentFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./utils/exportApi', () => ({
  exportHtml: vi.fn(),
  exportPdf: vi.fn(),
}))

vi.mock('./utils/folderApi', () => ({
  scanFolder: vi.fn(),
}))

describe('App', () => {
  const mockWindow = {
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    startDragging: vi.fn(),
    onCloseRequested: vi.fn().mockResolvedValue(vi.fn()),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(open).mockResolvedValue(null)
    vi.mocked(save).mockResolvedValue(null)
    vi.mocked(scanFolder).mockResolvedValue([])
    vi.mocked(getCurrentFile).mockResolvedValue(null)
    vi.mocked(markFrontendReady).mockResolvedValue(undefined)
    vi.mocked(fileRead).mockResolvedValue('')
    vi.mocked(check).mockResolvedValue(null)
    vi.mocked(relaunch).mockResolvedValue(undefined)
    vi.mocked(listen).mockResolvedValue(vi.fn())
    vi.mocked(getCurrentWindow).mockReturnValue(
      mockWindow as unknown as ReturnType<typeof getCurrentWindow>
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('不应该在顶部栏渲染应用标题', () => {
    render(<App />)
    expect(screen.queryByRole('heading', { name: 'LightMarkit' })).not.toBeInTheDocument()
  })

  it('不应该在顶部栏渲染应用副标题', () => {
    render(<App />)
    expect(screen.queryByText('轻量级 Markdown 编辑器')).not.toBeInTheDocument()
  })

  it('应该渲染编辑器组件', () => {
    render(<App />)
    expect(screen.getByTestId('editor-container')).toBeInTheDocument()
  })

  it('应该默认打开空白文档', () => {
    render(<App />)
    const container = screen.getByTestId('editor-container')
    expect(container.textContent).not.toContain('Welcome to LightMarkit')
  })

  it('应该在启动时加载当前文件内容', async () => {
    vi.mocked(getCurrentFile).mockResolvedValue('C:\\notes\\from-shell.md')
    vi.mocked(fileRead).mockResolvedValue('# From Shell')

    render(<App />)

    await waitFor(() => {
      expect(fileRead).toHaveBeenCalledWith('C:\\notes\\from-shell.md')
      expect(screen.getByTestId('editor-container').textContent).toContain('From Shell')
    })
  })

  it('打开文件失败时应该显示错误提示', async () => {
    vi.mocked(open).mockResolvedValue('C:\\notes\\legacy.md')
    vi.mocked(fileRead).mockRejectedValueOnce('Failed to decode UTF-8 file')

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '文件' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '打开文件' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('无法打开文件')
    expect(alert).toHaveTextContent('Failed to decode UTF-8 file')
  })

  it('应该移除顶部视图模式切换按钮', () => {
    render(<App />)
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '预览' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '分屏' })).not.toBeInTheDocument()
  })

  it('应该通过独立设置页在铺满和默认阅读宽度之间切换', () => {
    render(<App />)

    expect(screen.getByTestId('editor-container')).toHaveClass('full-width-editor')
    fireEvent.click(screen.getByRole('button', { name: '设置' }))

    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument()
    expect(screen.queryByTestId('editor-container')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '编辑' })).toHaveAttribute('aria-current', 'page')
    expect(
      screen.getByRole('button', { name: '关闭设置' }).closest('.settings-detail')
    ).not.toBeNull()
    expect(screen.queryByRole('heading', { name: '关于 LightMarkit' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /铺满/ })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: /默认阅读宽度/ }))
    fireEvent.click(screen.getByRole('button', { name: '关闭设置' }))

    expect(screen.getByTestId('editor-container')).not.toHaveClass('full-width-editor')
    fireEvent.keyDown(window, { key: '/', ctrlKey: true })
    expect(screen.getByTestId('preview-container')).not.toHaveClass('full-width-preview')
    fireEvent.keyDown(window, { key: '/', ctrlKey: true })

    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    fireEvent.click(screen.getByRole('radio', { name: /铺满/ }))
    fireEvent.click(screen.getByRole('button', { name: '关闭设置' }))

    expect(screen.getByTestId('editor-container')).toHaveClass('full-width-editor')
    fireEvent.keyDown(window, { key: '/', ctrlKey: true })
    expect(screen.getByTestId('preview-container')).toHaveClass('full-width-preview')
  })

  it('应该忽略旧版宽度字段并默认使用铺满模式', () => {
    localStorage.setItem('lightmarkit.app-state.v1', JSON.stringify({ isEditorFullWidth: false }))

    render(<App />)

    expect(screen.getByTestId('editor-container')).toHaveClass('full-width-editor')
  })

  it('应该始终显示大纲且不再提供显隐按钮', () => {
    render(<App />)

    expect(screen.getByLabelText('文档大纲为空')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '隐藏大纲' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '显示大纲' })).not.toBeInTheDocument()
  })

  it('应该按分类渲染顶部工具栏', () => {
    render(<App />)
    const menuBar = screen.getByLabelText('应用菜单')
    const fileButton = screen.getByRole('button', { name: '文件' })
    const exportButton = screen.getByRole('button', { name: '导出' })
    const settingsButton = screen.getByRole('button', { name: '设置' })
    const undoButton = screen.getByRole('button', { name: '撤销' })

    expect(Array.from(menuBar.children)).toEqual([
      fileButton.closest('.toolbar-menu'),
      exportButton.closest('.toolbar-menu'),
      settingsButton,
      undoButton,
    ])
    expect(settingsButton).toHaveTextContent('设置')
    expect(screen.queryByRole('button', { name: '关于' })).not.toBeInTheDocument()
    expect(screen.queryByText('视图')).not.toBeInTheDocument()
  })

  it('应该在设置右边提供逐步撤销按钮', async () => {
    const user = userEvent.setup()
    render(<App />)

    const undoButton = screen.getByRole('button', { name: '撤销' })
    const settingsButton = screen.getByRole('button', { name: '设置' })
    const menuBar = screen.getByLabelText('应用菜单')
    expect(settingsButton.nextElementSibling).toBe(undoButton)
    expect(undoButton.parentElement).toBe(menuBar)
    expect(undoButton).toBeDisabled()

    const editorElement = screen
      .getByTestId('editor-container')
      .querySelector('.cm-content') as HTMLElement
    await user.click(editorElement)
    await user.keyboard('abc')

    await waitFor(() => {
      expect(undoButton).toBeEnabled()
    })

    await user.click(undoButton)

    await waitFor(() => {
      expect(screen.getByTestId('editor-container')).not.toHaveTextContent('abc')
      expect(undoButton).toBeDisabled()
    })
  })

  it('应该通过 Tauri Updater 检查、下载并安装新版本', async () => {
    const [major, minor, patch] = packageInfo.version.split('.').map(Number)
    const latestVersion = `${major}.${minor}.${patch + 1}`
    const downloadAndInstall = vi.fn(async (onEvent?: (event: DownloadEvent) => void) => {
      onEvent?.({ event: 'Started', data: { contentLength: 100 } })
      onEvent?.({ event: 'Progress', data: { chunkLength: 50 } })
      onEvent?.({ event: 'Progress', data: { chunkLength: 50 } })
      onEvent?.({ event: 'Finished' })
    })
    vi.mocked(check).mockResolvedValue({
      version: latestVersion,
      downloadAndInstall,
      close: vi.fn(),
    } as unknown as Update)
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    fireEvent.click(screen.getByRole('button', { name: '关于' }))

    expect(screen.getByRole('heading', { name: '设置' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '关于 LightMarkit' })).toBeVisible()
    expect(screen.getByText(`版本 ${packageInfo.version}`)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '专注写作' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '轻巧高效' })).toBeInTheDocument()
    expect(screen.getByText('MIT License')).toBeInTheDocument()
    expect(screen.getByText('软件更新')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'GitHub' }))
    expect(openUrl).toHaveBeenCalledWith('https://github.com/zhtdbobo/LightMarkit')

    fireEvent.click(screen.getByRole('button', { name: '检查更新' }))

    expect(await screen.findByText(`发现新版本 v${latestVersion}`)).toBeInTheDocument()
    expect(check).toHaveBeenCalledWith({ timeout: 30_000 })

    fireEvent.click(screen.getByRole('button', { name: '下载并安装' }))

    await waitFor(() => expect(downloadAndInstall).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByText(`下载完成，正在验证签名并安装 v${latestVersion}…`)
    ).toBeInTheDocument()
    expect(relaunch).toHaveBeenCalledTimes(1)
  })

  it('当前版本最新时应该显示提示且不提供下载按钮', async () => {
    vi.mocked(check).mockResolvedValue(null)
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    fireEvent.click(screen.getByRole('button', { name: '关于' }))
    fireEvent.click(screen.getByRole('button', { name: '检查更新' }))

    expect(await screen.findByText(`当前已是最新版本 v${packageInfo.version}`)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下载并安装' })).not.toBeInTheDocument()
  })

  it('更新签名验证失败时应该停止并显示错误', async () => {
    const downloadAndInstall = vi.fn().mockRejectedValue(new Error('Signature verification failed'))
    vi.mocked(check).mockResolvedValue({
      version: '99.0.0',
      downloadAndInstall,
      close: vi.fn(),
    } as unknown as Update)
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    fireEvent.click(screen.getByRole('button', { name: '关于' }))
    fireEvent.click(screen.getByRole('button', { name: '检查更新' }))
    fireEvent.click(await screen.findByRole('button', { name: '下载并安装' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('更新签名验证失败，已停止安装。')
    expect(relaunch).not.toHaveBeenCalled()
  })

  it('应该渲染自定义窗口控制按钮', () => {
    render(<App />)
    expect(screen.getByRole('group', { name: '窗口控制' })).toHaveClass('windows')
    expect(screen.getByRole('button', { name: '最小化' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最大化' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument()
  })

  it('macOS 应该交给系统标题栏渲染原生窗口控制按钮', () => {
    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
    })

    render(<App />)

    expect(screen.queryByRole('group', { name: '窗口控制' })).not.toBeInTheDocument()
    expect(document.querySelector('.app-header')).toHaveClass('platform-macos')
    fireEvent.click(screen.getByRole('button', { name: '文件' }))
    expect(screen.getByRole('menuitem', { name: '打开文件' })).toHaveAttribute(
      'title',
      '打开文件 (⌘O)'
    )
    expect(screen.getByRole('button', { name: '撤销' })).toHaveAttribute('title', '撤销上一步 (⌘Z)')
    expect(screen.getByRole('button', { name: '切换到预览' })).toHaveAttribute(
      'title',
      '切换到预览 (⌘/)'
    )

    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(
      screen.getByRole('button', { name: '关闭设置' }).closest('.settings-sidebar')
    ).not.toBeNull()
  })

  it('macOS 应该使用 Command 触发应用级快捷键', () => {
    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
    })

    render(<App />)

    fireEvent.keyDown(window, { key: '/', metaKey: true })
    expect(screen.getByTestId('preview-container')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'o', metaKey: true })
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ multiple: false }))

    fireEvent.keyDown(window, { key: 'o', metaKey: true, shiftKey: true })
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ directory: true }))

    fireEvent.keyDown(window, { key: 's', metaKey: true })
    expect(save).toHaveBeenCalled()
  })

  it('应该响应系统菜单和托盘发出的应用操作', async () => {
    let systemMenuHandler: ((event: { payload: string }) => void) | undefined
    vi.mocked(listen).mockImplementation(async (event, handler) => {
      if (event === 'system-menu-action') {
        systemMenuHandler = handler as unknown as typeof systemMenuHandler
      }
      return vi.fn()
    })

    render(<App />)

    await waitFor(() => expect(systemMenuHandler).toBeDefined())
    systemMenuHandler?.({ payload: 'settings' })

    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument()

    systemMenuHandler?.({ payload: 'open-file' })
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith(expect.objectContaining({ multiple: false }))
    })
  })

  it('应该打开 macOS 访达发送的文件', async () => {
    let openFileHandler: ((event: { payload: string }) => void) | undefined
    vi.mocked(listen).mockImplementation(async (event, handler) => {
      if (event === 'open-file-requested') {
        openFileHandler = handler as unknown as typeof openFileHandler
      }
      return vi.fn()
    })
    vi.mocked(fileRead).mockResolvedValue('# From Finder')

    render(<App />)

    await waitFor(() => expect(openFileHandler).toBeDefined())
    openFileHandler?.({ payload: '/Users/test/Documents/from-finder.md' })

    await waitFor(() => {
      expect(fileRead).toHaveBeenCalledWith('/Users/test/Documents/from-finder.md')
      expect(screen.getByTestId('editor-container')).toHaveTextContent('From Finder')
    })
  })

  it('应该调用 Tauri 窗口控制 API', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '最小化' }))
    expect(mockWindow.minimize).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '最大化' }))
    expect(mockWindow.toggleMaximize).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(mockWindow.destroy).toHaveBeenCalledTimes(1)
  })

  it('应该展开文件菜单显示文件操作', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '文件' }))

    expect(screen.getByRole('menuitem', { name: '打开文件' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: '打开文件夹' })).toBeVisible()
    expect(screen.queryByRole('menuitem', { name: '保存' })).not.toBeInTheDocument()
  })

  it('应该展开导出菜单显示导出操作', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '导出' }))

    expect(screen.getByRole('menuitem', { name: '导出 HTML' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: '导出 PDF' })).toBeVisible()
    expect(screen.queryByRole('menuitem', { name: '导出 Markdown' })).not.toBeInTheDocument()
  })

  it('应该为导出保存框提供默认文件名', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '导出' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '导出 HTML' }))
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultPath: 'LightMarkit Document.html' })
    )

    fireEvent.click(screen.getByRole('button', { name: '导出' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '导出 PDF' }))
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultPath: 'LightMarkit Document.pdf' })
    )
  })

  it('临时文件 Ctrl+S 应该为保存框提供默认 Markdown 文件名', async () => {
    render(<App />)

    fireEvent.keyDown(window, { key: 's', ctrlKey: true })

    await waitFor(() => {
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ defaultPath: 'LightMarkit Document.md' })
      )
    })
  })

  it('应该保留多次打开的文件夹并显示文件夹名称', async () => {
    vi.mocked(open).mockResolvedValueOnce('C:\\notes\\方案').mockResolvedValueOnce('D:\\work\\归档')
    vi.mocked(scanFolder).mockImplementation(async (folderPath) => {
      if (folderPath === 'C:\\notes\\方案') {
        return [
          {
            name: '升级技术方案.md',
            path: 'C:\\notes\\方案\\升级技术方案.md',
            is_dir: false,
          },
        ]
      }

      return [
        {
          name: '会议记录.md',
          path: 'D:\\work\\归档\\会议记录.md',
          is_dir: false,
        },
      ]
    })

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '文件' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '打开文件夹' }))

    await waitFor(() => {
      expect(screen.getByText('方案')).toBeInTheDocument()
      expect(screen.getByText('升级技术方案.md')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '文件' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '打开文件夹' }))

    await waitFor(() => {
      expect(screen.getByText('方案')).toBeInTheDocument()
      expect(screen.getByText('归档')).toBeInTheDocument()
      expect(screen.getByText('会议记录.md')).toBeInTheDocument()
    })
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ directory: true, multiple: true }))
  })

  it('应该默认为纯 Markdown 源码编辑模式', () => {
    render(<App />)
    expect(screen.getByTestId('editor-container')).toHaveClass('source-editor')
    expect(screen.getByTestId('editor-container')).not.toHaveClass('wysiwyg-editor')
    expect(screen.queryByTestId('preview-container')).not.toBeInTheDocument()
  })

  it('应该在内容区提供带快捷键提示的编辑预览切换入口', () => {
    render(<App />)

    const previewButton = screen.getByRole('button', { name: '切换到预览' })
    expect(previewButton).toHaveTextContent('预览')
    expect(previewButton).toHaveTextContent('Ctrl+/')

    fireEvent.click(previewButton)

    expect(screen.getByTestId('preview-container')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '切换到编辑' })).toHaveTextContent('Ctrl+/')
  })

  it('应该只使用单栏并且不渲染分割条', () => {
    render(<App />)
    expect(screen.queryByTestId('resizer')).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: '/', ctrlKey: true })
    expect(screen.queryByTestId('resizer')).not.toBeInTheDocument()
  })

  it('应该通过 Ctrl+/ 切换视图模式', () => {
    render(<App />)

    // 初始为源码编辑模式
    expect(screen.getByTestId('editor-container')).toBeInTheDocument()
    expect(screen.queryByTestId('preview-container')).not.toBeInTheDocument()

    // 第一次按 Ctrl+/ 切换到预览模式
    fireEvent.keyDown(window, { key: '/', ctrlKey: true })
    expect(screen.queryByTestId('editor-container')).not.toBeInTheDocument()
    expect(screen.getByTestId('preview-container')).toBeInTheDocument()

    // 第二次按 Ctrl+/ 回到源码编辑模式
    fireEvent.keyDown(window, { key: '/', ctrlKey: true })
    expect(screen.getByTestId('editor-container')).toBeInTheDocument()
    expect(screen.queryByTestId('preview-container')).not.toBeInTheDocument()
  })

  it('编辑器聚焦时切换预览不应该插入 HTML 注释或重写文件', async () => {
    vi.mocked(getCurrentFile).mockResolvedValue('C:\\notes\\unchanged.md')
    vi.mocked(fileRead).mockResolvedValue('# 未修改')
    render(<App />)

    await waitFor(() => expect(screen.getByText('未修改')).toBeInTheDocument())
    vi.mocked(fileWrite).mockClear()

    const editorContent = screen
      .getByTestId('editor-container')
      .querySelector<HTMLElement>('.cm-content')
    expect(editorContent).not.toBeNull()

    fireEvent.keyDown(editorContent as HTMLElement, { key: '/', ctrlKey: true })
    expect(screen.getByTestId('preview-container')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: '/', ctrlKey: true })
    expect(screen.getByTestId('editor-container')).toBeInTheDocument()
    expect(screen.getByTestId('editor-container')).not.toHaveTextContent('<!--')
    expect(screen.getByTestId('editor-container')).not.toHaveTextContent('-->')

    await new Promise((resolve) => window.setTimeout(resolve, 550))
    expect(fileWrite).not.toHaveBeenCalled()
  })

  it('显式保存未修改的文件时也不应该触碰磁盘', async () => {
    vi.mocked(getCurrentFile).mockResolvedValue('C:\\notes\\unchanged.md')
    vi.mocked(fileRead).mockResolvedValue('# 未修改')
    render(<App />)

    await waitFor(() => expect(screen.getByText('未修改')).toBeInTheDocument())
    vi.mocked(fileWrite).mockClear()
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })

    await waitFor(() => expect(fileWrite).not.toHaveBeenCalled())
  })

  it('预览模式点击大纲时应该把对应标题精确滚动到顶部', async () => {
    vi.mocked(getCurrentFile).mockResolvedValue('C:\\notes\\outline.md')
    vi.mocked(fileRead).mockResolvedValue('# 第一节\n\n正文\n\n## 第二节\n\n更多正文')
    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: '第二节' })).toBeInTheDocument())
    fireEvent.keyDown(window, { key: '/', ctrlKey: true })

    const scroller = await screen.findByTestId('preview-container')
    const heading = scroller.querySelector<HTMLElement>('h2[data-source-line="5"]')
    expect(heading).not.toBeNull()

    scroller.scrollTop = 120
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({
      top: 40,
      bottom: 640,
      left: 0,
      right: 800,
      width: 800,
      height: 600,
      x: 0,
      y: 40,
      toJSON: () => ({}),
    } as DOMRect)
    vi.spyOn(heading as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      top: 310,
      bottom: 350,
      left: 0,
      right: 600,
      width: 600,
      height: 40,
      x: 0,
      y: 310,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.click(screen.getByRole('button', { name: '第二节' }))

    expect(scroller.scrollTop).toBe(390)
  })
})
