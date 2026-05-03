import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AppState, Task } from './types.js'

export type HermesSessionSummary = {
  id: string
  file: string
  filePath: string
  title: string
  preview?: string
  model?: string
  provider?: string
  platform?: string
  baseUrl?: string
  tools: string[]
  messageCount: number
  startedAt: string
  updatedAt: string
  linkedTaskIds: string[]
  linkedTaskTitle?: string
  linkedWorkspaceIds: string[]
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

export type HermesSessionsResponse = {
  sessionsDir: string
  sessions: HermesSessionSummary[]
  total: number
  query?: string
  updatedAt: string
}

export type ReadHermesSessionsOptions = {
  query?: string
  limit?: number
  sessionsDir?: string
}

type HermesSessionRaw = Record<string, unknown>

export function readHermesSessions(state: AppState, options: ReadHermesSessionsOptions = {}): HermesSessionsResponse {
  const sessionsDir = resolveHermesSessionsDir(options.sessionsDir)
  const linkedTasks = buildLinkedTasks(state.tasks)

  if (!fs.existsSync(sessionsDir)) {
    return {
      sessionsDir,
      sessions: [],
      total: 0,
      query: normalizeQuery(options.query),
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
        return [toHermesSessionSummary(raw, file, fullPath, linkedTasks)]
      } catch {
        return []
      }
    })
    .filter((session) => matchesSessionQuery(session, query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const safeLimit = Number.isFinite(options.limit) && options.limit && options.limit > 0
    ? Math.min(Math.floor(options.limit), 500)
    : 200

  return {
    sessionsDir,
    sessions: allSessions.slice(0, safeLimit),
    total: allSessions.length,
    query,
    updatedAt: new Date().toISOString()
  }
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
  const session = toHermesSessionSummary(raw, path.basename(target), target, linkedTasks)
  const updatedAt = session.updatedAt

  return {
    sessionsDir,
    session,
    messages: normalizeMessages(raw, session.id, updatedAt),
    updatedAt: new Date().toISOString()
  }
}

export function resolveHermesSessionsDir(explicitDir?: string) {
  if (explicitDir) return explicitDir
  if (process.env.HERMES_COWORK_SESSIONS_DIR) return process.env.HERMES_COWORK_SESSIONS_DIR
  const hermesHome = process.env.HERMES_HOME || path.join(os.homedir(), '.hermes')
  return path.join(hermesHome, 'sessions')
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
  linkedTasks: Map<string, Task[]>
): HermesSessionSummary {
  const stat = fs.statSync(filePath)
  const id = normalizeSessionId(stringValue(raw.session_id) || file)
  const tasks = linkedTasks.get(id) ?? []
  const messages = Array.isArray(raw.messages) ? raw.messages : []
  const title = firstNonEmpty(
    tasks[0]?.title,
    stringValue(raw.title),
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
    baseUrl: stringValue(raw.base_url),
    tools: normalizeTools(raw.tools),
    messageCount: numberValue(raw.message_count) ?? messages.length,
    startedAt: normalizeHermesDate(raw.session_start) ?? stat.birthtime.toISOString(),
    updatedAt: normalizeHermesDate(raw.last_updated) ?? stat.mtime.toISOString(),
    linkedTaskIds: tasks.map((task) => task.id),
    linkedTaskTitle: tasks[0]?.title,
    linkedWorkspaceIds: [...new Set(tasks.map((task) => task.workspaceId))]
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
  return haystack.includes(query.toLowerCase())
}

function normalizeSessionId(value: string) {
  return value.replace(/\.json$/, '').replace(/^session_/, '')
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

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim())?.trim() ?? ''
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1)}…`
}

function normalizeHermesDate(value: unknown) {
  if (!value) return undefined
  const text = String(value)
  const parsed = new Date(text.endsWith('Z') || /[+-]\d\d:\d\d$/.test(text) ? text : `${text}Z`)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
