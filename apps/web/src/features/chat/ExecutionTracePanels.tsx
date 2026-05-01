import {
  Brain,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Globe2,
  Square,
  Wrench,
  XCircle
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { Task } from '../../lib/api'
import type { StepView, TraceGroupView, TraceKind, TraceRowView } from './executionTraceModel'

export function LiveExecutionPanelView({
  currentRow,
  previousRows,
  steps,
  streamStatus,
  streamLabel,
  streamDescription,
  formatTime,
  workModeLabel
}: {
  currentRow: TraceRowView
  previousRows: TraceRowView[]
  steps: StepView[]
  streamStatus: string
  streamLabel: string
  streamDescription: string
  formatTime: (value: string) => string
  workModeLabel: (mode: string) => string
}) {
  return (
    <section className="live-execution-panel" aria-live="polite">
      <div className="live-execution-head">
        <div>
          <strong>实时执行</strong>
          <span>{streamDescription}</span>
        </div>
        <span className={`stream-pill ${streamStatus}`}>{streamLabel}</span>
      </div>

      <div className={`live-current-step ${currentRow.kind}`}>
        <span className="agent-trace-icon">{traceIcon(currentRow.kind)}</span>
        <div>
          <strong>{currentRow.title}</strong>
          {currentRow.detail && <TraceDetail text={currentRow.detail} />}
        </div>
        <time>{formatTime(currentRow.createdAt)}</time>
      </div>

      {steps.length > 0 && (
        <ol className="live-step-strip">
          {steps.map((step, index) => (
            <li className={step.status} key={`${step.label}-${index}`}>
              <span />
              <div>
                <strong>{step.label}</strong>
                <em>{workModeLabel(step.mode)}</em>
              </div>
            </li>
          ))}
        </ol>
      )}

      {previousRows.length > 0 && (
        <div className="live-activity-list">
          {previousRows.map((row) => (
            <div className={`live-activity-row ${row.kind}`} key={row.id}>
              <span className="agent-trace-icon">{traceIcon(row.kind)}</span>
              <div>
                <strong>{row.title}</strong>
                {row.detail && <TraceDetail text={row.detail} />}
              </div>
              <time>{formatTime(row.createdAt)}</time>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function InlineExecutionTracePanel({
  taskStatus,
  summaryLabel,
  elapsedLabel,
  summaryParts,
  currentRow,
  groups,
  formatTime
}: {
  taskStatus: Task['status']
  summaryLabel: string
  elapsedLabel: string
  summaryParts: string[]
  currentRow?: TraceRowView
  groups: TraceGroupView[]
  formatTime: (value: string) => string
}) {
  return (
    <section className={`agent-run-summary ${taskStatus}`}>
      <details className="agent-run-details" open={taskStatus === 'running'}>
        <summary>
          <span>{summaryLabel} {elapsedLabel}</span>
          {summaryParts.length > 0 && <em>{summaryParts.join(' · ')}</em>}
          <ChevronDown size={14} />
        </summary>

        {currentRow && (
          <div className={`agent-run-current ${currentRow.kind}`}>
            <span className="agent-trace-icon">{traceIcon(currentRow.kind)}</span>
            <div>
              <strong>{currentRow.title}</strong>
              {currentRow.detail && <TraceDetail text={currentRow.detail} />}
            </div>
            <time>{formatTime(currentRow.createdAt)}</time>
          </div>
        )}

        <div className="agent-run-groups">
          {groups.map((group) => (
            <section className={`agent-run-group ${group.kind}`} key={group.kind}>
              <h4>
                <span className="agent-trace-icon">{traceIcon(group.iconKind)}</span>
                {group.label}
                <em>{group.rows.length}</em>
              </h4>
              <ol>
                {group.rows.map((row) => (
                  <li className={`agent-run-row ${row.kind}`} key={row.id}>
                    <span className="agent-trace-icon">{traceIcon(row.kind)}</span>
                    <div>
                      <strong>{row.title}</strong>
                      {row.detail && <TraceDetail text={row.detail} />}
                    </div>
                    <time>{formatTime(row.createdAt)}</time>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </details>
    </section>
  )
}

export function traceIcon(kind: TraceKind): ReactNode {
  if (kind === 'thinking') return <Brain size={14} />
  if (kind === 'search') return <Globe2 size={14} />
  if (kind === 'file') return <FileText size={14} />
  if (kind === 'done') return <CheckCircle2 size={14} />
  if (kind === 'stopped') return <Square size={14} />
  if (kind === 'error') return <XCircle size={14} />
  if (kind === 'tool') return <Wrench size={14} />
  return <Clock3 size={14} />
}

type TraceDetailToken = {
  value: string
  kind: 'text' | 'code' | 'url' | 'path'
}

function TraceDetail({ text }: { text: string }) {
  const tokens = tokenizeTraceDetail(text)
  return (
    <p className="trace-detail">
      {tokens.map((token, index) => {
        if (token.kind === 'text') return <span key={`${token.kind}-${index}`}>{token.value}</span>
        return (
          <code className={`trace-token ${token.kind}`} key={`${token.kind}-${index}`}>
            {trimTraceToken(token.value, token.kind)}
          </code>
        )
      })}
    </p>
  )
}

function tokenizeTraceDetail(text: string): TraceDetailToken[] {
  const tokens: TraceDetailToken[] = []
  const pattern = /(`[^`]+`|https?:\/\/[^\s，。)）]+|\/Users\/[^\s，。)）]+|(?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|jsx|css|md|json|yaml|yml|py|txt|docx|xlsx|pptx|pdf)|[\w.-]+\.(?:ts|tsx|js|jsx|css|md|json|yaml|yml|py|txt|docx|xlsx|pptx|pdf))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    const value = match[0]
    const index = match.index ?? 0
    if (index > lastIndex) {
      tokens.push({ value: text.slice(lastIndex, index), kind: 'text' })
    }
    tokens.push({ value, kind: traceDetailTokenKind(value) })
    lastIndex = index + value.length
  }

  if (lastIndex < text.length) tokens.push({ value: text.slice(lastIndex), kind: 'text' })
  return tokens.length ? tokens : [{ value: text, kind: 'text' }]
}

function traceDetailTokenKind(value: string): TraceDetailToken['kind'] {
  if (value.startsWith('`') && value.endsWith('`')) return 'code'
  if (/^https?:\/\//.test(value)) return 'url'
  return 'path'
}

function trimTraceToken(value: string, kind: TraceDetailToken['kind']) {
  const raw = kind === 'code' ? value.slice(1, -1) : value
  if (kind === 'url') {
    try {
      return new URL(raw).hostname.replace(/^www\./, '')
    } catch {
      return raw
    }
  }
  if (kind === 'path') return shortReference(raw)
  return raw
}

function shortReference(value: string) {
  try {
    const url = new URL(value)
    return url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/$/, '')
  } catch {
    const cleaned = value.replace(/^\/Users\/[^/]+\//, '~/')
    if (cleaned.length <= 64) return cleaned
    return `${cleaned.slice(0, 28)}...${cleaned.slice(-28)}`
  }
}
