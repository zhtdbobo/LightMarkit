import { useState } from 'react'
import Editor from './components/Editor'
import './App.css'

function App() {
  const [content, setContent] = useState('# Welcome to LightMarkit\n\n开始编辑你的 Markdown 文档...\n\n## 特性\n\n- 实时语法高亮\n- Markdown 支持\n- 自动保存\n\n**粗体文本** 和 *斜体文本*\n\n```javascript\nconst hello = "world";\n```')

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>LightMarkit</h1>
        <p className="subtitle">轻量级 Markdown 编辑器</p>
      </header>
      <main className="app-main">
        <Editor
          value={content}
          onChange={setContent}
        />
      </main>
    </div>
  )
}

export default App
