import { Bot, Check, Clock3, Database, Filter, Link2, Loader2, MessageSquareText, Pencil, RefreshCw, Search, Trash2, Wrench, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { HermesSessionDetailResponse, HermesSessionSearchHit, HermesSessionSearchState, HermesSessionSummary, Task } from '../../lib/api'
import { MarkdownContent } from '../markdown/MarkdownContent'
import { continueHermesSession, deleteHermesSession, getHermesSessionDetail, getHermesSessions, renameHermesSession } from '../settings/runtimeApi'

type ActiveSearchHit = HermesSessionSearchHit & { sessionId: string }

export function SessionsView({
  sessions,
  tasks,
  selectedWorkspaceId,
  onRefresh,
  onOpenTask
}: {
  sessions: HermesSessionSummary[]
  tasks: Task[]
  selectedWorkspaceId?: string
  onRefresh: () => void
  onOpenTask: (task: Task) => void
}) {
  const [query, setQuery] = useState('')
  const [selectedPlatform, setSelectedPlatform] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [searchResult, setSearchResult] = useState<HermesSessionSummary[] | null>(null)
  const [searchMeta, setSearchMeta] = useState<HermesSessionSearchState | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchRefreshKey, setSearchRefreshKey] = useState(0)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(sessions[0]?.id ?? null)
  const [activeSearchHit, setActiveSearchHit] = useState<ActiveSearchHit | null>(null)
  const [expandedSearchSessionIds, setExpandedSearchSessionIds] = useState<Set<string>>(() => new Set())
  const [detail, setDetail] = useState<HermesSessionDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [deletedSessionIds, setDeletedSessionIds] = useState<Set<string>>(() => new Set())

  const hasQuery = Boolean(query.trim())
  const baseSessions = useMemo(
    () => (hasQuery ? (searchResult ?? []) : sessions).filter((session) => !deletedSessionIds.has(session.id)),
    [deletedSessionIds, hasQuery, searchResult, sessions]
  )

  const platformOptions = useMemo(
    () => uniqueOptions(sessions.map((session) => session.platform).filter(Boolean) as string[]),
    [sessions]
  )
  const modelOptions = useMemo(
    () => uniqueOptions(sessions.map((session) => session.model).filter(Boolean) as string[]),
    [sessions]
  )

  const filteredSessions = useMemo(
    () => baseSessions.filter((session) => {
      if (selectedPlatform && session.platform !== selectedPlatform) return false
      if (selectedModel && session.model !== selectedModel) return false
      return true
    }),
    [baseSessions, selectedModel, selectedPlatform]
  )

  const linkedTaskCount = useMemo(
    () => new Set(sessions.flatMap((session) => session.linkedTaskIds)).size,
    [sessions]
  )

  const selectedSummary = useMemo(
    () => filteredSessions.find((session) => session.id === selectedSessionId) ?? sessions.find((session) => session.id === selectedSessionId && !deletedSessionIds.has(session.id)) ?? null,
    [deletedSessionIds, filteredSessions, selectedSessionId, sessions]
  )

  const linkedTasks = useMemo(() => {
    const linkedIds = detail?.session.linkedTaskIds ?? selectedSummary?.linkedTaskIds ?? []
    const linked = new Set(linkedIds)
    return tasks.filter((task) => linked.has(task.id))
  }, [detail, selectedSummary, tasks])

  useEffect(() => {
    const keyword = query.trim()
    if (!keyword) {
      setSearchResult(null)
      setSearchMeta(null)
      setSearchError(null)
      setSearchLoading(false)
      setActiveSearchHit(null)
      setExpandedSearchSessionIds(new Set())
      return undefined
    }

    let alive = true
    setSearchLoading(true)
    setSearchError(null)
    getHermesSessions({ q: keyword, limit: 500 })
      .then((response) => {
        if (alive) {
          setSearchResult(response.sessions)
          setSearchMeta(response.search ?? null)
          setExpandedSearchSessionIds(new Set(response.sessions[0]?.searchMatches?.length ? [response.sessions[0].id] : []))
        }
      })
      .catch((cause) => {
        if (alive) {
          setSearchResult([])
          setSearchMeta(null)
          setSearchError(cause instanceof Error ? cause.message : String(cause))
        }
      })
      .finally(() => {
        if (alive) setSearchLoading(false)
      })

    return () => {
      alive = false
    }
  }, [query, searchRefreshKey])

  useEffect(() => {
    if (selectedSessionId && filteredSessions.some((session) => session.id === selectedSessionId)) return
    setActiveSearchHit(null)
    setSelectedSessionId(filteredSessions[0]?.id ?? null)
  }, [filteredSessions, selectedSessionId])

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
  const hasFilters = Boolean(query.trim() || selectedPlatform || selectedModel)

  function handleRefresh() {
    onRefresh()
    setSearchRefreshKey((value) => value + 1)
  }

  async function handleRenameSession(sessionId: string, title: string) {
    const result = await renameHermesSession(sessionId, title)
    setDetail(result.detail)
    setSearchResult((current) => current
      ? current.map((session) => session.id === sessionId ? result.detail.session : session)
      : current
    )
    setSearchRefreshKey((value) => value + 1)
    onRefresh()
  }

  async function handleDeleteSession(sessionId: string) {
    await deleteHermesSession(sessionId)
    setDeletedSessionIds((current) => new Set([...current, sessionId]))
    setSearchResult((current) => current ? current.filter((session) => session.id !== sessionId) : current)
    const nextSession = filteredSessions.find((session) => session.id !== sessionId)
    setDetail(null)
    setSelectedSessionId(nextSession?.id ?? null)
    setSearchRefreshKey((value) => value + 1)
    onRefresh()
  }

  async function handleContinueSession(sessionId: string) {
    const result = await continueHermesSession(sessionId, selectedWorkspaceId)
    onOpenTask(result.task)
    setSearchRefreshKey((value) => value + 1)
    onRefresh()
    return result.task
  }

  function clearFilters() {
    setQuery('')
    setSelectedPlatform('')
    setSelectedModel('')
    setSearchResult(null)
    setSearchMeta(null)
    setSearchError(null)
    setActiveSearchHit(null)
    setExpandedSearchSessionIds(new Set())
  }

  function selectSession(sessionId: string) {
    setSelectedSessionId(sessionId)
    setActiveSearchHit(null)
    const session = filteredSessions.find((item) => item.id === sessionId)
    if (hasQuery && session?.searchMatches?.length) {
      setExpandedSearchSessionIds((current) => new Set([...current, sessionId]))
    }
  }

  function toggleSearchResults(sessionId: string) {
    setExpandedSearchSessionIds((current) => {
      const next = new Set(current)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  function openSearchHit(session: HermesSessionSummary, hit: HermesSessionSearchHit) {
    setSelectedSessionId(session.id)
    setActiveSearchHit({ ...hit, sessionId: session.id })
    setExpandedSearchSessionIds((current) => new Set([...current, session.id]))
  }

  return (
    <section className="sessions-page">
      <header className="sessions-header">
        <div>
          <p className="eyebrow">Hermes 原生会话</p>
          <h1>会话</h1>
          <p>浏览 Hermes 保存的真实会话、消息、模型和 Cowork 任务关联。</p>
        </div>
        <button type="button" className="ghost-button" onClick={handleRefresh}>
          <RefreshCw size={16} />
          刷新
        </button>
      </header>

      <div className="sessions-metrics" aria-label="Hermes 会话概览">
        <MetricCard label="原生会话" value={sessions.length.toString()} />
        <MetricCard label="已关联 Cowork 任务" value={linkedTaskCount.toString()} />
        <MetricCard label="最近更新" value={lastUpdated ? formatRelativeDate(lastUpdated) : '暂无'} />
      </div>

      <div className="sessions-controls">
        <label className="sessions-search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索会话全文、模型、任务或工具"
          />
        </label>
        <label className="sessions-filter-field">
          <Filter size={14} />
          <select value={selectedPlatform} onChange={(event) => setSelectedPlatform(event.target.value)}>
            <option value="">全部来源</option>
            {platformOptions.map((platform) => (
              <option key={platform} value={platform}>{sourceLabel(platform)}</option>
            ))}
          </select>
        </label>
        <label className="sessions-filter-field">
          <Bot size={14} />
          <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
            <option value="">全部模型</option>
            {modelOptions.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </label>
        {hasFilters && (
          <button type="button" className="ghost-button compact" onClick={clearFilters}>
            <X size={15} />
            清除
          </button>
        )}
      </div>

      <div className="sessions-browser">
        <aside className="sessions-list-panel">
          <div className="sessions-list-head">
            <strong>{filteredSessions.length} 个会话</strong>
            <span>
              {hasQuery ? searchStatusText(searchMeta, searchLoading) : '来自本机 Hermes session 存储'}
            </span>
            {hasQuery && searchMeta?.sources.length ? (
              <div className="session-search-sources">
                {searchMeta.sources.map((source) => (
                  <span key={source.id} className={`session-search-source ${source.status}`} title={source.message}>
                    {source.label} · {searchSourceStatusLabel(source.status, source.matched)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="sessions-list">
            {searchError && (
              <div className="sessions-inline-error">
                搜索失败：{searchError}
              </div>
            )}
            {filteredSessions.map((session) => {
              const searchMatches = session.searchMatches ?? []
              const expanded = expandedSearchSessionIds.has(session.id)
              return (
                <div key={session.id} className={session.id === selectedSessionId ? 'session-list-entry active' : 'session-list-entry'}>
                  <button
                    type="button"
                    className={session.id === selectedSessionId ? 'session-row active' : 'session-row'}
                    onClick={() => selectSession(session.id)}
                  >
                    <span className="session-row-icon">
                      <MessageSquareText size={16} />
                    </span>
                    <span className="session-row-body">
                      <strong>{session.title}</strong>
                      <span>{session.preview ?? '暂无消息预览'}</span>
                      {searchMatches[0] && (
                        <span className="session-row-match">
                          命中：{searchMatches[0].snippet}
                        </span>
                      )}
                      <em>
                        {formatRelativeDate(session.updatedAt)} · {session.messageCount} 条消息
                        {session.model ? ` · ${session.model}` : ''}
                        {session.platform ? ` · ${sourceLabel(session.platform)}` : ''}
                        {session.linkedTaskTitle ? ` · 关联：${session.linkedTaskTitle}` : ''}
                      </em>
                    </span>
                  </button>
                  {hasQuery && searchMatches.length > 0 && (
                    <div className="session-row-search-results">
                      <button type="button" className="session-row-search-toggle" onClick={() => toggleSearchResults(session.id)}>
                        {expanded ? '收起命中' : `展开 ${searchMatches.length} 条命中`}
                      </button>
                      {expanded && (
                        <div className="session-row-hit-list">
                          {searchMatches.map((hit) => (
                            <button
                              key={`${hit.messageId}:${hit.snippet}`}
                              type="button"
                              className={activeSearchHit?.sessionId === session.id && activeSearchHit.messageId === hit.messageId ? 'session-row-hit active' : 'session-row-hit'}
                              onClick={() => openSearchHit(session, hit)}
                            >
                              <strong>{hit.source ? searchHitSourceLabel(hit.source) : '命中'} · {roleLabel(hit.role)}</strong>
                              <span>{hit.snippet}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {!filteredSessions.length && (
              <div className="sessions-empty">
                {searchLoading ? <Loader2 size={22} className="spin" /> : <MessageSquareText size={22} />}
                <strong>{searchLoading ? '正在搜索会话' : '没有匹配的会话'}</strong>
                <span>{searchLoading ? '正在读取本机 Hermes session 内容。' : '换一个关键词或清除筛选后再看。'}</span>
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
              <span>从本机 Hermes session 和官方 Dashboard 读取消息。</span>
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
              searchHits={selectedSummary?.searchMatches ?? []}
              activeSearchHit={activeSearchHit?.sessionId === detail.session.id ? activeSearchHit : null}
              searchQuery={query.trim()}
              onOpenTask={onOpenTask}
              onContinueSession={handleContinueSession}
              onRename={handleRenameSession}
              onDelete={handleDeleteSession}
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
  searchHits,
  activeSearchHit,
  searchQuery,
  onOpenTask,
  onContinueSession,
  onRename,
  onDelete
}: {
  detail: HermesSessionDetailResponse
  linkedTasks: Task[]
  searchHits: HermesSessionSearchHit[]
  activeSearchHit: ActiveSearchHit | null
  searchQuery: string
  onOpenTask: (task: Task) => void
  onContinueSession: (sessionId: string) => Promise<Task>
  onRename: (sessionId: string, title: string) => Promise<void>
  onDelete: (sessionId: string) => Promise<void>
}) {
  const session = detail.session
  const toolText = session.tools.length ? session.tools.join('、') : '暂无工具记录'
  const tokenText = formatTokenSummary(session)
  const statusText = session.isActive
    ? '进行中'
    : session.endedAt
      ? `已结束${session.endReason ? `：${session.endReason}` : ''}`
      : '未记录'
  const [isRenaming, setIsRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState(session.title)
  const [renameLoading, setRenameLoading] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [continueLoading, setContinueLoading] = useState(false)
  const [continueError, setContinueError] = useState<string | null>(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)

  useEffect(() => {
    if (!isRenaming) setTitleDraft(session.title)
  }, [isRenaming, session.id, session.title])

  useEffect(() => {
    setHighlightedMessageId(null)
  }, [session.id])

  useEffect(() => {
    if (activeSearchHit) focusSearchHit(activeSearchHit)
  }, [activeSearchHit, detail.messages, searchQuery])

  async function submitRename() {
    const nextTitle = titleDraft.trim()
    if (!nextTitle) {
      setRenameError('会话标题不能为空')
      return
    }
    setRenameLoading(true)
    setRenameError(null)
    try {
      await onRename(session.id, nextTitle)
      setIsRenaming(false)
    } catch (cause) {
      setRenameError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRenameLoading(false)
    }
  }

  function cancelRename() {
    setTitleDraft(session.title)
    setRenameError(null)
    setIsRenaming(false)
  }

  async function confirmDelete() {
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await onDelete(session.id)
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : String(cause))
      setDeleteLoading(false)
    }
  }

  async function continueSession() {
    setContinueLoading(true)
    setContinueError(null)
    try {
      await onContinueSession(session.id)
    } catch (cause) {
      setContinueError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setContinueLoading(false)
    }
  }

  function focusSearchHit(hit: HermesSessionSearchHit) {
    const targetId = findSearchHitMessageId(detail.messages, hit, searchQuery)
    if (!targetId) return
    setHighlightedMessageId(targetId)
    window.requestAnimationFrame(() => {
      document.getElementById(sessionMessageDomId(targetId))?.scrollIntoView({
        block: 'center',
        behavior: 'smooth'
      })
    })
  }

  return (
    <>
      <header className="session-detail-head">
        <div>
          <p className="eyebrow">Session</p>
          {isRenaming ? (
            <div className="session-title-edit">
              <input
                value={titleDraft}
                maxLength={100}
                autoFocus
                onChange={(event) => setTitleDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submitRename()
                  if (event.key === 'Escape') cancelRename()
                }}
                aria-label="会话标题"
              />
              <button type="button" onClick={submitRename} disabled={renameLoading}>
                {renameLoading ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
                保存
              </button>
              <button type="button" className="ghost-button compact" onClick={cancelRename} disabled={renameLoading}>
                <X size={15} />
                取消
              </button>
            </div>
          ) : (
            <div className="session-title-row">
              <h2>{session.title}</h2>
              <button type="button" className="icon-button" onClick={() => setIsRenaming(true)} aria-label="重命名会话" title="重命名会话">
                <Pencil size={15} />
              </button>
            </div>
          )}
          {renameError && <p className="session-rename-error">{renameError}</p>}
          <span>{session.id}</span>
        </div>
        <div className="session-detail-actions">
          <button type="button" className="ghost-button" onClick={continueSession} disabled={continueLoading}>
            {continueLoading ? <Loader2 size={15} className="spin" /> : <Link2 size={15} />}
            {linkedTasks[0] ? '打开关联任务' : '继续对话'}
          </button>
          <button type="button" className="ghost-button danger-lite" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 size={15} />
            删除
          </button>
        </div>
      </header>

      {continueError && <div className="sessions-inline-error">继续会话失败：{continueError}</div>}

      {deleteConfirmOpen && (
        <div className="session-delete-confirm">
          <div>
            <strong>删除这个 Hermes 原生会话？</strong>
            <p>会删除 Hermes 会话历史和本机 transcript 文件；不会删除工作区文件，也不会删除 Cowork 任务记录。删除前会保存一份本机备份。</p>
            {deleteError && <span>{deleteError}</span>}
          </div>
          <div>
            <button type="button" className="ghost-button" onClick={() => setDeleteConfirmOpen(false)} disabled={deleteLoading}>
              取消
            </button>
            <button type="button" className="danger-button" onClick={confirmDelete} disabled={deleteLoading}>
              {deleteLoading ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
              确认删除
            </button>
          </div>
        </div>
      )}

      <div className="session-detail-grid">
        <InfoItem icon={<Database size={15} />} label="数据来源" value={dataSourceLabel(session.dataSource, session.platform)} />
        <InfoItem icon={<Check size={15} />} label="状态" value={statusText} />
        <InfoItem icon={<Bot size={15} />} label="模型" value={session.model ?? '未记录'} />
        <InfoItem icon={<Clock3 size={15} />} label="更新时间" value={formatDateTime(session.updatedAt)} />
        <InfoItem icon={<MessageSquareText size={15} />} label="消息" value={`${session.messageCount} 条`} />
        <InfoItem icon={<Wrench size={15} />} label="工具" value={session.toolCallCount ? `${session.toolCallCount} 次 · ${toolText}` : toolText} />
        {tokenText && <InfoItem icon={<Bot size={15} />} label="Token" value={tokenText} />}
        {session.lineageRootId && <InfoItem icon={<Link2 size={15} />} label="压缩链" value={`来自 ${session.lineageRootId}`} />}
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

      {searchHits.length > 0 && (
        <div className="session-search-matches">
          <strong>搜索命中</strong>
          {searchHits.map((hit) => (
            <button
              key={`${hit.messageId}:${hit.snippet}`}
              type="button"
              className={highlightedMessageId && findSearchHitMessageId(detail.messages, hit, searchQuery) === highlightedMessageId ? 'active' : ''}
              onClick={() => focusSearchHit(hit)}
            >
              <span>{hit.source ? `${searchHitSourceLabel(hit.source)} · ` : ''}{roleLabel(hit.role)}</span>
              <em>{hit.snippet}</em>
            </button>
          ))}
        </div>
      )}

      <div className="session-message-list">
        {detail.messages.map((message) => (
          <article
            key={message.id}
            id={sessionMessageDomId(message.id)}
            className={`session-message ${message.role}${highlightedMessageId === message.id ? ' matched' : ''}`}
          >
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

function searchStatusText(search: HermesSessionSearchState | null, loading: boolean) {
  if (loading) return '正在搜索 Hermes 会话全文'
  if (!search?.sources.length) return '已搜索 Hermes 会话全文'
  const searched = search.sources.filter((source) => source.status === 'searched')
  const matched = searched.reduce((sum, source) => sum + source.matched, 0)
  const hasOfficial = searched.some((source) => source.id === 'official-dashboard')
  const sourceText = hasOfficial ? '本地与官方索引' : '本地 transcript'
  return `已搜索${sourceText} · ${matched} 个命中`
}

function searchSourceStatusLabel(status: 'searched' | 'unavailable' | 'error', matched: number) {
  if (status === 'searched') return `${matched} 个命中`
  if (status === 'unavailable') return '未运行'
  return '不可用'
}

function searchHitSourceLabel(source: NonNullable<HermesSessionSearchHit['source']>) {
  if (source === 'official-dashboard') return '官方索引'
  return '本地'
}

function findSearchHitMessageId(
  messages: HermesSessionDetailResponse['messages'],
  hit: HermesSessionSearchHit,
  query: string
) {
  if (messages.some((message) => message.id === hit.messageId)) return hit.messageId

  const candidates = messages.filter((message) => message.role === hit.role)
  const fallbackCandidates = candidates.length ? candidates : messages
  const snippetParts = normalizeSearchText(hit.snippet)
    .split(/\s*\.\.\.\s*|\s*…\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 6)
    .sort((a, b) => b.length - a.length)

  for (const part of snippetParts) {
    const matched = fallbackCandidates.find((message) => searchTextForMessage(message).includes(part))
    if (matched) return matched.id
  }

  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean)
  if (terms.length) {
    const matched = fallbackCandidates.find((message) => {
      const text = searchTextForMessage(message)
      return terms.every((term) => text.includes(term))
    })
    if (matched) return matched.id
  }

  return fallbackCandidates[0]?.id
}

function searchTextForMessage(message: HermesSessionDetailResponse['messages'][number]) {
  return normalizeSearchText([message.content, message.reasoning].filter(Boolean).join(' '))
}

function normalizeSearchText(value: string) {
  return value
    .replace(/>>>|<<<|<mark>|<\/mark>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function sessionMessageDomId(messageId: string) {
  return `session-message-${messageId.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

function sourceLabel(value: string) {
  if (value === 'cli') return '命令行'
  if (value === 'gateway') return 'Gateway'
  if (value === 'api') return 'API'
  if (value === 'discord') return 'Discord'
  if (value === 'telegram') return 'Telegram'
  if (value === 'slack') return 'Slack'
  return value
}

function dataSourceLabel(dataSource: HermesSessionSummary['dataSource'], platform?: string) {
  const platformText = platform ? sourceLabel(platform) : ''
  if (dataSource === 'merged') return platformText ? `Dashboard + transcript · ${platformText}` : 'Dashboard + transcript'
  if (dataSource === 'official-dashboard') return platformText ? `Hermes Dashboard · ${platformText}` : 'Hermes Dashboard'
  if (dataSource === 'local-transcript') return platformText ? `本地 transcript · ${platformText}` : '本地 transcript'
  return platformText || '未记录'
}

function formatTokenSummary(session: HermesSessionSummary) {
  if (session.totalTokens) return `${formatCompactNumber(session.totalTokens)} total`
  if (session.inputTokens || session.outputTokens) {
    return `${formatCompactNumber(session.inputTokens ?? 0)} in / ${formatCompactNumber(session.outputTokens ?? 0)} out`
  }
  return ''
}

function formatCompactNumber(value: number) {
  if (value >= 1000) return `${Math.round(value / 100) / 10}K`
  return value.toString()
}

function uniqueOptions(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
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
