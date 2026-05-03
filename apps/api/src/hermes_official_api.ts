import fs from 'node:fs'
import path from 'node:path'
import { hermesAgentDir } from './paths.js'

export type HermesOfficialApiSourceCapability = {
  id: string
  label: string
  available: boolean
  evidence: string
}

export type HermesOfficialApiSourceStatus = {
  agentDir: string
  docsPath: string
  adapterPath: string
  dashboardPath: string
  mcpServerPath: string
  capabilities: HermesOfficialApiSourceCapability[]
}

export type HermesOfficialApiRuntimeStatus = {
  baseUrl: string
  authConfigured: boolean
  running: boolean
  health?: unknown
  detailedHealth?: unknown
  models?: unknown
  checks: Array<{
    path: string
    ok: boolean
    status?: number
    error?: string
  }>
}

export type HermesOfficialApiStatus = {
  source: HermesOfficialApiSourceStatus
  runtime: HermesOfficialApiRuntimeStatus
  decision: {
    shouldReplaceCurrentGatewayNow: boolean
    summary: string
    nextActions: string[]
  }
  updatedAt: string
}

type OfficialApiProbeResult = {
  ok: boolean
  status?: number
  body?: unknown
  error?: string
}

const defaultApiHost = '127.0.0.1'
const defaultApiPort = 8642

export async function readHermesOfficialApiStatus(): Promise<HermesOfficialApiStatus> {
  const source = inspectHermesOfficialApiSource()
  const runtime = await probeHermesOfficialApiServer()
  return {
    source,
    runtime,
    decision: buildDecision(source, runtime),
    updatedAt: new Date().toISOString()
  }
}

export function inspectHermesOfficialApiSource(agentDir = hermesAgentDir): HermesOfficialApiSourceStatus {
  const docsPath = path.join(agentDir, 'website/docs/user-guide/features/api-server.md')
  const adapterPath = path.join(agentDir, 'gateway/platforms/api_server.py')
  const dashboardPath = path.join(agentDir, 'hermes_cli/web_server.py')
  const mcpServerPath = path.join(agentDir, 'mcp_serve.py')
  const docs = readText(docsPath)
  const adapter = readText(adapterPath)
  const dashboard = readText(dashboardPath)
  const mcpServer = readText(mcpServerPath)

  return {
    agentDir,
    docsPath,
    adapterPath,
    dashboardPath,
    mcpServerPath,
    capabilities: [
      capability('openai_chat_completions', 'OpenAI Chat Completions', docs, adapter, ['/v1/chat/completions', '_handle_chat_completions']),
      capability('openai_responses', 'OpenAI Responses', docs, adapter, ['/v1/responses', '_handle_responses']),
      capability('runs_api', 'Runs API', docs, adapter, ['/v1/runs', '_handle_runs', '_handle_run_events']),
      capability('run_stop', 'Run Stop', docs, adapter, ['/v1/runs/{run_id}/stop', '_handle_stop_run']),
      capability('jobs_api', 'Jobs API', docs, adapter, ['/api/jobs', '_handle_create_job', '_handle_run_job']),
      capability('session_state', 'Session / previous_response_id / conversation', docs, adapter, ['previous_response_id', 'conversation_history', 'ResponseStore']),
      capability('streaming_events', 'Streaming Events', docs, adapter, ['message.delta', 'tool.started', 'tool.completed', 'reasoning.available']),
      capability('image_input', 'Inline Image Input', docs, adapter, ['input_image', 'image_url', 'data:image/']),
      capability('dashboard_sessions', 'Dashboard Sessions API', dashboard, dashboard, ['/api/sessions', '/api/sessions/{session_id}/messages']),
      capability('dashboard_logs_analytics', 'Dashboard Logs / Analytics', dashboard, dashboard, ['/api/logs', '/api/analytics/usage']),
      capability('dashboard_skills_toolsets', 'Dashboard Skills / Toolsets', dashboard, dashboard, ['/api/skills', '/api/tools/toolsets']),
      capability('mcp_session_events', 'Hermes MCP Session Events', mcpServer, mcpServer, ['events_poll', 'events_wait', 'permissions_respond'])
    ]
  }
}

export async function probeHermesOfficialApiServer(options: {
  baseUrl?: string
  apiKey?: string
  timeoutMs?: number
} = {}): Promise<HermesOfficialApiRuntimeStatus> {
  const baseUrl = trimTrailingSlash(options.baseUrl || hermesOfficialApiBaseUrl())
  const apiKey = options.apiKey ?? hermesOfficialApiKey()
  const timeoutMs = options.timeoutMs ?? numberEnv('HERMES_COWORK_OFFICIAL_API_TIMEOUT_MS', 1500)
  const checks: HermesOfficialApiRuntimeStatus['checks'] = []

  const health = await requestOfficialApi(baseUrl, '/health', apiKey, timeoutMs)
  checks.push({ path: '/health', ok: health.ok, status: health.status, error: health.error })

  const detailedHealth = health.ok
    ? await requestOfficialApi(baseUrl, '/health/detailed', apiKey, timeoutMs)
    : { ok: false as const, error: health.error }
  checks.push({ path: '/health/detailed', ok: detailedHealth.ok, status: detailedHealth.status, error: detailedHealth.error })

  const models = health.ok
    ? await requestOfficialApi(baseUrl, '/v1/models', apiKey, timeoutMs)
    : { ok: false as const, error: health.error }
  checks.push({ path: '/v1/models', ok: models.ok, status: models.status, error: models.error })

  return {
    baseUrl,
    authConfigured: Boolean(apiKey),
    running: health.ok,
    health: health.body,
    detailedHealth: detailedHealth.ok ? detailedHealth.body : undefined,
    models: models.ok ? models.body : undefined,
    checks
  }
}

export function hermesOfficialApiBaseUrl() {
  const explicit = process.env.HERMES_COWORK_OFFICIAL_API_URL?.trim() || process.env.HERMES_API_SERVER_URL?.trim()
  if (explicit) return trimTrailingSlash(explicit)
  const host = process.env.API_SERVER_HOST?.trim() || defaultApiHost
  const probeHost = host === '0.0.0.0' || host === '::' ? defaultApiHost : host
  const port = numberEnv('API_SERVER_PORT', defaultApiPort)
  return `http://${probeHost}:${port}`
}

function hermesOfficialApiKey() {
  return process.env.HERMES_COWORK_OFFICIAL_API_KEY?.trim() || process.env.API_SERVER_KEY?.trim() || ''
}

function buildDecision(source: HermesOfficialApiSourceStatus, runtime: HermesOfficialApiRuntimeStatus) {
  const hasRuns = source.capabilities.find((item) => item.id === 'runs_api')?.available
  const hasStop = source.capabilities.find((item) => item.id === 'run_stop')?.available
  const hasEvents = source.capabilities.find((item) => item.id === 'streaming_events')?.available
  const canEvaluateMigration = Boolean(hasRuns && hasStop && hasEvents)
  const shouldReplaceCurrentGatewayNow = false
  const nextActions = canEvaluateMigration
    ? [
      '保留 tui_gateway 作为当前主通道，新增 official-api adapter 做并行 smoke。',
      '用 /v1/runs + /v1/runs/{run_id}/events + /v1/runs/{run_id}/stop 复刻 Cowork 创建任务、流式事件和停止任务。',
      '确认 Runs API 能否暴露 approval.request / clarify.request；如果不能，审批和澄清继续留在 tui_gateway。'
    ]
    : [
      '当前 Hermes 源码未完整暴露 Runs/Events/Stop，暂不迁移主通道。',
      '继续把 Dashboard Sessions、Logs、Analytics 和 Jobs API 前端化。'
    ]

  return {
    shouldReplaceCurrentGatewayNow,
    summary: runtime.running
      ? '本机 Hermes 官方 API Server 已可探测；下一步可以做并行 adapter smoke，但不应立即替换现有 gateway。'
      : '本机 Hermes 官方 API Server 当前未运行；源码已具备能力时，下一步先做启动配置和 smoke，再决定迁移范围。',
    nextActions
  }
}

function capability(id: string, label: string, primaryText: string, fallbackText: string, needles: string[]): HermesOfficialApiSourceCapability {
  const allText = `${primaryText}\n${fallbackText}`
  const matched = needles.filter((needle) => allText.includes(needle))
  return {
    id,
    label,
    available: matched.length > 0,
    evidence: matched.length ? matched.slice(0, 3).join(', ') : '未在本机 Hermes 文档或源码中找到匹配特征'
  }
}

function readText(filePath: string) {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

async function requestOfficialApi(baseUrl: string, apiPath: string, apiKey: string, timeoutMs: number): Promise<OfficialApiProbeResult> {
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  try {
    const response = await fetch(`${baseUrl}${apiPath}`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    })
    const contentType = response.headers.get('content-type') || ''
    const body = contentType.includes('application/json') ? await response.json().catch(() => undefined) : await response.text().catch(() => '')
    return { ok: response.ok, status: response.status, body, error: response.ok ? undefined : `HTTP ${response.status}` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}
