import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronDown,
  Circle,
  Folder,
  FolderOpen,
  FolderSync,
  Loader2,
  Pencil,
  Square,
  Trash2,
  XCircle
} from 'lucide-react'
import type { Task, Workspace } from '../../lib/api'

export function SidebarWorkspaceNode({
  workspace,
  tasks,
  archivedTasks,
  activeWorkspace,
  activeTaskId,
  onOpenWorkspace,
  onOpenTask,
  onArchiveTask,
  onDeleteTask,
  onReveal,
  onRename,
  onReauthorize,
  onRemove,
  updating
}: {
  workspace: Workspace
  tasks: Task[]
  archivedTasks: Task[]
  activeWorkspace: boolean
  activeTaskId: string | null
  onOpenWorkspace: () => void
  onOpenTask: (task: Task) => void
  onArchiveTask: (task: Task) => void
  onDeleteTask: (task: Task) => void
  onReveal: () => void
  onRename: () => void
  onReauthorize: () => void
  onRemove: () => void
  updating: boolean
}) {
  const runningCount = tasks.filter((task) => task.status === 'running').length
  const sessionMeta = [
    runningCount ? `${runningCount} 个运行中` : `${tasks.length} 个会话`,
    archivedTasks.length ? `${archivedTasks.length} 个已归档` : ''
  ].filter(Boolean).join(' · ')
  const defaultWorkspace = workspace.id === 'default'

  return (
    <div className={['workspace-tree-node', activeWorkspace ? 'active' : ''].filter(Boolean).join(' ')}>
      <div className="workspace-tree-row">
        <button type="button" className="workspace-tree-main" onClick={onOpenWorkspace} title={workspace.path}>
          {activeWorkspace ? <FolderOpen size={15} /> : <Folder size={15} />}
          <span>
            <strong>{workspace.name}</strong>
            <em>{sessionMeta}</em>
          </span>
        </button>
        <button type="button" className="workspace-tree-action" title="在 Finder 中打开授权文件夹" aria-label="在 Finder 中打开授权文件夹" onClick={onReveal}>
          <FolderOpen size={13} />
        </button>
        <button type="button" className="workspace-tree-action" title="重命名工作区" aria-label="重命名工作区" onClick={onRename}>
          <Pencil size={12} />
        </button>
        <button
          type="button"
          className="workspace-tree-action"
          title="重新授权文件夹：选择新的本机目录，不是刷新页面"
          aria-label="重新授权文件夹：选择新的本机目录"
          onClick={onReauthorize}
          disabled={updating}
        >
          {updating ? <Loader2 size={12} className="spin" /> : <FolderSync size={12} />}
        </button>
        <button
          type="button"
          className={['workspace-tree-action danger', defaultWorkspace ? 'locked' : ''].filter(Boolean).join(' ')}
          title={defaultWorkspace ? '默认工作区不能移除；可以点“重新授权文件夹”改成别的目录' : '移除工作区记录：不会删除真实文件'}
          aria-label={defaultWorkspace ? '默认工作区不能移除' : '移除工作区记录'}
          onClick={onRemove}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="workspace-session-list">
        {tasks.length ? (
          tasks.map((task) => (
            <div className={['workspace-session-row', task.id === activeTaskId ? 'active' : '', task.status].filter(Boolean).join(' ')} key={task.id}>
              <button type="button" className="workspace-session-main" onClick={() => onOpenTask(task)}>
                <StatusIcon status={task.status} />
                <span>
                  <strong>{task.title}</strong>
                  <em>{statusLabel(task.status)} · {formatTime(task.updatedAt)}</em>
                </span>
              </button>
              <div className="workspace-session-actions">
                <button type="button" title="归档会话：从当前列表隐藏，不删除；可在“已归档”中恢复" onClick={() => onArchiveTask(task)}>
                  <Archive size={12} />
                </button>
                <button type="button" title="删除会话记录" onClick={() => onDeleteTask(task)}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <p>暂无会话</p>
        )}
        {archivedTasks.length > 0 && (
          <details className="workspace-archive-list" open={archivedTasks.some((task) => task.id === activeTaskId)}>
            <summary>
              <Archive size={12} />
              <span>已归档</span>
              <em>{archivedTasks.length}</em>
              <ChevronDown size={12} />
            </summary>
            <div>
              {archivedTasks.map((task) => (
                <div className={['workspace-session-row archived', task.id === activeTaskId ? 'active' : '', task.status].filter(Boolean).join(' ')} key={task.id}>
                  <button type="button" className="workspace-session-main" onClick={() => onOpenTask(task)}>
                    <Archive size={13} />
                    <span>
                      <strong>{task.title}</strong>
                      <em>已归档 · {formatTime(task.updatedAt)}</em>
                    </span>
                  </button>
                  <div className="workspace-session-actions">
                    <button type="button" title="恢复到当前会话列表" onClick={() => onArchiveTask(task)}>
                      <ArchiveRestore size={12} />
                    </button>
                    <button type="button" title="删除会话记录" onClick={() => onDeleteTask(task)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}
