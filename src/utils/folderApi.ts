import { invoke } from '@tauri-apps/api/core'

// 文件信息接口
export interface FileInfo {
  name: string
  path: string
  is_dir: boolean
  children?: FileInfo[]
}

/**
 * 扫描文件夹中的所有 Markdown 文件
 * @param folderPath 文件夹路径
 * @returns 文件信息列表
 */
export async function scanFolder(folderPath: string): Promise<FileInfo[]> {
  return await invoke<FileInfo[]>('scan_folder', { folderPath })
}
