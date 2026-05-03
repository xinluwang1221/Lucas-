import type { HermesBridgeEvent, HermesBridgeResult } from './hermes_python.js'
import { hermesOfficialApiBaseUrl } from './hermes_official_api.js'

export type HermesOfficialRunConversationMessage = {
  role: string
  content: string
}

export type HermesOfficialRunsTaskParams = {
  taskId: string
  prompt: string
  cwd?: string
  resumeSessionId?: string
  conversationHistory?: HermesOfficialRunConversationMessage[]
  model?: string
  provider?: string
  instructions?: string
  baseUrl?: string
  apiKey?: string
  timeoutMs?: number
  onEvent?: (event: HermesBridgeEvent) => void
  onHandle?: (handle: HermesOfficialRunsHandle) => void
}

export type HermesOfficialRunsHandle = {
  kind: 'official-runs-api'
  runId: string
  stop: () => Promise<void>
}

export type HermesOfficialRunStartResponse = {
  runId: string
  status: string
  raw: unknown
}

export type HermesOfficialRunsCoverage = {
  canCreateRun: boolean
  canStreamText: boolean
  canStreamTools: boolean
  canStopRun: boolean
  canResumeSession: boolean
  canBindWorkspace: boolean
  canApproveCommands: boolean
  canClarify: boolean
  gaps: string[]
}

type OfficialRunRawEvent = {
  event?: string
  type?: string
  run_id?: string
  timestamp?: number
  delta?: string
  text?: string
  tool?: string
  preview?: string
  duration?: number
  error?: unknown
  output?: string
  usage?: unknown
  [key: string]: unknown
}

const defaultTimeoutMs = 30_000

export function officialRunsCoverage(): HermesOfficialRunsCoverage {
  return {
    canCreateRun: true,
    canStreamText: true,
    canStreamTools: true,
    canStopRun: true,
    canResumeSession: true,
    canBindWorkspace: false,
    canApproveCommands: false,
    canClarify: false,
    gaps: [
      'Runs API 当前实现没有读取 workdir/cwd 字段，不能可靠绑定 Cowork 授权工作区。',
      'Runs API 当前实现没有 approval.request / approval.respond 协议，危险命令审批仍需 tui_gateway。',
      'Runs API 当前实现没有 clarify.request / clarify.respond 协议，任务不清楚时的反问仍需 tui_gateway。'
    ]
  }
}

export async function runHermesOfficialRunsTask(params: HermesOfficialRunsTaskParams): Promise<HermesBridgeResult> {
  const baseUrl = normalizeBaseUrl(params.baseUrl || hermesOfficialApiBaseUrl())
  const apiKey = params.apiKey ?? hermesOfficialRunsApiKey()
  const timeoutMs = params.timeoutMs ?? defaultTimeoutMs
  const events: HermesBridgeEvent[] = []
  let finalResponse = ''
  let errorMessage = ''
  let textBuffer = ''
  let exitCode: number | null = 0
  let completed = false

  const started = await startHermesOfficialRun({ ...params, baseUrl, apiKey, timeoutMs })
  const handle: HermesOfficialRunsHandle = {
    kind: 'official-runs-api',
    runId: started.runId,
    stop: () => stopHermesOfficialRun({ baseUrl, apiKey, runId: started.runId, timeoutMs })
  }
  params.onHandle?.(handle)

  await streamHermesOfficialRunEvents({
    baseUrl,
    apiKey,
    runId: started.runId,
    timeoutMs,
    onRawEvent: (raw) => {
      const normalized = normalizeOfficialRunEvent(raw)
      for (const event of normalized) {
        events.push(event)
        params.onEvent?.(event)
        if (event.type === 'message.delta' && typeof event.text === 'string') {
          textBuffer += event.text
        }
        if (event.type === 'task.completed') {
          completed = true
          finalResponse = typeof event.finalResponse === 'string' ? event.finalResponse : textBuffer
        }
        if (event.type === 'task.failed') {
          completed = true
          exitCode = 1
          errorMessage = typeof event.error === 'string' ? event.error : 'Hermes official Runs API failed'
        }
      }
    }
  })

  if (!completed) {
    finalResponse = finalResponse || textBuffer
  }

  return {
    exitCode,
    finalResponse,
    error: errorMessage || undefined,
    sessionId: params.resumeSessionId || started.runId,
    stdout: textBuffer,
    stderr: errorMessage,
    events
  }
}

export async function startHermesOfficialRun(params: HermesOfficialRunsTaskParams & {
  baseUrl: string
  apiKey: string
  timeoutMs: number
}): Promise<HermesOfficialRunStartResponse> {
  const body: Record<string, unknown> = {
    input: params.prompt,
    session_id: params.resumeSessionId || params.taskId
  }
  if (params.conversationHistory?.length) body.conversation_history = params.conversationHistory
  if (params.instructions) body.instructions = params.instructions
  if (params.model) body.model = params.model
  if (params.provider) body.provider = params.provider
  if (params.cwd) {
    body.cwd = params.cwd
    body.workdir = params.cwd
  }

  const response = await fetch(`${params.baseUrl}/v1/runs`, {
    method: 'POST',
    headers: jsonHeaders(params.apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(params.timeoutMs)
  })
  const payload = await readResponseBody(response)
  if (!response.ok) {
    throw new Error(`Hermes official Runs API start failed: HTTP ${response.status} ${stringifyBody(payload)}`)
  }
  if (!isObject(payload) || typeof payload.run_id !== 'string') {
    throw new Error('Hermes official Runs API start returned no run_id')
  }
  return {
    runId: payload.run_id,
    status: typeof payload.status === 'string' ? payload.status : 'started',
    raw: payload
  }
}

export async function streamHermesOfficialRunEvents(params: {
  baseUrl: string
  apiKey?: string
  runId: string
  timeoutMs?: number
  onRawEvent: (event: OfficialRunRawEvent) => void
}) {
  const response = await fetch(`${normalizeBaseUrl(params.baseUrl)}/v1/runs/${encodeURIComponent(params.runId)}/events`, {
    headers: params.apiKey ? { Authorization: `Bearer ${params.apiKey}` } : undefined,
    signal: AbortSignal.timeout(params.timeoutMs ?? defaultTimeoutMs)
  })
  if (!response.ok) {
    const body = await readResponseBody(response)
    throw new Error(`Hermes official Runs API events failed: HTTP ${response.status} ${stringifyBody(body)}`)
  }
  if (!response.body) return

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split(/\n\n/)
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      const raw = parseOfficialRunsSseChunk(chunk)
      if (raw) params.onRawEvent(raw)
    }
  }
  buffer += decoder.decode()
  if (buffer.trim()) {
    const raw = parseOfficialRunsSseChunk(buffer)
    if (raw) params.onRawEvent(raw)
  }
}

export async function stopHermesOfficialRun(params: {
  baseUrl: string
  runId: string
  apiKey?: string
  timeoutMs?: number
}) {
  const response = await fetch(`${normalizeBaseUrl(params.baseUrl)}/v1/runs/${encodeURIComponent(params.runId)}/stop`, {
    method: 'POST',
    headers: params.apiKey ? { Authorization: `Bearer ${params.apiKey}` } : undefined,
    signal: AbortSignal.timeout(params.timeoutMs ?? defaultTimeoutMs)
  })
  const payload = await readResponseBody(response)
  if (!response.ok) {
    throw new Error(`Hermes official Runs API stop failed: HTTP ${response.status} ${stringifyBody(payload)}`)
  }
}

export function normalizeOfficialRunEvent(raw: OfficialRunRawEvent): HermesBridgeEvent[] {
  const eventType = raw.event || raw.type || ''
  const runId = typeof raw.run_id === 'string' ? raw.run_id : undefined
  const base = { runtime: 'official-runs-api', runId, rawEvent: eventType }
  if (eventType === 'message.delta') {
    return [{ type: 'message.delta', text: stringValue(raw.delta), ...base }]
  }
  if (eventType === 'tool.started') {
    return [{
      type: 'tool.started',
      name: stringValue(raw.tool),
      args: raw.preview,
      summary: stringValue(raw.preview),
      ...base
    }]
  }
  if (eventType === 'tool.completed') {
    return [{
      type: 'tool.completed',
      name: stringValue(raw.tool),
      duration: raw.duration,
      result: raw.error ? '工具执行失败' : '工具执行完成',
      error: raw.error,
      ...base
    }]
  }
  if (eventType === 'reasoning.available') {
    return [{
      type: 'status',
      kind: 'reasoning',
      message: stringValue(raw.text, 'Hermes 正在思考'),
      summary: stringValue(raw.text, 'Hermes 正在思考'),
      ephemeral: true,
      ...base
    }]
  }
  if (eventType === 'run.completed') {
    const events: HermesBridgeEvent[] = [{
      type: 'task.completed',
      finalResponse: stringValue(raw.output),
      usage: raw.usage,
      sessionId: runId,
      ...base
    }]
    const contextEvent = contextEventFromUsage(raw.usage, runId)
    if (contextEvent) events.unshift(contextEvent)
    return events
  }
  if (eventType === 'run.failed') {
    return [{
      type: 'task.failed',
      error: stringValue(raw.error, 'Hermes official Runs API failed'),
      sessionId: runId,
      ...base
    }]
  }
  return [{
    type: eventType || 'official-runs.unknown',
    ...raw,
    ...base
  }]
}

export function parseOfficialRunsSseChunk(chunk: string): OfficialRunRawEvent | null {
  const dataLines: string[] = []
  for (const line of chunk.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
  }
  const data = dataLines.join('\n').trim()
  if (!data) return null
  try {
    const parsed = JSON.parse(data)
    return isObject(parsed) ? parsed as OfficialRunRawEvent : null
  } catch {
    return null
  }
}

function contextEventFromUsage(value: unknown, sessionId?: string): HermesBridgeEvent | null {
  if (!isObject(value)) return null
  const inputTokens = numberValue(value.input_tokens)
  const outputTokens = numberValue(value.output_tokens)
  const totalTokens = numberValue(value.total_tokens)
  if (!inputTokens && !outputTokens && !totalTokens) return null
  return {
    type: 'context.updated',
    sessionId,
    contextUsed: totalTokens,
    contextMax: 0,
    contextPercent: 0,
    contextSource: 'official-runs-api',
    status: 'unknown',
    statusLabel: '等待 Hermes 回传上下文上限',
    usage: {
      inputTokens,
      outputTokens,
      totalTokens
    },
    updatedAt: new Date().toISOString()
  }
}

function hermesOfficialRunsApiKey() {
  return process.env.HERMES_COWORK_OFFICIAL_API_KEY?.trim() || process.env.API_SERVER_KEY?.trim() || ''
}

function jsonHeaders(apiKey: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return response.json().catch(() => undefined)
  return response.text().catch(() => '')
}

function stringifyBody(value: unknown) {
  if (typeof value === 'string') return value.slice(0, 500)
  try {
    return JSON.stringify(value).slice(0, 500)
  } catch {
    return String(value).slice(0, 500)
  }
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
