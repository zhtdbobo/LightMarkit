import { invoke } from '@tauri-apps/api/core'

export async function readImageAsDataUrl(path: string): Promise<string> {
  return await invoke<string>('read_image_as_data_url', { path })
}
