import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Circle,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Square,
  Trash2,
  XCircle
} from 'lucide-react'
import type { Task } from '../../lib/api'

export function TaskFocusPanel({
  task,
  onContinue,
  onRetry,
  onArchive,
  onDelete
}: {
  task: Task
  onContinue: () => void
  onRetry: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const title = task.status === 'failed' ? '这次执行失败' : '这次执行已停止'
  const detail = task.status === 'failed'
    ? (task.error || '可以重新运行，或继续追问补充信息。')
    : '任务已被停止，可以继续追问或重新运行。'

  return (
    <section className={`task-focus-panel ${task.status}`}>
      <div className="task-focus-head">
        <div>
          <span className={`status-pill compact ${task.status}`}>
            <StatusIcon status={task.status} />
            {statusLabel(task.status)}
          </span>
          <h2>{title}</h2>
          <p>{detail}</p>
        </div>
        <div className="task-focus-actions">
          <button type="button" className="ghost-button" onClick={onContinue}>
            <MessageSquarePlus size={15} />
            继续追问
          </button>
          <button type="button" className="ghost-button" onClick={onRetry}>
            <RefreshCw size={15} />
            重新运行
          </button>
          <button type="button" className="ghost-button" onClick={onArchive}>
            {task.archivedAt ? <ArchiveRestore size={15} /> : <Archive size={15} />}
            {task.archivedAt ? '取消归档' : '归档'}
          </button>
          <button type="button" className="ghost-button danger-lite" onClick={onDelete}>
            <Trash2 size={15} />
            删除
          </button>
        </div>
      </div>
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
