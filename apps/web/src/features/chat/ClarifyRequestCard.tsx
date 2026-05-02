import { MessageSquareText, Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ExecutionEvent, Task } from '../../lib/api'

type ClarifyRequestCardProps = {
  task: Task
  busy?: boolean
  formatTime: (value: string) => string
  onRespond: (task: Task, answer: string) => void
}

export function ClarifyRequestCard({ task, busy = false, formatTime, onRespond }: ClarifyRequestCardProps) {
  const clarify = latestPendingClarifyRequest(task)
  const [draft, setDraft] = useState('')
  const choices = useMemo(() => normalizeChoices(clarify?.choices), [clarify?.choices])
  if (!clarify) return null

  const question = String(clarify.question ?? clarify.summary ?? clarify.message ?? 'Hermes 需要你补充信息后才能继续。').trim()
  const disabled = busy || task.status !== 'running'
  const canSendDraft = draft.trim().length > 0 && !disabled

  function submit(answer: string) {
    const normalized = answer.trim()
    if (!normalized || disabled) return
    onRespond(task, normalized)
    setDraft('')
  }

  return (
    <section className="clarify-card" aria-live="assertive">
      <div className="approval-card-head">
        <div>
          <span>需要你补充信息</span>
          <strong><MessageSquareText size={15} /> Hermes 想先确认任务细节</strong>
        </div>
        <time>{formatTime(clarify.createdAt)}</time>
      </div>

      <p>{question}</p>

      {choices.length > 0 && (
        <div className="clarify-choice-list">
          {choices.map((choice) => (
            <button
              className="clarify-choice"
              disabled={disabled}
              key={choice}
              onClick={() => submit(choice)}
              type="button"
            >
              {choice}
            </button>
          ))}
        </div>
      )}

      <div className="clarify-response-row">
        <textarea
          disabled={disabled}
          maxLength={4000}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              submit(draft)
            }
          }}
          placeholder={choices.length ? '也可以直接输入其他补充信息' : '输入你的补充信息，Hermes 会继续执行'}
          value={draft}
        />
        <button
          className="approval-action primary"
          disabled={!canSendDraft}
          onClick={() => submit(draft)}
          type="button"
        >
          <Send size={14} />
          回复
        </button>
      </div>
    </section>
  )
}

export function latestPendingClarifyRequest(task?: Task | null): ExecutionEvent | null {
  if (!task?.events?.length) return null
  let pending: ExecutionEvent | null = null

  for (const event of task.events) {
    if (event.type === 'clarify.request') pending = event
    if (
      event.type === 'clarify.resolved' ||
      event.type === 'task.completed' ||
      event.type === 'task.failed' ||
      event.type === 'task.stopped'
    ) {
      pending = null
    }
  }

  return pending
}

function normalizeChoices(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((choice) => String(choice ?? '').trim())
    .filter(Boolean)
    .slice(0, 4)
}
