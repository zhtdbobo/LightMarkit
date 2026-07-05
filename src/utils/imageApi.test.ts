import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { readImageAsDataUrl } from './imageApi'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('imageApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该调用 read_image_as_data_url 命令读取本地图片', async () => {
    vi.mocked(invoke).mockResolvedValue('data:image/png;base64,abc')

    const result = await readImageAsDataUrl('C:\\Users\\Lenovo\\image.png')

    expect(invoke).toHaveBeenCalledWith('read_image_as_data_url', {
      path: 'C:\\Users\\Lenovo\\image.png',
    })
    expect(result).toBe('data:image/png;base64,abc')
  })
})
