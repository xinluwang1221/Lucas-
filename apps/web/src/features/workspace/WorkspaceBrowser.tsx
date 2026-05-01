import { ChevronDown, FileText, Folder, FolderOpen, Plus, Search } from 'lucide-react'
import type { WorkspaceFile, WorkspaceTree, WorkspaceTreeEntry } from '../../lib/api'

export function WorkspaceBrowser({
  tree,
  fallbackFiles,
  currentPath,
  query,
  onQueryChange,
  onOpenFolder,
  onUseFile,
  onPreviewFile,
  onRevealFile
}: {
  tree: WorkspaceTree | null
  fallbackFiles: WorkspaceFile[]
  currentPath: string
  query: string
  onQueryChange: (query: string) => void
  onOpenFolder: (path: string) => void
  onUseFile: (file: WorkspaceFile) => void
  onPreviewFile: (file: WorkspaceFile) => void
  onRevealFile: (file: WorkspaceFile) => void
}) {
  const entries: WorkspaceTreeEntry[] = tree?.entries ?? fallbackFiles.map((file) => ({ ...file, kind: 'file' as const }))
  const keyword = query.trim().toLowerCase()
  const visibleEntries = keyword
    ? entries.filter((entry) => `${entry.name} ${entry.relativePath} ${entry.type}`.toLowerCase().includes(keyword))
    : entries

  return (
    <div className="workspace-browser">
      <div className="workspace-browser-toolbar">
        <div className="workspace-breadcrumbs">
          {(tree?.breadcrumbs ?? [{ name: currentPath ? '当前目录' : '根目录', path: currentPath }]).map((crumb, index, items) => (
            <button
              type="button"
              key={`${crumb.path}-${index}`}
              className={index === items.length - 1 ? 'active' : ''}
              onClick={() => onOpenFolder(crumb.path)}
            >
              {index === 0 ? <Folder size={13} /> : null}
              {crumb.name}
            </button>
          ))}
        </div>
        <label className="workspace-file-search">
          <Search size={14} />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索当前目录" />
        </label>
      </div>

      {visibleEntries.length ? (
        <div className="workspace-browser-list">
          {visibleEntries.map((entry) => {
            const file = workspaceEntryToFile(entry)
            const isDirectory = entry.kind === 'directory'
            return (
              <div className={`workspace-browser-row ${entry.kind}`} key={`${entry.kind}:${entry.relativePath}`} title={entry.relativePath}>
                <button
                  type="button"
                  className="workspace-browser-main"
                  onClick={() => isDirectory ? onOpenFolder(entry.relativePath) : onPreviewFile(file)}
                >
                  {isDirectory ? <Folder size={17} /> : <FileText size={17} />}
                  <span>
                    <strong>{entry.name}</strong>
                    <em>{isDirectory ? '文件夹' : `${entry.type || 'file'} · ${formatBytes(entry.size)}`} · {formatTime(entry.modifiedAt)}</em>
                  </span>
                </button>
                {isDirectory ? (
                  <>
                    <button type="button" title="进入文件夹" onClick={() => onOpenFolder(entry.relativePath)}>
                      <ChevronDown size={14} />
                    </button>
                    <button type="button" title="在 Finder 中显示" onClick={() => onRevealFile(file)}>
                      <FolderOpen size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" title="作为上下文发送给 Hermes" onClick={() => onUseFile(file)}>
                      <Plus size={14} />
                    </button>
                    <button type="button" title="预览文本文件" onClick={() => onPreviewFile(file)}>
                      <FileText size={14} />
                    </button>
                    <button type="button" title="在 Finder 中显示" onClick={() => onRevealFile(file)}>
                      <FolderOpen size={14} />
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyWorkspaceBlock
          title={query.trim() ? '没有匹配文件' : '这个目录暂无文件'}
          detail={query.trim() ? '换一个关键词，或回到根目录继续查找。' : '上传文件，或在 Finder 中放入资料后刷新页面。'}
        />
      )}
    </div>
  )
}

function workspaceEntryToFile(entry: WorkspaceTreeEntry): WorkspaceFile {
  return {
    name: entry.name,
    relativePath: entry.relativePath,
    path: entry.path,
    type: entry.type,
    size: entry.size,
    modifiedAt: entry.modifiedAt
  }
}

function EmptyWorkspaceBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-workspace-block">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}
