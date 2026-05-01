import { MessageBody } from './MessageBody'
import {
  InlineExecutionTracePanel,
  LiveExecutionPanelView
} from './ExecutionTracePanels'
import {
  compactTraceRows,
  executionTraceRows,
  fallbackLiveTraceRow,
  groupTraceRows,
  liveTraceRows,
  taskElapsedLabel,
  taskStepItems,
  traceSummaryParts,
  workModeLabel
} from './executionTraceModel'
import type { Message, Task } from '../../lib/api'
import type { TaskStreamStatus } from './useTaskStream'

export function FragmentWithTrace({
  message,
  task,
  traceAfterMessageId,
  formatTime
}: {
  message: Message
  task: Task | undefined
  traceAfterMessageId?: string
  formatTime: (value: string) => string
}) {
  return (
    <>
      <article className={`message ${message.role}`}>
        <div className="message-meta">
          {message.role === 'user' ? '你' : 'Hermes'}
          <span>{formatTime(message.createdAt)}</span>
        </div>
        <MessageBody role={message.role} content={message.content} />
      </article>
      {task && task.status !== 'running' && message.id === traceAfterMessageId && (
        <InlineExecutionTrace task={task} formatTime={formatTime} />
      )}
    </>
  )
}

export function LiveExecutionPanel({
  task,
  streamStatus,
  streamUpdatedAt,
  formatTime
}: {
  task: Task
  streamStatus: TaskStreamStatus
  streamUpdatedAt: string | null
  formatTime: (value: string) => string
}) {
  const rows = liveTraceRows(task)
  const currentRow = rows.at(-1) ?? fallbackLiveTraceRow(task)
  const previousRows = rows.slice(-5, -1)
  const steps = taskStepItems(task).slice(-4)

  return (
    <LiveExecutionPanelView
      currentRow={currentRow}
      previousRows={previousRows}
      steps={steps}
      streamStatus={streamStatus}
      streamLabel={taskStreamLabel(streamStatus)}
      streamDescription={taskStreamDescription(streamStatus, streamUpdatedAt, formatTime)}
      formatTime={formatTime}
      workModeLabel={workModeLabel}
    />
  )
}

function InlineExecutionTrace({ task, formatTime }: { task: Task; formatTime: (value: string) => string }) {
  const rows = executionTraceRows(task)
  if (!rows.length) return null

  const visibleRows = compactTraceRows(task, rows)
  const groups = groupTraceRows(visibleRows)
  const lastRow = rows[rows.length - 1]
  const showCurrentRow = task.status === 'running' && lastRow
  const summaryParts = traceSummaryParts(task, rows)
  const summaryLabel = task.status === 'running' ? '处理中' : '已处理'

  return (
    <InlineExecutionTracePanel
      taskStatus={task.status}
      summaryLabel={summaryLabel}
      elapsedLabel={taskElapsedLabel(task)}
      summaryParts={summaryParts}
      currentRow={showCurrentRow ? lastRow : undefined}
      groups={groups}
      formatTime={formatTime}
    />
  )
}

export function taskStreamLabel(status: TaskStreamStatus) {
  return {
    idle: '未连接',
    connecting: '连接中',
    live: '实时同步',
    fallback: '轮询兜底'
  }[status]
}

export function taskStreamDescription(
  status: TaskStreamStatus,
  updatedAt: string | null,
  formatTime: (value: string) => string
) {
  if (status === 'live') return updatedAt ? `最近同步 ${formatTime(updatedAt)}` : '事件流已连接'
  if (status === 'connecting') return '正在连接 Hermes 任务事件流'
  if (status === 'fallback') return '事件流暂不可用，正在用轮询刷新'
  return '任务运行时会自动连接事件流'
}
