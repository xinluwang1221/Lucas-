import {
  CheckCircle2,
  ChevronDown,
  Circle,
  FileArchive,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderSync,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Square,
  Trash2,
  Upload,
  XCircle
} from 'lucide-react'
import {
  artifactDownloadUrl,
  type Artifact,
  type Task,
  type Workspace,
  type WorkspaceFile,
  type WorkspaceTree
} from '../../lib/api'
import {
  FilePreviewPanel,
  type FilePreviewState,
  type FilePreviewTarget
} from '../file-preview/FilePreviewPanel'
import { WorkspaceBrowser } from './WorkspaceBrowser'

export function ProjectsView({
  workspaces,
  tasks,
  artifacts,
  workspaceFiles,
  workspaceTree,
  workspacePath,
  workspaceQuery,
  filePreview,
  selectedWorkspaceId,
  onSelect,
  onOpenTask,
  onUsePrompt,
  onUseFile,
  onPreviewFile,
  onRevealFile,
  onOpenFolder,
  onWorkspaceQueryChange,
  onCloseFilePreview,
  onUsePreviewTarget,
  onRevealPreviewTarget,
  onUploadClick,
  onAdd,
  onReveal,
  onRename,
  onReauthorize,
  onRemove
}: {
  workspaces: Workspace[]
  tasks: Task[]
  artifacts: Artifact[]
  workspaceFiles: WorkspaceFile[]
  workspaceTree: WorkspaceTree | null
  workspacePath: string
  workspaceQuery: string
  filePreview: FilePreviewState | null
  selectedWorkspaceId: string
  onSelect: (workspace: Workspace) => void
  onOpenTask: (task: Task) => void
  onUsePrompt: (workspace: Workspace, prompt: string) => void
  onUseFile: (file: WorkspaceFile) => void
  onPreviewFile: (file: WorkspaceFile) => void
  onRevealFile: (file: WorkspaceFile) => void
  onOpenFolder: (path: string) => void
  onWorkspaceQueryChange: (query: string) => void
  onCloseFilePreview: () => void
  onUsePreviewTarget: (target: FilePreviewTarget) => void
  onRevealPreviewTarget: (target: FilePreviewTarget) => void
  onUploadClick: () => void
  onAdd: () => void
  onReveal: (workspace: Workspace) => void
  onRename: (workspace: Workspace) => void
  onReauthorize: (workspace: Workspace) => void
  onRemove: (workspace: Workspace) => void
}) {
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0]
  const workspaceTasks = selectedWorkspace ? tasks.filter((task) => task.workspaceId === selectedWorkspace.id && !task.archivedAt) : []
  const recentTasks = workspaceTasks
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6)
  const workspaceArtifacts = selectedWorkspace
    ? artifacts
        .filter((artifact) => artifact.workspaceId === selectedWorkspace.id)
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6)
    : []
  const switchableWorkspaces = workspaces.filter((workspace) => workspace.id !== selectedWorkspace?.id)
  const failed = workspaceTasks.filter((task) => task.status === 'failed' || task.status === 'stopped').length
  const workspaceFilePreview = selectedWorkspace && filePreview?.target.source === 'workspace' && filePreview.target.workspaceId === selectedWorkspace.id
    ? filePreview
    : null

  return (
    <section className="product-page workspace-home workspace-file-page">
      <header className="product-page-head workspace-home-head">
        <div>
          <span className="page-kicker">工作区</span>
          <h1>{selectedWorkspace?.name ?? '工作区'}</h1>
          <p>{selectedWorkspace ? '已授权的本机文件夹。这里管理文件、会话和 Hermes 的工作边界。' : '选择一个文件夹，作为 Hermes 可以工作的本机空间。'}</p>
        </div>
        <div className="workspace-head-actions">
          {selectedWorkspace && (
            <button className="ghost-button" onClick={() => onReveal(selectedWorkspace)}>
              <FolderOpen size={16} />
              打开目录
            </button>
          )}
          {selectedWorkspace && (
            <button className="ghost-button" onClick={() => onRename(selectedWorkspace)}>
              <Pencil size={15} />
              重命名
            </button>
          )}
          {selectedWorkspace && (
            <button className="ghost-button" onClick={() => onReauthorize(selectedWorkspace)}>
              <FolderSync size={15} />
              重新授权
            </button>
          )}
          <button className="send-button" onClick={onAdd}>
            <FolderPlus size={16} />
            授权文件夹
          </button>
          {selectedWorkspace?.id !== 'default' && (
            <button className="ghost-button danger-lite" onClick={() => onRemove(selectedWorkspace)}>
              <Trash2 size={15} />
              移除
            </button>
          )}
        </div>
      </header>

      {selectedWorkspace ? (
        <>
          <section className="workspace-status-panel">
            <div>
              <span className="status-pill compact completed">
                <CheckCircle2 size={14} />
                可工作
              </span>
              <strong>Hermes 只会在这个授权文件夹内读取、写入和保存产物。</strong>
              <p>需要处理文件时，从下方选择文件作为上下文，或直接新建对话。</p>
            </div>
            <div className="workspace-status-actions">
              <button className="ghost-button" onClick={() => onUsePrompt(selectedWorkspace, '')}>
                <MessageSquarePlus size={15} />
                新建对话
              </button>
              <button className="ghost-button" onClick={onUploadClick}>
                <Upload size={15} />
                上传文件
              </button>
            </div>
          </section>

          <div className={workspaceFilePreview ? 'workspace-file-grid previewing' : 'workspace-file-grid'}>
            <section className="workspace-section workspace-browser-panel">
              <div className="workspace-section-head">
                <div>
                  <h2>文件</h2>
                  <p>选择文件预览、定位，或作为下一次任务上下文。</p>
                </div>
                <button className="mini-button" onClick={onUploadClick}>
                  <Upload size={13} />
                  上传
                </button>
              </div>
              <WorkspaceBrowser
                tree={workspaceTree}
                fallbackFiles={workspaceFiles}
                currentPath={workspacePath}
                query={workspaceQuery}
                onQueryChange={onWorkspaceQueryChange}
                onOpenFolder={onOpenFolder}
                onUseFile={onUseFile}
                onPreviewFile={onPreviewFile}
                onRevealFile={onRevealFile}
              />
            </section>

            <aside className="workspace-side-column">
              {workspaceFilePreview ? (
                <FilePreviewPanel
                  preview={workspaceFilePreview}
                  compact
                  onClose={onCloseFilePreview}
                  onUseContext={onUsePreviewTarget}
                  onReveal={onRevealPreviewTarget}
                />
              ) : (
                <>
                  <section className="workspace-section">
                    <div className="workspace-section-head">
                      <div>
                        <h2>会话</h2>
                        <p>{failed ? `${failed} 个会话需要处理。` : '从这里回到这个工作区里的任务。'}</p>
                      </div>
                    </div>
                    {recentTasks.length ? (
                      <div className="workspace-task-list compact">
                        {recentTasks.map((task) => (
                          <button className={`workspace-task-card ${task.status}`} key={task.id} onClick={() => onOpenTask(task)}>
                            <StatusIcon status={task.status} />
                            <div>
                              <strong>{task.title}</strong>
                              <span>{statusLabel(task.status)} · {formatTime(task.updatedAt)}</span>
                            </div>
                            <ChevronDown size={14} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <EmptyWorkspaceBlock title="暂无会话" detail="点“新建对话”，让 Hermes 在这个工作区开始工作。" />
                    )}
                  </section>

                  {workspaceArtifacts.length > 0 && (
                    <section className="workspace-section">
                      <div className="workspace-section-head">
                        <div>
                          <h2>产物</h2>
                          <p>这个工作区里已经生成的文件。</p>
                        </div>
                      </div>
                      <div className="workspace-artifact-list">
                        {workspaceArtifacts.map((artifact) => (
                          <a href={artifactDownloadUrl(artifact.id)} key={artifact.id}>
                            <FileArchive size={16} />
                            <div>
                              <strong>{artifact.name}</strong>
                              <span>{formatBytes(artifact.size)}</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </aside>
          </div>
        </>
      ) : (
        <EmptyWorkspaceBlock title="还没有工作区" detail="选择一个文件夹授权给 Hermes，之后这里会显示文件管理页。" />
      )}

      {switchableWorkspaces.length > 0 && (
        <section className="workspace-switcher-section">
          <div className="workspace-section-head">
            <div>
              <h2>其他工作区</h2>
              <p>点击工作区可以切换文件管理范围。</p>
            </div>
          </div>
          <div className="project-directory-list compact">
            {switchableWorkspaces.map((workspace) => {
              const workspaceTaskCount = tasks.filter((task) => task.workspaceId === workspace.id && !task.archivedAt).length
              return (
                <article
                  className="project-directory-card"
                  key={workspace.id}
                  onClick={() => onSelect(workspace)}
                >
                  <Folder size={18} />
                  <div>
                    <strong>{workspace.name}</strong>
                    <span>{workspaceTaskCount} 个会话</span>
                  </div>
                  <div className="project-card-actions">
                    <button className="settings-link-button" onClick={(event) => {
                      event.stopPropagation()
                      onReveal(workspace)
                    }}>打开目录</button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}
    </section>
  )
}

function StatusIcon({ status }: { status: Task['status'] }) {
  if (status === 'running') return <Loader2 size={15} className="spin" />
  if (status === 'completed') return <CheckCircle2 size={15} />
  if (status === 'failed') return <XCircle size={15} />
  if (status === 'stopped') return <Square size={15} />
  return <Circle size={15} />
}

function statusLabel(status: Task['status']) {
  return {
    idle: '未开始',
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    stopped: '已停止'
  }[status]
}

function EmptyWorkspaceBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-workspace-block">
      <Circle size={18} />
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
