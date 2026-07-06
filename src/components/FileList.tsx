import { useState } from 'react'
import type { FileInfo } from '../utils/folderApi'
import './FileList.css'

interface FileListProps {
  folders: FolderGroup[]
  currentFile: string | null
  onFileSelect: (filePath: string) => void
  onFolderClose?: (folderPath: string) => void
}

export interface FolderGroup {
  name: string
  path: string
  files: FileInfo[]
}

interface FileItemProps {
  file: FileInfo
  currentFile: string | null
  onFileSelect: (filePath: string) => void
  level: number
}

function FileItem({ file, currentFile, onFileSelect, level }: FileItemProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const handleClick = () => {
    if (file.is_dir) {
      setIsExpanded(!isExpanded)
    } else {
      onFileSelect(file.path)
    }
  }

  const isActive = currentFile === file.path

  return (
    <div className="file-item">
      <div
        className={`file-item-header ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: `${8 + level * 8}px` }}
        onClick={handleClick}
        title={file.path}
      >
        <span
          className={`file-icon ${file.is_dir ? 'folder' : 'document'} ${
            file.is_dir && isExpanded ? 'expanded' : ''
          }`}
          aria-hidden="true"
        />
        <span className="file-name">{file.name}</span>
      </div>
      {file.is_dir && isExpanded && file.children && (
        <div className="file-children">
          {file.children.map((child) => (
            <FileItem
              key={child.path}
              file={child}
              currentFile={currentFile}
              onFileSelect={onFileSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface FolderItemProps {
  folder: FolderGroup
  currentFile: string | null
  onFileSelect: (filePath: string) => void
  onFolderClose?: (folderPath: string) => void
}

function FolderItem({ folder, currentFile, onFileSelect, onFolderClose }: FolderItemProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="folder-section">
      <div
        className="file-item-header folder-root"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        title={folder.path}
      >
        <span className={`file-icon folder ${isExpanded ? 'expanded' : ''}`} aria-hidden="true" />
        <span className="file-name">{folder.name}</span>
        {onFolderClose && (
          <button
            type="button"
            className="folder-close-button"
            onClick={(event) => {
              event.stopPropagation()
              onFolderClose(folder.path)
            }}
            title="关闭文件夹"
            aria-label={`关闭文件夹 ${folder.name}`}
          >
            x
          </button>
        )}
      </div>
      {isExpanded && (
        <div className="file-children">
          {folder.files.length > 0 ? (
            folder.files.map((file) => (
              <FileItem
                key={file.path}
                file={file}
                currentFile={currentFile}
                onFileSelect={onFileSelect}
                level={1}
              />
            ))
          ) : (
            <div className="folder-empty">没有 Markdown 文件</div>
          )}
        </div>
      )}
    </div>
  )
}

export function FileList({ folders, currentFile, onFileSelect, onFolderClose }: FileListProps) {
  if (folders.length === 0) {
    return (
      <div className="file-list-empty">
        <p>没有找到 Markdown 文件</p>
        <p className="hint">使用“打开文件夹”选择一个文件夹</p>
      </div>
    )
  }

  return (
    <div className="file-list" data-testid="file-list">
      {folders.map((folder) => (
        <FolderItem
          key={folder.path}
          folder={folder}
          currentFile={currentFile}
          onFileSelect={onFileSelect}
          onFolderClose={onFolderClose}
        />
      ))}
    </div>
  )
}
