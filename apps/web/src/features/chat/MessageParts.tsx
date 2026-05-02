import { FileArchive, FileText } from 'lucide-react'
import type { ApprovalChoice, Artifact, Message, MessageAttachment, Task } from '../../lib/api'
import { MarkdownContent, type MarkdownFileReference } from '../markdown/MarkdownContent'
import { ApprovalRequestCard, latestPendingApprovalRequest } from './ApprovalRequestCard'
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
  workModeLabel,
  type TraceGroupView,
  type TraceRowView
} from './executionTraceModel'
import type { TaskStreamStatus } from './useTaskStream'

export type MessagePart =
  | {
    id: string
    type: 'user_text'
    content: string
  }
  | {
    id: string
    type: 'assistant_text'
    source: string
    live: boolean
  }
  | {
    id: string
    type: 'file_cards'
    variant: 'attachments'
    attachments: MessageAttachment[]
  }
  | {
    id: string
    type: 'file_cards'
    variant: 'references'
    references: MarkdownFileReference[]
  }
  | {
    id: string
    type: 'file_cards'
    variant: 'artifacts'
    artifacts: Artifact[]
  }
  | {
    id: string
    type: 'approval_card'
    task: Task
    busy: boolean
  }
  | {
    id: string
    type: 'activity_group'
    taskStatus: Task['status']
    summaryLabel: string
    elapsedLabel: string
    summaryParts: string[]
    currentRow?: TraceRowView
    groups: TraceGroupView[]
  }
  | {
    id: string
    type: 'tool_card'
    currentRow: TraceRowView
    previousRows: TraceRowView[]
    steps: ReturnType<typeof taskStepItems>
    streamStatus: TaskStreamStatus
    streamUpdatedAt: string | null
  }

export function buildMessageParts({
  role,
  content,
  live = false,
  attachments = [],
  artifactCards = [],
  fileReferences = []
}: {
  role: Message['role']
  content: string
  live?: boolean
  attachments?: MessageAttachment[]
  artifactCards?: Artifact[]
  fileReferences?: MarkdownFileReference[]
}): MessagePart[] {
  if (role !== 'assistant') {
    return [
      { id: 'user-text', type: 'user_text', content },
      ...attachmentPart(attachments)
    ]
  }

  const fileOverview = extractFileOverviewTables(content, fileReferences)
  return [
    { id: 'assistant-text', type: 'assistant_text', source: fileOverview.source, live },
    ...referencePart(fileOverview.references),
    ...artifactPart(artifactCards),
    ...attachmentPart(attachments)
  ]
}

export function MessagePartList({
  parts,
  fileReferences,
  onOpenAttachment,
  onOpenArtifact,
  onOpenFileReference,
  formatTime,
  onRespondApproval
}: {
  parts: MessagePart[]
  fileReferences?: MarkdownFileReference[]
  onOpenAttachment?: (attachment: MessageAttachment) => void
  onOpenArtifact?: (artifact: Artifact) => void
  onOpenFileReference?: (reference: MarkdownFileReference) => void
  formatTime?: (value: string) => string
  onRespondApproval?: (task: Task, choice: ApprovalChoice) => void
}) {
  return (
    <>
      {parts.map((part) => {
        if (part.type === 'user_text') {
          return <div className="message-body" key={part.id}>{part.content}</div>
        }
        if (part.type === 'assistant_text') {
          return (
            <div
              className={part.live ? 'message-body message-markdown live-output' : 'message-body message-markdown'}
              key={part.id}
            >
              <MarkdownContent
                source={part.source}
                emptyText={part.live ? 'Hermes 正在组织答案...' : ''}
                fileReferences={fileReferences}
                onOpenFileReference={onOpenFileReference}
              />
            </div>
          )
        }
        if (part.type === 'approval_card') {
          return (
            <ApprovalRequestCard
              task={part.task}
              busy={part.busy}
              formatTime={formatTime ?? ((value) => value)}
              onRespond={(task, choice) => onRespondApproval?.(task, choice)}
              key={part.id}
            />
          )
        }
        if (part.type === 'activity_group') {
          return (
            <InlineExecutionTracePanel
              taskStatus={part.taskStatus}
              summaryLabel={part.summaryLabel}
              elapsedLabel={part.elapsedLabel}
              summaryParts={part.summaryParts}
              currentRow={part.currentRow}
              groups={part.groups}
              formatTime={formatTime ?? ((value) => value)}
              key={part.id}
            />
          )
        }
        if (part.type === 'tool_card') {
          return (
            <LiveExecutionPanelView
              currentRow={part.currentRow}
              previousRows={part.previousRows}
              steps={part.steps}
              streamStatus={part.streamStatus}
              streamLabel={taskStreamLabel(part.streamStatus)}
              streamDescription={taskStreamDescription(part.streamStatus, part.streamUpdatedAt, formatTime ?? ((value) => value))}
              formatTime={formatTime ?? ((value) => value)}
              workModeLabel={workModeLabel}
              key={part.id}
            />
          )
        }
        return (
          <MessageFileCards
            key={part.id}
            part={part}
            onOpenAttachment={onOpenAttachment}
            onOpenArtifact={onOpenArtifact}
            onOpenFileReference={onOpenFileReference}
          />
        )
      })}
    </>
  )
}

export function buildApprovalMessageParts(task: Task | undefined, busy = false): MessagePart[] {
  if (!task || !latestPendingApprovalRequest(task)) return []
  return [{ id: 'approval-request', type: 'approval_card', task, busy }]
}

export function buildActivityGroupMessageParts(task: Task | undefined): MessagePart[] {
  if (!task) return []
  const rows = executionTraceRows(task)
  if (!rows.length) return []

  const visibleRows = compactTraceRows(task, rows)
  const groups = groupTraceRows(visibleRows)
  const lastRow = rows[rows.length - 1]
  const showCurrentRow = task.status === 'running' && lastRow
  return [{
    id: 'activity-group',
    type: 'activity_group',
    taskStatus: task.status,
    summaryLabel: task.status === 'running' ? '处理中' : '已处理',
    elapsedLabel: taskElapsedLabel(task),
    summaryParts: traceSummaryParts(task, rows),
    currentRow: showCurrentRow ? lastRow : undefined,
    groups
  }]
}

export function buildToolCardMessageParts(
  task: Task | undefined,
  streamStatus: TaskStreamStatus,
  streamUpdatedAt: string | null
): MessagePart[] {
  if (!task || task.status !== 'running') return []
  const rows = liveTraceRows(task)
  return [{
    id: 'live-tool-card',
    type: 'tool_card',
    currentRow: rows.at(-1) ?? fallbackLiveTraceRow(task),
    previousRows: rows.slice(-5, -1),
    steps: taskStepItems(task).slice(-4),
    streamStatus,
    streamUpdatedAt
  }]
}

export function taskStreamLabel(status: TaskStreamStatus) {
  return {
    idle: '未连接',
    connecting: '连接中',
    live: '实时同步',
    fallback: '轮询兜底'
  }[status]
}

function taskStreamDescription(
  status: TaskStreamStatus,
  updatedAt: string | null,
  formatTime: (value: string) => string
) {
  if (status === 'live') return updatedAt ? `最近同步 ${formatTime(updatedAt)}` : '事件流已连接'
  if (status === 'connecting') return '正在连接 Hermes 任务事件流'
  if (status === 'fallback') return '事件流暂不可用，正在用轮询刷新'
  return '任务运行时会自动连接事件流'
}

function MessageFileCards({
  part,
  onOpenAttachment,
  onOpenArtifact,
  onOpenFileReference
}: {
  part: Extract<MessagePart, { type: 'file_cards' }>
  onOpenAttachment?: (attachment: MessageAttachment) => void
  onOpenArtifact?: (artifact: Artifact) => void
  onOpenFileReference?: (reference: MarkdownFileReference) => void
}) {
  if (part.variant === 'attachments') {
    return (
      <div className="message-attachment-list" aria-label="消息附件">
        {part.attachments.map((attachment) => (
          <button
            type="button"
            key={attachment.id}
            title={`打开附件：${attachment.relativePath}`}
            onClick={() => onOpenAttachment?.(attachment)}
          >
            <FileText size={14} />
            <span>{attachment.name}</span>
            <em>{formatBytes(attachment.size)}</em>
          </button>
        ))}
      </div>
    )
  }

  if (part.variant === 'artifacts') {
    return (
      <div className="message-attachment-list message-output-file-list" aria-label="Hermes 输出文件">
        {part.artifacts.map((artifact) => (
          <button
            type="button"
            key={artifact.id}
            title={`打开输出文件：${artifact.relativePath}`}
            onClick={() => onOpenArtifact?.(artifact)}
          >
            <FileArchive size={14} />
            <span>{artifact.name}</span>
            <em>{formatBytes(artifact.size)}</em>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="message-attachment-list message-reference-file-list" aria-label="Hermes 提到的文件">
      {part.references.map((reference) => {
        const canOpen = !reference.id.startsWith('table:') && Boolean(onOpenFileReference)
        const label = reference.relativePath ?? reference.type ?? '文件'
        if (!canOpen) {
          return (
            <span className="message-reference-file-card passive" key={reference.id}>
              <FileText size={14} />
              <span>{reference.name}</span>
              <em>{label}</em>
            </span>
          )
        }
        return (
          <button
            type="button"
            key={reference.id}
            title={`打开文件：${reference.relativePath ?? reference.name}`}
            onClick={() => onOpenFileReference?.(reference)}
          >
            <FileText size={14} />
            <span>{reference.name}</span>
            <em>{label}</em>
          </button>
        )
      })}
    </div>
  )
}

function attachmentPart(attachments: MessageAttachment[]): MessagePart[] {
  if (!attachments.length) return []
  return [{ id: 'attachments', type: 'file_cards', variant: 'attachments', attachments }]
}

function artifactPart(artifacts: Artifact[]): MessagePart[] {
  if (!artifacts.length) return []
  return [{ id: 'artifacts', type: 'file_cards', variant: 'artifacts', artifacts }]
}

function referencePart(references: MarkdownFileReference[]): MessagePart[] {
  if (!references.length) return []
  return [{ id: 'file-references', type: 'file_cards', variant: 'references', references }]
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function extractFileOverviewTables(source: string, fileReferences: MarkdownFileReference[]) {
  const lines = source.split(/\r?\n/)
  const keep = lines.map(() => true)
  const references: MarkdownFileReference[] = []
  let index = 0

  while (index < lines.length - 1) {
    if (!isMarkdownTableStart(lines[index], lines[index + 1])) {
      index += 1
      continue
    }

    const start = index
    let end = index + 2
    while (end < lines.length && lines[end].trim() && lines[end].includes('|')) {
      end += 1
    }

    const tableReferences = extractFileReferencesFromTable(lines.slice(start, end), fileReferences)
    if (tableReferences.length) {
      for (let lineIndex = start; lineIndex < end; lineIndex += 1) {
        keep[lineIndex] = false
      }
      tableReferences.forEach((reference) => pushUniqueReference(references, reference))
    }
    index = end
  }

  return {
    source: compactMarkdown(lines.filter((_, lineIndex) => keep[lineIndex]).join('\n')),
    references
  }
}

function isMarkdownTableStart(header: string, separator: string) {
  if (!header.includes('|')) return false
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(separator)
}

function extractFileReferencesFromTable(tableLines: string[], fileReferences: MarkdownFileReference[]) {
  const headerText = extractTableCells(tableLines[0]).join(' ')
  const rowCells = tableLines.slice(2).flatMap(extractTableCells)
  const fileCells = rowCells
    .map(cleanTableCell)
    .filter((cell) => isLikelyFileName(cell))

  if (!fileCells.length) return []
  const headerLooksLikeFileList = /文件名|文件|名称|name|filename|file/i.test(headerText)
  if (!headerLooksLikeFileList && fileCells.length < 2) return []

  const references: MarkdownFileReference[] = []
  fileCells.forEach((cell) => {
    const matched = findFileReference(cell, fileReferences)
    pushUniqueReference(references, matched ?? {
      id: `table:${cell}`,
      name: cell,
      type: fileTypeLabel(cell)
    })
  })
  return references
}

function extractTableCells(row: string) {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

function cleanTableCell(cell: string) {
  return cell
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\[[^\]]+\]\(([^)]+)\)/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .trim()
}

function isLikelyFileName(value: string) {
  return /\.(?:pptx?|ppsx|docx?|rtf|xlsx?|xlsm|csv|tsv|pdf|png|jpe?g|gif|webp|svg|md|txt|json|html?)$/i.test(value.trim())
}

function findFileReference(value: string, references: MarkdownFileReference[]) {
  const normalizedValue = normalizeFileReference(value)
  if (!normalizedValue) return undefined
  return references.find((reference) => {
    const name = normalizeFileReference(reference.name)
    const relativePath = normalizeFileReference(reference.relativePath ?? '')
    return normalizedValue === name || normalizedValue === relativePath || normalizedValue === basename(relativePath)
  })
}

function pushUniqueReference(references: MarkdownFileReference[], reference: MarkdownFileReference) {
  const key = normalizeFileReference(reference.relativePath ?? reference.name)
  if (references.some((item) => normalizeFileReference(item.relativePath ?? item.name) === key)) return
  references.push(reference)
}

function normalizeFileReference(value: string) {
  return value
    .trim()
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .replace(/^\.\//, '')
    .toLowerCase()
}

function basename(value: string) {
  return value.split(/[\\/]/).filter(Boolean).pop() ?? value
}

function fileTypeLabel(value: string) {
  const extension = value.split('.').pop()?.toLowerCase()
  if (!extension) return '文件'
  if (['ppt', 'pptx', 'ppsx'].includes(extension)) return '演示文稿'
  if (['doc', 'docx', 'rtf'].includes(extension)) return '文档'
  if (['xls', 'xlsx', 'xlsm', 'csv', 'tsv'].includes(extension)) return '表格'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) return '图片'
  if (extension === 'pdf') return 'PDF'
  if (['md', 'txt', 'json', 'html'].includes(extension)) return '文本'
  return extension.toUpperCase()
}

function compactMarkdown(value: string) {
  return value
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
}
