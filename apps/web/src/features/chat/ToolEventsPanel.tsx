import { CheckCircle2, ChevronDown, Copy, Search, Wrench } from 'lucide-react'
import { useState } from 'react'
import type { ExecutionEvent, Task } from '../../lib/api'
import { isUserVisibleExecutionEvent } from './executionTraceModel'

export function ExecutionPane({ task, tab }: { task: Task; tab: 'response' | 'tools' | 'logs' | 'errors' }) {
  const view = task.executionView
  if (!view) return <p className="muted-copy">还没有运行信息。</p>

  if (tab === 'response') {
    return view.response ? <pre className="detail-pane">{view.response}</pre> : <p className="muted-copy">正文会在 Hermes 返回后显示。</p>
  }

  if (tab === 'tools') {
    const toolEvents = task.events?.filter((event) => event.type.startsWith('tool.')) ?? []
    if (toolEvents.length) {
      return <ToolCards events={toolEvents} dense />
    }

    return view.tools.length ? (
      <ul className="detail-list">
        {view.tools.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    ) : (
      <p className="muted-copy">当前没有可识别的工具或命令记录。CLI quiet 模式会隐藏部分工具细节。</p>
    )
  }

  if (tab === 'errors') {
    return view.errors.length ? (
      <ul className="detail-list error-list">
        {view.errors.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    ) : (
      <p className="muted-copy">没有错误。</p>
    )
  }

  return view.logs.length || view.rawLog ? (
    <pre className="detail-pane">{view.logs.length ? view.logs.join('\n') : view.rawLog}</pre>
  ) : (
    <p className="muted-copy">暂无运行日志。</p>
  )
}

export function EventTimeline({ events, formatTime }: { events: ExecutionEvent[]; formatTime: (value: string) => string }) {
  const visible = events.filter((event) =>
    isUserVisibleExecutionEvent(event) && ['bridge.started', 'step', 'thinking', 'status', 'tool.started', 'tool.completed', 'artifact.created', 'approval.request', 'approval.resolved', 'task.completed', 'task.failed'].includes(
      event.type
    )
  )

  if (!visible.length) {
    return <p className="muted-copy">还没有步骤事件。新任务运行时会实时出现。</p>
  }

  return (
    <ol className="event-timeline">
      {visible.slice(-14).map((event) => (
        <li key={event.id} className={`event ${event.type.replace('.', '-')}`}>
          <span className="event-dot" />
          <div>
            <strong>{eventTitle(event)}</strong>
            <p>{eventSummary(event)}</p>
          </div>
          <time>{formatTime(event.createdAt)}</time>
        </li>
      ))}
    </ol>
  )
}

export function ToolCards({ events, dense = false }: { events: ExecutionEvent[]; dense?: boolean }) {
  const [toolQuery, setToolQuery] = useState('')
  const [copiedPayload, setCopiedPayload] = useState<string | null>(null)
  const toolEvents = events.filter((event) => event.type.startsWith('tool.'))
  if (!toolEvents.length) {
    return <p className="muted-copy">当前任务没有工具调用，或 Hermes 没有暴露工具细节。</p>
  }

  const normalizedQuery = toolQuery.trim().toLowerCase()
  const completedCount = toolEvents.filter((event) => event.type === 'tool.completed').length
  const failedCount = toolEvents.filter((event) => event.isError).length
  const filteredEvents = normalizedQuery
    ? toolEvents.filter((event) => toolSearchText(event).includes(normalizedQuery))
    : toolEvents
  const visibleEvents = filteredEvents.slice(dense ? -14 : -8)

  async function handleCopy(key: string, value: unknown) {
    await copyToClipboard(payloadText(value))
    setCopiedPayload(key)
    window.setTimeout(() => setCopiedPayload((current) => (current === key ? null : current)), 1500)
  }

  return (
    <div className="tool-card-list">
      <div className="tool-toolbar">
        <label className="tool-filter">
          <Search size={13} />
          <input value={toolQuery} onChange={(event) => setToolQuery(event.target.value)} placeholder="过滤工具" />
        </label>
        <div className="tool-summary-strip">
          <span>{normalizedQuery ? `${filteredEvents.length}/${toolEvents.length}` : `${toolEvents.length} 条事件`}</span>
          <span>{completedCount} 次完成</span>
          {failedCount > 0 && <span className="danger-text">{failedCount} 次异常</span>}
        </div>
      </div>
      {!visibleEvents.length && <p className="muted-copy">没有匹配的工具事件。</p>}
      {visibleEvents.map((event) => (
        <article className={event.isError ? 'tool-card failed' : 'tool-card'} key={event.id}>
          <div className="tool-card-head">
            <Wrench size={14} />
            <strong title={toolDisplayName(event)}>{toolDisplayName(event)}</strong>
            <span>{toolPhaseLabel(event)}</span>
          </div>
          {toolPrimaryText(event) && <p>{toolPrimaryText(event)}</p>}
          <details className="tool-detail">
            <summary>
              <ChevronDown size={13} />
              参数与返回
            </summary>
            <div className="tool-detail-body">
              {toolPayloadSections(event).map((section) => (
                <div className="tool-payload" key={section.label}>
                  <div className="tool-payload-head">
                    <span>{section.label}</span>
                    <button
                      type="button"
                      title={`复制 ${section.label}`}
                      onClick={() => void handleCopy(`${event.id}-${section.label}`, section.value)}
                    >
                      {copiedPayload === `${event.id}-${section.label}` ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                  <pre>{stringifyPreview(section.value, dense ? 1800 : 900)}</pre>
                </div>
              ))}
            </div>
          </details>
        </article>
      ))}
    </div>
  )
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

function toolDisplayName(event: ExecutionEvent) {
  if (event.name) return String(event.name)
  if (Array.isArray(event.args)) {
    const [, maybeName] = event.args
    if (typeof maybeName === 'string' && maybeName.trim()) return maybeName
    const [kind] = event.args
    if (typeof kind === 'string' && kind.trim()) return kind
  }
  return event.type
}

function toolPhaseLabel(event: ExecutionEvent) {
  if (event.type === 'tool.started') return '开始'
  if (event.type === 'tool.completed') return event.isError ? '异常' : '完成'
  if (event.type === 'tool.progress') return '进度'
  return event.type.replace('tool.', '')
}

function toolPrimaryText(event: ExecutionEvent) {
  if (typeof event.summary === 'string' && event.summary.trim()) return event.summary
  if (typeof event.message === 'string' && event.message.trim()) return event.message
  if (typeof event.text === 'string' && event.text.trim()) return event.text
  if (Array.isArray(event.args) && typeof event.args[2] === 'string' && event.args[2].trim()) return event.args[2]
  if (typeof event.result === 'string' && event.result.trim()) return event.result.slice(0, 180)
  if (typeof event.error === 'string' && event.error.trim()) return event.error
  return ''
}

function toolSearchText(event: ExecutionEvent) {
  return [
    toolDisplayName(event),
    toolPhaseLabel(event),
    toolPrimaryText(event),
    ...toolPayloadSections(event).map((section) => payloadText(section.value))
  ]
    .join('\n')
    .toLowerCase()
}

function toolPayloadSections(event: ExecutionEvent) {
  const sections: { label: string; value: unknown }[] = []
  if (event.args !== undefined) sections.push({ label: 'args', value: event.args })
  if (event.kwargs !== undefined) sections.push({ label: 'kwargs', value: event.kwargs })
  if (event.result !== undefined) sections.push({ label: 'result', value: event.result })
  if (event.error !== undefined) sections.push({ label: 'error', value: event.error })
  if (!sections.length) sections.push({ label: 'event', value: event })
  return sections
}

function payloadText(value: unknown) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function eventTitle(event: ExecutionEvent) {
  if (event.type === 'bridge.started') return '桥接已启动'
  if (event.type === 'step') return `第 ${event.iteration ?? '?'} 轮推理`
  if (event.type === 'thinking') return '思考中'
  if (event.type === 'status') return `状态：${event.kind ?? '运行'}`
  if (event.type === 'tool.started') return `开始工具：${event.name ?? 'tool'}`
  if (event.type === 'tool.completed') return `完成工具：${event.name ?? 'tool'}`
  if (event.type === 'artifact.created') return `生成产物：${event.name ?? '文件'}`
  if (event.type === 'approval.request') return '等待命令确认'
  if (event.type === 'approval.resolved') return event.choice === 'deny' ? '已拒绝命令' : '已确认命令'
  if (event.type === 'task.completed') return '任务完成'
  if (event.type === 'task.failed') return '任务失败'
  return event.type
}

function eventSummary(event: ExecutionEvent) {
  if (event.type === 'bridge.started') return String(event.cwd ?? '授权工作区')
  if (event.type === 'step') return `${Array.isArray(event.previousTools) ? event.previousTools.length : 0} 个上一轮工具结果`
  if (event.type === 'thinking') return String(event.message || 'Hermes 正在处理')
  if (event.type === 'status') return String(event.message ?? '')
  if (event.type === 'tool.started') return stringifyPreview(event.args, 120)
  if (event.type === 'tool.completed') return event.isError ? '工具返回错误' : String(event.result ?? '工具执行完成').slice(0, 140)
  if (event.type === 'artifact.created') return String(event.summary ?? event.relativePath ?? '文件已加入产物区')
  if (event.type === 'approval.request') return String(event.command ?? event.summary ?? 'Hermes 请求执行命令')
  if (event.type === 'approval.resolved') return String(event.summary ?? '命令审批已处理')
  if (event.type === 'task.completed') return 'Hermes 已返回最终结果'
  if (event.type === 'task.failed') return String(event.error ?? 'Hermes 执行失败')
  return stringifyPreview(event, 140)
}

function stringifyPreview(value: unknown, limit = 260) {
  let text: string
  if (typeof value === 'string') {
    text = value
  } else {
    try {
      text = JSON.stringify(value, null, 2)
    } catch {
      text = String(value)
    }
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}
