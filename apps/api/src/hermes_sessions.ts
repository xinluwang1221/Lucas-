import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { hermesAgentDir, hermesPythonBin } from './paths.js'
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
  baseUrl?: string
  tools: string[]
  messageCount: number
  startedAt: string
  updatedAt: string
  linkedTaskIds: string[]
  linkedTaskTitle?: string
  linkedWorkspaceIds: string[]
  searchMatches?: HermesSessionSearchHit[]
}

export type HermesSessionSearchHit = {
  messageId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  snippet: string
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
  hermesHome?: string
  titleOverrides?: Map<string, string>
}

type HermesSessionRaw = Record<string, unknown>

export function readHermesSessions(state: AppState, options: ReadHermesSessionsOptions = {}): HermesSessionsResponse {
  const sessionsDir = resolveHermesSessionsDir(options.sessionsDir)
  const linkedTasks = buildLinkedTasks(state.tasks)
  const titleOverrides = resolveHermesSessionTitleOverrides(options)

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
        snippet: buildSearchSnippet(target, query)
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
