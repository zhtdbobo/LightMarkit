import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Outline } from './Outline'

const items = [
  { id: 'intro', text: '简介', level: 1, line: 1 },
  { id: 'install', text: '安装', level: 2, line: 3 },
  { id: 'windows', text: 'Windows', level: 3, line: 5 },
  { id: 'usage', text: '使用', level: 2, line: 8 },
  { id: 'appendix', text: '附录', level: 1, line: 12 },
]

describe('Outline', () => {
  it('折叠标题时隐藏其全部后代，并保留下一个同级标题', async () => {
    const user = userEvent.setup()
    render(<Outline items={items} />)

    await user.click(screen.getByRole('button', { name: '折叠“简介”' }))

    expect(screen.queryByRole('button', { name: '安装' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Windows' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '使用' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '附录' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开“简介”' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  it('可以只折叠一个嵌套分支并再次展开', async () => {
    const user = userEvent.setup()
    render(<Outline items={items} />)

    await user.click(screen.getByRole('button', { name: '折叠“安装”' }))
    expect(screen.queryByRole('button', { name: 'Windows' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '使用' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '展开“安装”' }))
    expect(screen.getByRole('button', { name: 'Windows' })).toBeInTheDocument()
  })

  it('点击标题仍会触发跳转回调', async () => {
    const user = userEvent.setup()
    const onItemClick = vi.fn()
    render(<Outline items={items} onItemClick={onItemClick} />)

    await user.click(screen.getByRole('button', { name: '使用' }))

    expect(onItemClick).toHaveBeenCalledWith(items[3])
  })
})
