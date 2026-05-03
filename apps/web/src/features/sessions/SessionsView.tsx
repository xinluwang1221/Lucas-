import { Bot, Clock3, Link2, Loader2, MessageSquareText, RefreshCw, Search, Wrench } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { HermesSessionDetailResponse, HermesSessionSummary, Task } from '../../lib/api'
import { MarkdownContent } from '../markdown/MarkdownContent'
import { getHermesSessionDetail } from '../settings/runtimeApi'

export function SessionsView({
  sessions,
  tasks,
  onRefresh,
  onOpenTask
}: {
  sessions: HermesSessionSummary[]
  tasks: Task[]
  onRefresh: () => void
  onOpenTask: (task: Task) => void
}) {
  const [query, setQuery] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(sessions[0]?.id ?? null)
  const [detail, setDetail] = useState<HermesSessionDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const filteredSessions = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return sessions
    return sessions.filter((session) => {
      const target = [
        session.title,
        session.preview,
        session.id,
        session.model,
        session.provider,
        session.platform,
        session.linkedTaskTitle,
        ...session.tools
      ].filter(Boolean).join(' ').toLowerCase()
      return target.includes(keyword)
    })
  }, [query, sessions])

  const linkedTaskCount = useMemo(
    () => new Set(sessions.flatMap((session) => session.linkedTaskIds)).size,
    [sessions]
  )

  const selectedSummary = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions]
  )

  const linkedTasks = useMemo(() => {
    const linkedIds = detail?.session.linkedTaskIds ?? selectedSummary?.linkedTaskIds ?? []
    const linked = new Set(linkedIds)
    return tasks.filter((task) => linked.has(task.id))
  }, [detail, selectedSummary, tasks])

  useEffect(() => {
    if (selectedSessionId && sessions.some((session) => session.id === selectedSessionId)) return
    setSelectedSessionId(sessions[0]?.id ?? null)
  }, [selectedSessionId, sessions])

  useEffect(() => {
    if (!selectedSessionId) {
      setDetail(null)
      return undefined
    }

    let alive = true
    setDetailLoading(true)
    setDetailError(null)
    getHermesSessionDetail(selectedSessionId)
      .then((nextDetail) => {
        if (alive) setDetail(nextDetail)
      })
      .catch((cause) => {
        if (alive) {
          setDetail(null)
          setDetailError(cause instanceof Error ? cause.message : String(cause))
        }
      })
      .finally(() => {
        if (alive) setDetailLoading(false)
      })

    return () => {
      alive = false
    }
  }, [selectedSessionId])

  const lastUpdated = sessions[0]?.updatedAt

  return (
    <section className="sessions-page">
      <header className="sessions-header">
        <div>
          <p className="eyebrow">Hermes 原生会话</p>
          <h1>会话</h1>
          <p>浏览 Hermes 保存的真实会话、消息、模型和 Cowork 任务关联。</p>
        </div>
        <button type="button" className="ghost-button" onClick={onRefresh}>
          <RefreshCw size={16} />
          刷新
        </button>
      </header>

      <div className="sessions-metrics" aria-label="Hermes 会话概览">
        <MetricCard label="原生会话" value={sessions.length.toString()} />
        <MetricCard label="已关联 Cowork 任务" value={linkedTaskCount.toString()} />
        <MetricCard label="最近更新" value={lastUpdated ? formatRelativeDate(lastUpdated) : '暂无'} />
      </div>

      <div className="sessions-toolbar">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索会话、模型、任务或工具"
        />
      </div>

      <div className="sessions-browser">
        <aside className="sessions-list-panel">
          <div className="sessions-list-head">
            <strong>{filteredSessions.length} 个会话</strong>
            <span>来自本机 Hermes session 存储</span>
          </div>

          <div className="sessions-list">
            {filteredSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className={session.id === selectedSessionId ? 'session-row active' : 'session-row'}
                onClick={() => setSelectedSessionId(session.id)}
              >
                <span className="session-row-icon">
                  <MessageSquareText size={16} />
                </span>
                <span className="session-row-body">
                  <strong>{session.linkedTaskTitle ?? session.title}</strong>
                  <span>{session.preview ?? '暂无消息预览'}</span>
                  <em>
                    {formatRelativeDate(session.updatedAt)} · {session.messageCount} 条消息
                    {session.model ? ` · ${session.model}` : ''}
                  </em>
                </span>
              </button>
            ))}

            {!filteredSessions.length && (
              <div className="sessions-empty">
                <MessageSquareText size={22} />
                <strong>没有匹配的会话</strong>
                <span>换一个关键词，或刷新后再看。</span>
              </div>
            )}
          </div>
        </aside>

        <section className="session-detail-panel">
          {!selectedSessionId ? (
            <div className="sessions-empty large">
              <MessageSquareText size={24} />
              <strong>还没有可读取的 Hermes 会话</strong>
              <span>完成一次 Hermes 对话后，这里会显示原生历史。</span>
            </div>
          ) : detailLoading ? (
            <div className="sessions-empty large">
              <Loader2 size={24} className="spin" />
              <strong>正在读取会话</strong>
              <span>从本机 Hermes session 文件加载消息。</span>
            </div>
          ) : detailError ? (
            <div className="sessions-empty large error">
              <MessageSquareText size={24} />
              <strong>读取失败</strong>
              <span>{detailError}</span>
            </div>
          ) : detail ? (
            <SessionDetail
              detail={detail}
              linkedTasks={linkedTasks}
              onOpenTask={onOpenTask}
            />
          ) : null}
        </section>
      </div>
    </section>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="sessions-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function SessionDetail({
  detail,
  linkedTasks,
  onOpenTask
}: {
  detail: HermesSessionDetailResponse
  linkedTasks: Task[]
  onOpenTask: (task: Task) => void
}) {
  const session = detail.session
  const toolText = session.tools.length ? session.tools.join('、') : '暂无工具记录'

  return (
    <>
      <header className="session-detail-head">
        <div>
          <p className="eyebrow">Session</p>
          <h2>{session.linkedTaskTitle ?? session.title}</h2>
          <span>{session.id}</span>
        </div>
        {linkedTasks[0] && (
          <button type="button" className="ghost-button" onClick={() => onOpenTask(linkedTasks[0])}>
            <Link2 size={15} />
            打开关联任务
          </button>
        )}
      </header>

      <div className="session-detail-grid">
        <InfoItem icon={<Bot size={15} />} label="模型" value={session.model ?? '未记录'} />
        <InfoItem icon={<Clock3 size={15} />} label="更新时间" value={formatDateTime(session.updatedAt)} />
        <InfoItem icon={<MessageSquareText size={15} />} label="消息" value={`${session.messageCount} 条`} />
        <InfoItem icon={<Wrench size={15} />} label="工具" value={toolText} />
      </div>

      {linkedTasks.length > 0 && (
        <div className="session-linked-tasks">
          <strong>关联 Cowork 任务</strong>
          <div>
            {linkedTasks.map((task) => (
              <button key={task.id} type="button" onClick={() => onOpenTask(task)}>
                {task.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="session-message-list">
        {detail.messages.map((message) => (
          <article key={message.id} className={`session-message ${message.role}`}>
            <header>
              <strong>{roleLabel(message.role)}</strong>
              {message.createdAt && <span>{formatDateTime(message.createdAt)}</span>}
            </header>
            {message.reasoning && (
              <details>
                <summary>推理记录</summary>
                <p>{message.reasoning}</p>
              </details>
            )}
            <MarkdownContent source={message.content} emptyText="空消息" />
          </article>
        ))}
        {!detail.messages.length && (
          <div className="sessions-empty">
            <MessageSquareText size={20} />
            <strong>这个会话没有可显示的消息</strong>
          </div>
        )}
      </div>
    </>
  )
}

function InfoItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="session-info-item">
      <span>{icon}</span>
      <div>
        <em>{label}</em>
        <strong title={value}>{value}</strong>
      </div>
    </div>
  )
}

function roleLabel(role: string) {
  if (role === 'user') return '你'
  if (role === 'assistant') return 'Hermes'
  if (role === 'tool') return '工具'
  return '系统'
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function formatRelativeDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  const diffMs = Date.now() - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < hour) return `${Math.max(1, Math.round(diffMs / minute))} 分钟前`
  if (diffMs < day) return `${Math.round(diffMs / hour)} 小时前`
  if (diffMs < 7 * day) return `${Math.round(diffMs / day)} 天前`
  return formatDateTime(value)
}
