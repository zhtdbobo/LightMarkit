import { invoke } from '@tauri-apps/api/core'

/**
 * 导出 HTML 文件
 * @param filePath 导出路径
 * @param htmlContent HTML 内容（不包含完整的 HTML 文档结构）
 * @param title 文档标题
 */
export async function exportHtml(
  filePath: string,
  htmlContent: string,
  title: string
): Promise<void> {
  return await invoke<void>('export_html', { filePath, htmlContent, title })
}

/**
 * 导出 PDF 文件
 * @param filePath 导出路径
 * @param htmlContent HTML 内容（不包含完整的 HTML 文档结构）
 * @param title 文档标题
 */
export async function exportPdf(
  filePath: string,
  htmlContent: string,
  title: string
): Promise<void> {
  return await invoke<void>('export_pdf', { filePath, htmlContent, title })
}
