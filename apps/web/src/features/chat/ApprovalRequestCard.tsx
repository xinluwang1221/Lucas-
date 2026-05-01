import { Ban, Check, ShieldCheck, ShieldPlus } from 'lucide-react'
import type { ApprovalChoice, ExecutionEvent, Task } from '../../lib/api'

type ApprovalRequestCardProps = {
  task: Task
  busy?: boolean
  formatTime: (value: string) => string
  onRespond: (task: Task, choice: ApprovalChoice) => void
}

const approvalOptions: Array<{
  choice: ApprovalChoice
  label: string
  icon: typeof Check
  variant: 'primary' | 'neutral' | 'danger'
}> = [
  { choice: 'once', label: '允许本次', icon: Check, variant: 'primary' },
  { choice: 'session', label: '本会话允许', icon: ShieldCheck, variant: 'neutral' },
  { choice: 'always', label: '总是允许', icon: ShieldPlus, variant: 'neutral' },
  { choice: 'deny', label: '拒绝', icon: Ban, variant: 'danger' }
]

export function ApprovalRequestCard({ task, busy = false, formatTime, onRespond }: ApprovalRequestCardProps) {
  const approval = latestPendingApprovalRequest(task)
  if (!approval) return null

  const command = String(approval.command ?? '').trim()
  const description = String(approval.description ?? 'Hermes 请求执行一条需要确认的命令').trim()

  return (
    <section className="approval-card" aria-live="assertive">
      <div className="approval-card-head">
        <div>
          <span>需要你确认</span>
          <strong>Hermes 请求执行命令</strong>
        </div>
        <time>{formatTime(approval.createdAt)}</time>
      </div>

      <p>{description}</p>

      {command && (
        <pre className="approval-command" title={command}>
          {compactCommand(command)}
        </pre>
      )}

      <div className="approval-card-actions">
        {approvalOptions.map((option) => {
          const Icon = option.icon
          return (
            <button
              className={`approval-action ${option.variant}`}
              disabled={busy || task.status !== 'running'}
              key={option.choice}
              onClick={() => onRespond(task, option.choice)}
              type="button"
            >
              <Icon size={14} />
              {option.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function latestPendingApprovalRequest(task?: Task | null): ExecutionEvent | null {
  if (!task?.events?.length) return null
  let pending: ExecutionEvent | null = null

  for (const event of task.events) {
    if (event.type === 'approval.request') pending = event
    if (
      event.type === 'approval.resolved' ||
      event.type === 'task.completed' ||
      event.type === 'task.failed' ||
      event.type === 'task.stopped'
    ) {
      pending = null
    }
  }

  return pending
}

function compactCommand(command: string) {
  const lines = command.replace(/\r/g, '').split('\n')
  const shown = lines.slice(0, 8)
  const overflow = lines.length - shown.length
  return overflow > 0 ? `${shown.join('\n')}\n... 还有 ${overflow} 行` : shown.join('\n')
}
