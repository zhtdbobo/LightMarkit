import { invoke } from '@tauri-apps/api/core'

/**
 * 读取文件内容
 * @param path 文件路径
 * @returns 文件内容
 */
export async function fileRead(path: string): Promise<string> {
  return await invoke<string>('file_read', { path })
}

/**
 * 写入文件内容（原子写入）
 * @param path 文件路径
 * @param content 文件内容
 */
export async function fileWrite(path: string, content: string): Promise<void> {
  await invoke('file_write', { path, content })
}

/**
 * 获取当前打开的文件路径
 * @returns 当前文件路径，如果没有打开文件则返回 null
 */
export async function getCurrentFile(): Promise<string | null> {
  return await invoke<string | null>('get_current_file')
}

/**
 * 设置当前打开的文件路径
 * @param path 文件路径，传 null 表示关闭当前文件
 */
export async function setCurrentFile(path: string | null): Promise<void> {
  await invoke('set_current_file', { path })
}
