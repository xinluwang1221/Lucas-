import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { requestHermesDashboardJson } from './hermes_dashboard.js'
import { dataDir, hermesAgentDir, hermesPythonBin } from './paths.js'
import type { AppState, Task } from './types.js'

const execFileAsync = promisify(execFile)

export type HermesSessionSummary = {
  id: string
  file: string
  filePath: string
  title: string
  preview?: string
  model?: string
  provider?: string
  platform?: string
  dataSource?: 'local-transcript' | 'official-dashboard' | 'merged'
  baseUrl?: string
  tools: string[]
  messageCount: number
  toolCallCount?: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  startedAt: string
  updatedAt: string
  lastActiveAt?: string
  endedAt?: string
  endReason?: string
  lineageRootId?: string
  isActive?: boolean
  linkedTaskIds: string[]
  linkedTaskTitle?: string
  linkedWorkspaceIds: string[]
  searchMatches?: HermesSessionSearchHit[]
}

export type HermesSessionSearchHit = {
  messageId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  snippet: string
  source?: 'local-transcript' | 'official-dashboard'
}

export type HermesSessionSearchState = {
  query: string
  sources: HermesSessionSearchSource[]
}

export type HermesSessionSearchSource = {
  id: 'local-transcript' | 'official-dashboard'
  label: string
  status: 'searched' | 'unavailable' | 'error'
  matched: number
  message?: string
}

export type HermesSessionMessage = {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  reasoning?: string
  finishReason?: string
  createdAt?: string
}

export type HermesSessionDetail = {
  sessionsDir: string
  session: HermesSessionSummary
  messages: HermesSessionMessage[]
  updatedAt: string
}

export type RenameHermesSessionResult = {
  sessionId: string
  title: string
  detail: HermesSessionDetail
  updatedAt: string
}

export type DeleteHermesSessionResult = {
  sessionId: string
  deleted: true
  backupPath?: string
  transcriptFilesDeleted: number
  databaseDeleted: boolean
  updatedAt: string
}

export type HermesSessionsResponse = {
  sessionsDir: string
  sessions: HermesSessionSummary[]
  total: number
  query?: string
  search?: HermesSessionSearchState
  updatedAt: string
}

export type ReadHermesSessionsOptions = {
  query?: string
  limit?: number
  sessionsDir?: string
  hermesHome?: string
  titleOverrides?: Map<string, string>
  includeOfficial?: boolean
  dashboardStart?: boolean
}

type HermesSessionRaw = Record<string, unknown>
type OfficialDashboardSession = Record<string, unknown>
type OfficialDashboardMessage = Record<string, unknown>
type OfficialSearchHit = {
  sessionId: string
  messageId?: string
  snippet: string
  role?: HermesSessionSearchHit['role']
}

type OfficialDashboardSessionsResult = {
  sessions: OfficialDashboardSession[]
  total?: number
  searchHits: OfficialSearchHit[]
  searchStatus: 'not-requested' | 'searched' | 'error'
  searchError?: string
}

export function readHermesSessions(state: AppState, options: ReadHermesSessionsOptions = {}): HermesSessionsResponse {
  const sessionsDir = resolveHermesSessionsDir(options.sessionsDir)
  const linkedTasks = buildLinkedTasks(state.tasks)
  const titleOverrides = resolveHermesSessionTitleOverrides(options)

  if (!fs.existsSync(sessionsDir)) {
    const query = normalizeQuery(options.query)
    return {
      sessionsDir,
      sessions: [],
      total: 0,
      query,
      search: query ? buildSearchState(query, [localSearchSource('unavailable', 0, 'Hermes session 目录不存在。')]) : undefined,
      updatedAt: new Date().toISOString()
    }
  }

  const query = normalizeQuery(options.query)
  const allSessions = fs
    .readdirSync(sessionsDir)
    .filter((file) => /^session_.+\.json$/.test(file))
    .flatMap((file) => {
      const fullPath = path.join(sessionsDir, file)
      try {
        const raw = readJsonFile(fullPath)
        const summary = toHermesSessionSummary(raw, file, fullPath, linkedTasks, titleOverrides)
        if (!query) return [summary]

        const searchMatches = findSessionSearchMatches(raw, summary.id, query)
        if (!matchesSessionQuery(summary, query) && !searchMatches.length) return []
        return [{
          ...summary,
          searchMatches
        }]
      } catch {
        return []
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const safeLimit = Number.isFinite(options.limit) && options.limit && options.limit > 0
    ? Math.min(Math.floor(options.limit), 500)
    : 200

  return {
    sessionsDir,
    sessions: allSessions.slice(0, safeLimit),
    total: allSessions.length,
    query,
    search: query ? buildSearchState(query, [localSearchSource('searched', allSessions.length)]) : undefined,
    updatedAt: new Date().toISOString()
  }
}

export async function readHermesSessionsWithOfficial(
  state: AppState,
  options: ReadHermesSessionsOptions = {}
): Promise<HermesSessionsResponse> {
  const local = readHermesSessions(state, options)
  if (options.includeOfficial === false) return local

  let official: OfficialDashboardSessionsResult
  try {
    official = await readOfficialDashboardSessions(options)
  } catch (error) {
    const query = normalizeQuery(options.query)
    return query
      ? withOfficialSearchSource(local, officialSearchSource('unavailable', 0, dashboardUnavailableMessage(error)))
      : local
  }

  return mergeOfficialSessionList(local, official, state, options)
}

export function readHermesSessionDetail(
  state: AppState,
  sessionId: string,
  options: ReadHermesSessionsOptions = {}
): HermesSessionDetail | null {
  const sessionsDir = resolveHermesSessionsDir(options.sessionsDir)
  const target = findHermesSessionFile(sessionsDir, sessionId)
  if (!target) return null

  const raw = readJsonFile(target)
  const linkedTasks = buildLinkedTasks(state.tasks)
  const titleOverrides = resolveHermesSessionTitleOverrides(options)
  const session = toHermesSessionSummary(raw, path.basename(target), target, linkedTasks, titleOverrides)
  const updatedAt = session.updatedAt

  return {
    sessionsDir,
    session,
    messages: normalizeMessages(raw, session.id, updatedAt),
    updatedAt: new Date().toISOString()
  }
}

export async function readHermesSessionDetailWithOfficial(
  state: AppState,
  sessionId: string,
  options: ReadHermesSessionsOptions = {}
): Promise<HermesSessionDetail | null> {
  const local = readHermesSessionDetail(state, sessionId, options)
  if (options.includeOfficial === false) return local

  const official = await readOfficialDashboardSessionDetail(sessionId, options).catch(() => null)
  if (!official) return local

  const linkedTasks = buildLinkedTasks(state.tasks)
  const titleOverrides = resolveHermesSessionTitleOverrides(options)
  const officialSummary = toOfficialHermesSessionSummary(official.session, linkedTasks, titleOverrides)
  if (!officialSummary) return local

  if (!local) {
    return {
      sessionsDir: resolveHermesSessionsDir(options.sessionsDir),
      session: officialSummary,
      messages: normalizeOfficialMessages(official.messages, officialSummary.id),
      updatedAt: new Date().toISOString()
    }
  }

  return {
    ...local,
    session: mergeHermesSessionSummary(local.session, officialSummary),
    messages: official.messages.length
      ? normalizeOfficialMessages(official.messages, officialSummary.id, local.session.updatedAt)
      : local.messages,
    updatedAt: new Date().toISOString()
  }
}

export async function renameHermesSession(
  state: AppState,
  sessionId: string,
  title: string,
  options: ReadHermesSessionsOptions = {}
): Promise<RenameHermesSessionResult> {
  const nextTitle = String(title ?? '').trim()
  if (!nextTitle) throw new Error('会话标题不能为空')
  if (nextTitle.length > 100) throw new Error('会话标题最多 100 个字符')

  const sessionsDir = resolveHermesSessionsDir(options.sessionsDir)
  const target = findHermesSessionFile(sessionsDir, sessionId)
  if (!target) throw new Error('Hermes session not found')

  const payload = await runHermesSessionRename(normalizeSessionId(sessionId), nextTitle, options.hermesHome)
  if (!payload.ok || !payload.sessionId || !payload.title) {
    throw new Error(payload.error || 'Hermes session rename failed')
  }

  const titleOverrides = new Map(resolveHermesSessionTitleOverrides(options))
  titleOverrides.set(payload.sessionId, payload.title)
  const detail = readHermesSessionDetail(state, payload.sessionId, {
    ...options,
    sessionsDir,
    titleOverrides
  })
  if (!detail) throw new Error('Hermes session renamed, but Cowork could not reload it')

  return {
    sessionId: payload.sessionId,
    title: payload.title,
    detail,
    updatedAt: new Date().toISOString()
  }
}

export async function deleteHermesSession(
  sessionId: string,
  options: ReadHermesSessionsOptions = {}
): Promise<DeleteHermesSessionResult> {
  const sessionsDir = resolveHermesSessionsDir(options.sessionsDir)
  const target = findHermesSessionFile(sessionsDir, sessionId)
  if (!target) throw new Error('Hermes session not found')

  const payload = await runHermesSessionDelete(
    normalizeSessionId(sessionId),
    sessionsDir,
    options.hermesHome
  )
  if (!payload.ok || !payload.sessionId) {
    throw new Error(payload.error || 'Hermes session delete failed')
  }

  return {
    sessionId: payload.sessionId,
    deleted: true,
    backupPath: payload.backupPath,
    transcriptFilesDeleted: payload.transcriptFilesDeleted ?? 0,
    databaseDeleted: Boolean(payload.databaseDeleted),
    updatedAt: new Date().toISOString()
  }
}

export function resolveHermesSessionsDir(explicitDir?: string) {
  if (explicitDir) return explicitDir
  if (process.env.HERMES_COWORK_SESSIONS_DIR) return process.env.HERMES_COWORK_SESSIONS_DIR
  const hermesHome = process.env.HERMES_HOME || path.join(os.homedir(), '.hermes')
  return path.join(hermesHome, 'sessions')
}

export function resolveHermesHome(explicitHome?: string) {
  return explicitHome || process.env.HERMES_HOME || path.join(os.homedir(), '.hermes')
}

export function readHermesSessionTitleIndex(hermesHome = resolveHermesHome()) {
  const dbPath = path.join(hermesHome, 'state.db')
  if (!fs.existsSync(dbPath)) return new Map<string, string>()

  const script = `
import json
import os
import sqlite3
import sys

db_path = os.path.join(sys.argv[1], "state.db")
if not os.path.exists(db_path):
    print("{}")
    raise SystemExit(0)

conn = sqlite3.connect(db_path)
try:
    rows = conn.execute("select id, title from sessions where title is not null and trim(title) != ''").fetchall()
    print(json.dumps({row[0]: row[1] for row in rows}, ensure_ascii=False))
finally:
    conn.close()
`.trim()

  try {
    const output = execFileSync(hermesPythonBin, ['-c', script, hermesHome], {
      cwd: hermesAgentDir,
      env: buildHermesPythonEnv(hermesHome),
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1024 * 1024
    })
    const parsed = JSON.parse(output || '{}') as Record<string, unknown>
    return new Map(Object.entries(parsed).flatMap(([id, value]) => {
      const title = stringValue(value)
      return title ? [[id, title] as const] : []
    }))
  } catch {
    return new Map<string, string>()
  }
}

function resolveHermesSessionTitleOverrides(options: ReadHermesSessionsOptions) {
  if (options.titleOverrides) return options.titleOverrides
  if (options.sessionsDir) return new Map<string, string>()
  return readHermesSessionTitleIndex(options.hermesHome)
}

async function readOfficialDashboardSessions(
  options: ReadHermesSessionsOptions
): Promise<OfficialDashboardSessionsResult> {
  const safeLimit = Number.isFinite(options.limit) && options.limit && options.limit > 0
    ? Math.min(Math.floor(options.limit), 500)
    : 200
  const start = options.dashboardStart ?? false
  const listResult = await requestHermesDashboardJson(`/api/sessions?limit=${safeLimit}&offset=0`, {}, { start })
  if (!listResult.ok) throw new Error(`Hermes Dashboard sessions returned ${listResult.status}`)

  const { sessions, total } = extractOfficialSessions(listResult.body)
  const query = normalizeQuery(options.query)
  const search = query
    ? await readOfficialDashboardSessionSearch(query, safeLimit, start)
    : { hits: [], status: 'not-requested' as const }
  return {
    sessions,
    total,
    searchHits: search.hits,
    searchStatus: search.status,
    searchError: 'error' in search ? search.error : undefined
  }
}

async function readOfficialDashboardSessionSearch(query: string, limit: number, start: boolean) {
  try {
    const result = await requestHermesDashboardJson(
      `/api/sessions/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      {},
      { start }
    )
    if (!result.ok) {
      return {
        hits: [],
        status: 'error' as const,
        error: `Hermes Dashboard search returned ${result.status}`
      }
    }
    return { hits: extractOfficialSearchHits(result.body), status: 'searched' as const }
  } catch (error) {
    return { hits: [], status: 'error' as const, error: errorMessage(error) }
  }
}

async function readOfficialDashboardSessionDetail(
  sessionId: string,
  options: ReadHermesSessionsOptions
): Promise<{ session: OfficialDashboardSession; messages: OfficialDashboardMessage[] } | null> {
  const start = options.dashboardStart ?? false
  const normalized = normalizeSessionId(sessionId)
  const sessionResult = await requestHermesDashboardJson(`/api/sessions/${encodeURIComponent(normalized)}`, {}, { start })
  if (sessionResult.status === 404) return null
  if (!sessionResult.ok || !isRecord(sessionResult.body)) throw new Error(`Hermes Dashboard session detail returned ${sessionResult.status}`)

  const messagesResult = await requestHermesDashboardJson(`/api/sessions/${encodeURIComponent(normalized)}/messages`, {}, { start })
  const messages = messagesResult.ok ? extractOfficialMessages(messagesResult.body) : []
  return { session: sessionResult.body, messages }
}

function extractOfficialSessions(body: unknown) {
  if (Array.isArray(body)) return { sessions: body.filter(isRecord), total: body.length }
  if (!isRecord(body)) return { sessions: [], total: 0 }
  const sessions = Array.isArray(body.sessions) ? body.sessions.filter(isRecord) : []
  return { sessions, total: numberValue(body.total) ?? sessions.length }
}

function extractOfficialSearchHits(body: unknown): OfficialSearchHit[] {
  const rows = isRecord(body) && Array.isArray(body.results)
    ? body.results
    : Array.isArray(body)
      ? body
      : []
  return rows.flatMap((row) => {
    if (!isRecord(row)) return []
    const sessionId = normalizeSessionId(
      firstNonEmpty(
        stringValue(row.session_id),
        stringValue(row.sessionId),
        stringValue(row.id),
        ''
      )
    )
    if (!sessionId) return []
    return [{
      sessionId,
      messageId: idValue(row.message_id) ?? idValue(row.messageId) ?? idValue(row.message_db_id),
      snippet: stringValue(row.snippet) ?? '',
      role: normalizeRole(row.role)
    }]
  })
}

function extractOfficialMessages(body: unknown): OfficialDashboardMessage[] {
  if (Array.isArray(body)) return body.filter(isRecord)
  if (isRecord(body) && Array.isArray(body.messages)) return body.messages.filter(isRecord)
  return []
}

function mergeOfficialSessionList(
  local: HermesSessionsResponse,
  official: OfficialDashboardSessionsResult,
  state: AppState,
  options: ReadHermesSessionsOptions
): HermesSessionsResponse {
  const linkedTasks = buildLinkedTasks(state.tasks)
  const titleOverrides = resolveHermesSessionTitleOverrides(options)
  const query = normalizeQuery(options.query)
  const searchHits = new Map<string, OfficialSearchHit[]>()
  for (const hit of official.searchHits) {
    searchHits.set(hit.sessionId, [...(searchHits.get(hit.sessionId) ?? []), hit])
  }

  const byId = new Map<string, HermesSessionSummary>()
  for (const session of local.sessions) byId.set(session.id, session)

  for (const raw of official.sessions) {
    const summary = toOfficialHermesSessionSummary(raw, linkedTasks, titleOverrides)
    if (!summary) continue
    const hasSearchHit = searchHits.has(summary.id)
    if (query && !hasSearchHit && !matchesSessionQuery(summary, query)) continue
    const existing = byId.get(summary.id)
    byId.set(summary.id, existing ? mergeHermesSessionSummary(existing, summary) : summary)
  }

  for (const [sessionId, hits] of searchHits) {
    const existing = byId.get(sessionId)
    const matches = hits.map((hit, index) => ({
      messageId: hit.messageId ? `${sessionId}:dashboard:${hit.messageId}` : `${sessionId}:dashboard-search:${index}`,
      role: hit.role ?? 'assistant',
      snippet: hit.snippet,
      source: 'official-dashboard' as const
    }))
    if (existing) {
      byId.set(sessionId, {
        ...existing,
        searchMatches: mergeSearchMatches(existing.searchMatches, matches)
      })
      continue
    }
    if (!query) continue
    byId.set(sessionId, toOfficialSearchOnlySummary(sessionId, matches, linkedTasks))
  }

  const safeLimit = Number.isFinite(options.limit) && options.limit && options.limit > 0
    ? Math.min(Math.floor(options.limit), 500)
    : 200
  const sessions = [...byId.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, safeLimit)

  return {
    ...local,
    sessions,
    total: query ? sessions.length : Math.max(local.total, official.total ?? sessions.length, sessions.length),
    search: query
      ? mergeSearchState(local.search, officialSearchSource(
        official.searchStatus === 'searched' ? 'searched' : 'error',
        official.searchHits.length,
        official.searchError
      ))
      : local.search,
    updatedAt: new Date().toISOString()
  }
}

function toOfficialHermesSessionSummary(
  raw: OfficialDashboardSession,
  linkedTasks: Map<string, Task[]>,
  titleOverrides: Map<string, string>
): HermesSessionSummary | null {
  const id = normalizeSessionId(firstNonEmpty(stringValue(raw.id), stringValue(raw.session_id), ''))
  if (!id) return null

  const tasks = linkedTasks.get(id) ?? []
  const startedAt = normalizeHermesDate(raw.started_at) ?? normalizeHermesDate(raw.session_started) ?? new Date().toISOString()
  const lastActiveAt = normalizeHermesDate(raw.last_active)
  const endedAt = normalizeHermesDate(raw.ended_at)
  const updatedAt = lastActiveAt ?? endedAt ?? normalizeHermesDate(raw.updated_at) ?? startedAt
  const title = firstNonEmpty(
    titleOverrides.get(id),
    stringValue(raw.title),
    tasks[0]?.title,
    stringValue(raw.preview),
    id
  )

  return {
    id,
    file: `dashboard:${id}`,
    filePath: '',
    title: truncateText(title, 82),
    preview: truncateOptional(stringValue(raw.preview), 160),
    model: stringValue(raw.model),
    provider: stringValue(raw.provider),
    platform: stringValue(raw.source) ?? stringValue(raw.platform),
    dataSource: 'official-dashboard',
    baseUrl: stringValue(raw.base_url),
    tools: normalizeTools(raw.tools),
    messageCount: numberValue(raw.message_count) ?? 0,
    toolCallCount: numberValue(raw.tool_call_count),
    inputTokens: firstNumber(raw.input_tokens, raw.prompt_tokens, raw.total_input_tokens),
    outputTokens: firstNumber(raw.output_tokens, raw.completion_tokens, raw.total_output_tokens),
    totalTokens: firstNumber(raw.total_tokens, raw.token_count),
    startedAt,
    updatedAt,
    lastActiveAt,
    endedAt,
    endReason: stringValue(raw.end_reason),
    lineageRootId: stringValue(raw._lineage_root_id) ?? stringValue(raw.lineage_root_id),
    isActive: booleanValue(raw.is_active),
    linkedTaskIds: tasks.map((task) => task.id),
    linkedTaskTitle: tasks[0]?.title,
    linkedWorkspaceIds: [...new Set(tasks.map((task) => task.workspaceId))]
  }
}

function toOfficialSearchOnlySummary(
  sessionId: string,
  searchMatches: HermesSessionSearchHit[],
  linkedTasks: Map<string, Task[]>
): HermesSessionSummary {
  const tasks = linkedTasks.get(sessionId) ?? []
  const now = new Date().toISOString()
  return {
    id: sessionId,
    file: `dashboard:${sessionId}`,
    filePath: '',
    title: sessionId,
    preview: searchMatches[0]?.snippet,
    dataSource: 'official-dashboard',
    tools: [],
    messageCount: 0,
    startedAt: now,
    updatedAt: now,
    linkedTaskIds: tasks.map((task) => task.id),
    linkedTaskTitle: tasks[0]?.title,
    linkedWorkspaceIds: [...new Set(tasks.map((task) => task.workspaceId))],
    searchMatches
  }
}

function mergeHermesSessionSummary(
  local: HermesSessionSummary,
  official: HermesSessionSummary
): HermesSessionSummary {
  return {
    ...local,
    title: official.title || local.title,
    preview: official.preview || local.preview,
    model: official.model || local.model,
    provider: official.provider || local.provider,
    platform: official.platform || local.platform,
    baseUrl: official.baseUrl || local.baseUrl,
    dataSource: local.dataSource === 'official-dashboard' ? 'official-dashboard' : 'merged',
    tools: uniqueStrings([...local.tools, ...official.tools]),
    messageCount: official.messageCount || local.messageCount,
    toolCallCount: official.toolCallCount ?? local.toolCallCount,
    inputTokens: official.inputTokens ?? local.inputTokens,
    outputTokens: official.outputTokens ?? local.outputTokens,
    totalTokens: official.totalTokens ?? local.totalTokens,
    startedAt: official.startedAt || local.startedAt,
    updatedAt: laterIsoDate(local.updatedAt, official.updatedAt),
    lastActiveAt: official.lastActiveAt ?? local.lastActiveAt,
    endedAt: official.endedAt ?? local.endedAt,
    endReason: official.endReason ?? local.endReason,
    lineageRootId: official.lineageRootId ?? local.lineageRootId,
    isActive: official.isActive ?? local.isActive,
    searchMatches: mergeSearchMatches(local.searchMatches, official.searchMatches)
  }
}

function buildSearchState(query: string, sources: HermesSessionSearchSource[]): HermesSessionSearchState {
  return {
    query,
    sources: mergeSearchSources([], sources)
  }
}

function mergeSearchState(
  current: HermesSessionSearchState | undefined,
  nextSource: HermesSessionSearchSource
): HermesSessionSearchState {
  return {
    query: current?.query ?? '',
    sources: mergeSearchSources(current?.sources ?? [], [nextSource])
  }
}

function withOfficialSearchSource(
  response: HermesSessionsResponse,
  source: HermesSessionSearchSource
): HermesSessionsResponse {
  if (!response.query) return response
  return {
    ...response,
    search: mergeSearchState(response.search ?? buildSearchState(response.query, []), source)
  }
}

function mergeSearchSources(
  current: HermesSessionSearchSource[],
  next: HermesSessionSearchSource[]
) {
  const byId = new Map<string, HermesSessionSearchSource>()
  for (const source of [...current, ...next]) byId.set(source.id, source)
  return [...byId.values()]
}

function localSearchSource(
  status: HermesSessionSearchSource['status'],
  matched: number,
  message?: string
): HermesSessionSearchSource {
  return {
    id: 'local-transcript',
    label: '本地 transcript',
    status,
    matched,
    ...(message ? { message } : {})
  }
}

function officialSearchSource(
  status: HermesSessionSearchSource['status'],
  matched: number,
  message?: string
): HermesSessionSearchSource {
  return {
    id: 'official-dashboard',
    label: 'Hermes 官方全文索引',
    status,
    matched,
    ...(message ? { message } : {})
  }
}

function dashboardUnavailableMessage(error: unknown) {
  const message = errorMessage(error)
  if (/failed to fetch|fetch failed|connect|ECONNREFUSED|未启动/i.test(message)) return 'Hermes Dashboard 未运行，已使用本地 transcript 搜索。'
  return message
}

function normalizeOfficialMessages(
  messages: OfficialDashboardMessage[],
  sessionId: string,
  fallbackDate?: string
): HermesSessionMessage[] {
  return messages.flatMap((message, index) => {
    const content = cleanDisplayContent(contentValue(message.content))
    const reasoning = firstNonEmpty(
      contentValue(message.reasoning_content),
      contentValue(message.reasoning),
      undefined
    )
    const toolName = stringValue(message.tool_name)
    const displayContent = content || (toolName ? `工具调用：${toolName}` : '')
    if (!displayContent && !reasoning) return []
    return [{
      id: `${sessionId}:dashboard:${stringValue(message.id) ?? index}`,
      role: normalizeRole(message.role),
      content: displayContent,
      reasoning: reasoning || undefined,
      finishReason: stringValue(message.finish_reason),
      createdAt: normalizeHermesDate(message.timestamp) ?? normalizeHermesDate(message.created_at) ?? fallbackDate
    }]
  })
}

function readJsonFile(filePath: string): HermesSessionRaw {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as HermesSessionRaw
}

function buildLinkedTasks(tasks: Task[]) {
  const linkedTasks = new Map<string, Task[]>()
  for (const task of tasks) {
    if (!task.hermesSessionId) continue
    const key = normalizeSessionId(task.hermesSessionId)
    linkedTasks.set(key, [...(linkedTasks.get(key) ?? []), task])
  }
  return linkedTasks
}

function toHermesSessionSummary(
  raw: HermesSessionRaw,
  file: string,
  filePath: string,
  linkedTasks: Map<string, Task[]>,
  titleOverrides: Map<string, string> = new Map()
): HermesSessionSummary {
  const stat = fs.statSync(filePath)
  const id = normalizeSessionId(stringValue(raw.session_id) || file)
  const tasks = linkedTasks.get(id) ?? []
  const messages = Array.isArray(raw.messages) ? raw.messages : []
  const title = firstNonEmpty(
    titleOverrides.get(id),
    stringValue(raw.title),
    tasks[0]?.title,
    firstMessageContent(messages, 'user'),
    id
  )
  const preview = firstNonEmpty(
    firstMessageContent(messages, 'assistant'),
    firstMessageContent(messages, 'user'),
    undefined
  )

  return {
    id,
    file,
    filePath,
    title: truncateText(title, 82),
    preview: preview ? truncateText(preview, 160) : undefined,
    model: stringValue(raw.model),
    provider: stringValue(raw.provider),
    platform: stringValue(raw.platform),
    dataSource: 'local-transcript',
    baseUrl: stringValue(raw.base_url),
    tools: normalizeTools(raw.tools),
    messageCount: numberValue(raw.message_count) ?? messages.length,
    toolCallCount: numberValue(raw.tool_call_count),
    startedAt: normalizeHermesDate(raw.session_start) ?? stat.birthtime.toISOString(),
    updatedAt: normalizeHermesDate(raw.last_updated) ?? stat.mtime.toISOString(),
    linkedTaskIds: tasks.map((task) => task.id),
    linkedTaskTitle: tasks[0]?.title,
    linkedWorkspaceIds: [...new Set(tasks.map((task) => task.workspaceId))]
  }
}

async function runHermesSessionRename(sessionId: string, title: string, hermesHome = resolveHermesHome()) {
  const script = `
import json
import sys

hermes_agent_dir = sys.argv[1]
session_id = sys.argv[2]
title = sys.argv[3]

if hermes_agent_dir not in sys.path:
    sys.path.insert(0, hermes_agent_dir)

try:
    from hermes_state import SessionDB
    db = SessionDB()
    try:
        resolved_session_id = db.resolve_session_id(session_id) or session_id
        ok = db.set_session_title(resolved_session_id, title)
        print(json.dumps({
            "ok": bool(ok),
            "sessionId": resolved_session_id,
            "title": db.get_session_title(resolved_session_id),
        }, ensure_ascii=False))
    finally:
        db.close()
except Exception as exc:
    print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
    raise SystemExit(1)
`.trim()

  try {
    const { stdout } = await execFileAsync(hermesPythonBin, ['-c', script, hermesAgentDir, sessionId, title], {
      cwd: hermesAgentDir,
      env: buildHermesPythonEnv(hermesHome),
      timeout: 10000,
      maxBuffer: 1024 * 1024
    })
    return parseHermesRenamePayload(stdout)
  } catch (error) {
    const stdout = isRecord(error) ? stringValue(error.stdout) : undefined
    const parsed = stdout ? parseHermesRenamePayload(stdout) : undefined
    if (parsed?.error) throw new Error(parsed.error)
    throw error
  }
}

async function runHermesSessionDelete(
  sessionId: string,
  sessionsDir: string,
  hermesHome = resolveHermesHome()
) {
  const backupRoot = path.join(dataDir, 'backups', 'hermes-sessions')
  const script = `
import json
import shutil
import sys
import time
from pathlib import Path

hermes_agent_dir = sys.argv[1]
session_id = sys.argv[2]
sessions_dir = Path(sys.argv[3])
backup_root = Path(sys.argv[4])

if hermes_agent_dir not in sys.path:
    sys.path.insert(0, hermes_agent_dir)

def row_to_dict(row):
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}

def transcript_candidates(target_id):
    candidates = [
        sessions_dir / f"{target_id}.json",
        sessions_dir / f"{target_id}.jsonl",
        sessions_dir / f"session_{target_id}.json",
        sessions_dir / f"session_{target_id}.jsonl",
    ]
    try:
        candidates.extend(sessions_dir.glob(f"request_dump_{target_id}_*.json"))
        candidates.extend(sessions_dir.glob(f"request_dump_session_{target_id}_*.json"))
    except OSError:
        pass
    seen = set()
    unique = []
    for candidate in candidates:
        text = str(candidate)
        if text in seen:
            continue
        seen.add(text)
        unique.append(candidate)
    return unique

try:
    from hermes_state import SessionDB
    db = SessionDB()
    try:
        resolved_session_id = db.resolve_session_id(session_id) or session_id
        session_row = row_to_dict(db._conn.execute(
            "select * from sessions where id = ?",
            (resolved_session_id,),
        ).fetchone())
        message_rows = [
            row_to_dict(row)
            for row in db._conn.execute(
                "select * from messages where session_id = ? order by id",
                (resolved_session_id,),
            ).fetchall()
        ]
        files = [p for p in transcript_candidates(resolved_session_id) if p.exists()]
        if not session_row and not files:
            print(json.dumps({"ok": False, "error": "Session not found"}, ensure_ascii=False))
            raise SystemExit(1)

        safe_session_id = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in resolved_session_id)
        backup_dir = backup_root / f"{int(time.time())}_{safe_session_id}"
        backup_dir.mkdir(parents=True, exist_ok=True)
        (backup_dir / "session-db-export.json").write_text(json.dumps({
            "session": session_row,
            "messages": message_rows,
            "exportedAt": time.time(),
        }, ensure_ascii=False, indent=2), encoding="utf-8")

        backed_up_files = []
        for source in files:
            destination = backup_dir / source.name
            shutil.copy2(source, destination)
            backed_up_files.append(str(destination))

        database_deleted = False
        if session_row:
            database_deleted = bool(db.delete_session(resolved_session_id, sessions_dir=sessions_dir))

        transcript_deleted = 0
        for candidate in transcript_candidates(resolved_session_id):
            try:
                if candidate.exists():
                    candidate.unlink()
                    transcript_deleted += 1
            except OSError:
                pass

        print(json.dumps({
            "ok": bool(database_deleted or transcript_deleted or backed_up_files),
            "sessionId": resolved_session_id,
            "backupPath": str(backup_dir),
            "databaseDeleted": database_deleted,
            "transcriptFilesDeleted": transcript_deleted,
        }, ensure_ascii=False))
    finally:
        db.close()
except Exception as exc:
    print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
    raise SystemExit(1)
`.trim()

  try {
    const { stdout } = await execFileAsync(hermesPythonBin, ['-c', script, hermesAgentDir, sessionId, sessionsDir, backupRoot], {
      cwd: hermesAgentDir,
      env: buildHermesPythonEnv(hermesHome),
      timeout: 10000,
      maxBuffer: 1024 * 1024
    })
    return parseHermesDeletePayload(stdout)
  } catch (error) {
    const stdout = isRecord(error) ? stringValue(error.stdout) : undefined
    const parsed = stdout ? parseHermesDeletePayload(stdout) : undefined
    if (parsed?.error) throw new Error(parsed.error)
    throw error
  }
}

function parseHermesRenamePayload(stdout: string) {
  const lines = stdout.trim().split(/\n/).filter(Boolean)
  const lastLine = lines[lines.length - 1] ?? '{}'
  const parsed = JSON.parse(lastLine) as {
    ok?: boolean
    error?: string
    sessionId?: string
    title?: string
  }
  return parsed
}

function parseHermesDeletePayload(stdout: string) {
  const lines = stdout.trim().split(/\n/).filter(Boolean)
  const lastLine = lines[lines.length - 1] ?? '{}'
  const parsed = JSON.parse(lastLine) as {
    ok?: boolean
    error?: string
    sessionId?: string
    backupPath?: string
    databaseDeleted?: boolean
    transcriptFilesDeleted?: number
  }
  return parsed
}

function buildHermesPythonEnv(hermesHome: string) {
  return {
    ...process.env,
    HERMES_HOME: hermesHome,
    PYTHONPATH: process.env.PYTHONPATH
      ? `${hermesAgentDir}${path.delimiter}${process.env.PYTHONPATH}`
      : hermesAgentDir
  }
}

function normalizeMessages(raw: HermesSessionRaw, sessionId: string, fallbackDate?: string): HermesSessionMessage[] {
  const messages = Array.isArray(raw.messages) ? raw.messages : []
  return messages.flatMap((message, index) => {
    if (!isRecord(message)) return []
    const content = cleanDisplayContent(contentValue(message.content))
    const reasoning = firstNonEmpty(
      contentValue(message.reasoning_content),
      contentValue(message.reasoning),
      undefined
    )
    if (!content && !reasoning) return []
    return [{
      id: `${sessionId}:${index}`,
      role: normalizeRole(message.role),
      content,
      reasoning: reasoning || undefined,
      finishReason: stringValue(message.finish_reason),
      createdAt: normalizeHermesDate(message.created_at) ?? fallbackDate
    }]
  })
}

function findHermesSessionFile(sessionsDir: string, sessionId: string) {
  if (!fs.existsSync(sessionsDir)) return null
  const normalized = normalizeSessionId(sessionId)
  const candidates = [
    path.join(sessionsDir, `${normalized}.json`),
    path.join(sessionsDir, `session_${normalized}.json`),
    path.join(sessionsDir, sessionId.endsWith('.json') ? sessionId : `${sessionId}.json`)
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

function matchesSessionQuery(session: HermesSessionSummary, query: string | undefined) {
  if (!query) return true
  const haystack = [
    session.id,
    session.file,
    session.title,
    session.preview,
    session.model,
    session.provider,
    session.platform,
    session.linkedTaskTitle,
    ...session.tools
  ].filter(Boolean).join(' ').toLowerCase()
  return textMatchesQuery(haystack, query)
}

function findSessionSearchMatches(raw: HermesSessionRaw, sessionId: string, query: string) {
  return normalizeMessages(raw, sessionId)
    .flatMap((message) => {
      const target = [message.content, message.reasoning].filter(Boolean).join('\n')
      if (!textMatchesQuery(target, query)) return []
      return [{
        messageId: message.id,
        role: message.role,
        snippet: buildSearchSnippet(target, query),
        source: 'local-transcript' as const
      }]
    })
    .slice(0, 3)
}

function textMatchesQuery(value: string, query: string) {
  const haystack = value.toLowerCase()
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  return terms.every((term) => haystack.includes(term))
}

function buildSearchSnippet(value: string, query: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  const firstTerm = query.toLowerCase().split(/\s+/).find(Boolean) ?? query.toLowerCase()
  const index = normalized.toLowerCase().indexOf(firstTerm)
  if (index === -1) return truncateText(normalized, 120)
  const start = Math.max(0, index - 42)
  const end = Math.min(normalized.length, index + firstTerm.length + 72)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < normalized.length ? '…' : ''
  return `${prefix}${normalized.slice(start, end)}${suffix}`
}

export function normalizeHermesSessionId(value: string) {
  return value.replace(/\.json$/, '').replace(/^session_/, '')
}

function normalizeSessionId(value: string) {
  return normalizeHermesSessionId(value)
}

function normalizeQuery(value: unknown) {
  const query = String(value ?? '').trim()
  return query || undefined
}

function normalizeRole(value: unknown): HermesSessionMessage['role'] {
  if (value === 'user' || value === 'assistant' || value === 'system' || value === 'tool') return value
  return 'system'
}

function normalizeTools(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((tool) => {
    if (typeof tool === 'string') return [tool]
    if (isRecord(tool)) {
      return [firstNonEmpty(stringValue(tool.name), stringValue(tool.id), stringValue(tool.function), undefined)]
        .filter((name): name is string => Boolean(name))
    }
    return []
  }).slice(0, 30)
}

function firstMessageContent(messages: unknown[], role: 'user' | 'assistant') {
  for (const message of messages) {
    if (!isRecord(message) || message.role !== role) continue
    const content = cleanDisplayContent(contentValue(message.content))
    if (content) return content
  }
  return undefined
}

function contentValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!value) return ''
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') return item
      if (isRecord(item)) return stringValue(item.text) || stringValue(item.content) || ''
      return ''
    }).filter(Boolean).join('\n').trim()
  }
  if (isRecord(value)) {
    return stringValue(value.text) || stringValue(value.content) || JSON.stringify(value)
  }
  return String(value)
}

function cleanDisplayContent(value: string) {
  let text = value.trim()
  if (text.startsWith('[Hermes Cowork 工作区提示：')) {
    const closingIndex = text.indexOf(']\n')
    if (closingIndex !== -1) {
      text = text.slice(closingIndex + 1).trim()
    } else {
      text = text.replace(/^\[Hermes Cowork 工作区提示：[^\]]+\]\s*/, '').trim()
    }
  }
  return text
}

function stringValue(value: unknown) {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text || undefined
}

function idValue(value: unknown) {
  if (typeof value === 'string') return stringValue(value)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = numberValue(value)
    if (parsed !== undefined) return parsed
  }
  return undefined
}

function booleanValue(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'off'].includes(normalized)) return false
  }
  return undefined
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim())?.trim() ?? ''
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1)}…`
}

function truncateOptional(value: string | undefined, maxLength: number) {
  return value ? truncateText(value, maxLength) : undefined
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function mergeSearchMatches(
  first: HermesSessionSearchHit[] | undefined,
  second: HermesSessionSearchHit[] | undefined
) {
  const seen = new Set<string>()
  return [...(first ?? []), ...(second ?? [])].filter((match) => {
    const key = `${match.messageId}:${match.snippet}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 5)
}

function laterIsoDate(first: string, second: string) {
  const firstTime = new Date(first).getTime()
  const secondTime = new Date(second).getTime()
  if (!Number.isFinite(firstTime)) return second
  if (!Number.isFinite(secondTime)) return first
  return secondTime > firstTime ? second : first
}

function normalizeHermesDate(value: unknown) {
  if (!value) return undefined
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value < 1_000_000_000_000 ? value * 1000 : value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
  }
  const text = String(value)
  if (/^\d+(\.\d+)?$/.test(text)) {
    const numeric = Number(text)
    if (Number.isFinite(numeric)) {
      const date = new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric)
      return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
    }
  }
  const parsed = new Date(text.endsWith('Z') || /[+-]\d\d:\d\d$/.test(text) ? text : `${text}Z`)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
