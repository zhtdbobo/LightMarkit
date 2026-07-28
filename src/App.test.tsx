import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { open, save } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { getCurrentWindow } from '@tauri-apps/api/window'
import App from './App'
import { scanFolder } from './utils/folderApi'
import { fileRead, getCurrentFile } from './utils/fileApi'
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
    vi.mocked(open).mockResolvedValue(null)
    vi.mocked(save).mockResolvedValue(null)
    vi.mocked(scanFolder).mockResolvedValue([])
    vi.mocked(getCurrentFile).mockResolvedValue(null)
    vi.mocked(fileRead).mockResolvedValue('')
    vi.mocked(check).mockResolvedValue(null)
    vi.mocked(relaunch).mockResolvedValue(undefined)
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

  it('应该渲染视图模式切换按钮', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '分屏' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '预览' })).toBeInTheDocument()
  })

  it('应该按分类渲染顶部工具栏', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: '文件' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关于' })).toBeInTheDocument()
    expect(screen.queryByText('视图')).not.toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: '关于' }))

    expect(screen.getByRole('dialog', { name: 'LightMarkit' })).toBeVisible()
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

  it('macOS 应该在标题栏左侧按原生顺序渲染窗口控制按钮', () => {
    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
    })

    render(<App />)

    const controls = screen.getByRole('group', { name: '窗口控制' })
    expect(controls).toHaveClass('macos')
    expect(controls.parentElement?.firstElementChild).toBe(controls)
    expect(
      Array.from(controls.querySelectorAll('button'), (button) => button.getAttribute('aria-label'))
    ).toEqual(['关闭', '最小化', '缩放'])
    expect(screen.queryByRole('button', { name: '最大化' })).not.toBeInTheDocument()
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

  it('应该默认为分屏模式', () => {
    render(<App />)
    const splitButton = screen.getByRole('button', { name: '分屏' })
    expect(splitButton).toHaveClass('active')
  })

  it('应该在分屏模式下同时显示编辑器和预览', () => {
    render(<App />)
    expect(screen.getByTestId('editor-container')).toBeInTheDocument()
    expect(screen.getByTestId('preview-container')).toBeInTheDocument()
  })

  it('应该点击按钮切换到编辑模式', () => {
    render(<App />)
    const editButton = screen.getByRole('button', { name: '编辑' })
    fireEvent.click(editButton)

    expect(editButton).toHaveClass('active')
    expect(screen.getByTestId('editor-container')).toBeInTheDocument()
    expect(screen.queryByTestId('preview-container')).not.toBeInTheDocument()
  })

  it('应该点击按钮切换到预览模式', () => {
    render(<App />)
    const previewButton = screen.getByRole('button', { name: '预览' })
    fireEvent.click(previewButton)

    expect(previewButton).toHaveClass('active')
    expect(screen.queryByTestId('editor-container')).not.toBeInTheDocument()
    expect(screen.getByTestId('preview-container')).toBeInTheDocument()
  })

  it('应该在分屏模式下渲染分割条', () => {
    render(<App />)
    expect(screen.getByTestId('resizer')).toBeInTheDocument()
  })

  it('应该在编辑模式下不渲染分割条', () => {
    render(<App />)
    const editButton = screen.getByRole('button', { name: '编辑' })
    fireEvent.click(editButton)

    expect(screen.queryByTestId('resizer')).not.toBeInTheDocument()
  })

  it('应该在预览模式下不渲染分割条', () => {
    render(<App />)
    const previewButton = screen.getByRole('button', { name: '预览' })
    fireEvent.click(previewButton)

    expect(screen.queryByTestId('resizer')).not.toBeInTheDocument()
  })

  it('应该通过 Ctrl+/ 切换视图模式', () => {
    render(<App />)

    // 初始为分屏模式
    expect(screen.getByRole('button', { name: '分屏' })).toHaveClass('active')

    // 第一次按 Ctrl+/ 切换到预览模式
    fireEvent.keyDown(window, { key: '/', ctrlKey: true })
    expect(screen.getByRole('button', { name: '预览' })).toHaveClass('active')

    // 第二次按 Ctrl+/ 切换到编辑模式
    fireEvent.keyDown(window, { key: '/', ctrlKey: true })
    expect(screen.getByRole('button', { name: '编辑' })).toHaveClass('active')

    // 第三次按 Ctrl+/ 回到分屏模式
    fireEvent.keyDown(window, { key: '/', ctrlKey: true })
    expect(screen.getByRole('button', { name: '分屏' })).toHaveClass('active')
  })
})
