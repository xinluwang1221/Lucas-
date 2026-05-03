import fs from 'node:fs'
import path from 'node:path'
import { hermesAgentDir } from './paths.js'

export type HermesOfficialApiSourceCapability = {
  id: string
  label: string
  available: boolean
  evidence: string
}

export type HermesOfficialSessionActionStatus = {
  id: string
  label: string
  officialStatus: 'available' | 'missing' | 'missing_rest'
  coworkPath: string
  decision: 'use_official_read' | 'keep_cowork_safe_write' | 'keep_cowork_gateway' | 'watch_upstream'
  userMeaning: string
  evidence: string
}

export type HermesOfficialSessionActionsStatus = {
  summary: string
  actions: HermesOfficialSessionActionStatus[]
}

export type HermesOfficialApiSourceStatus = {
  agentDir: string
  docsPath: string
  adapterPath: string
  dashboardPath: string
  mcpServerPath: string
  capabilities: HermesOfficialApiSourceCapability[]
  sessionActions: HermesOfficialSessionActionsStatus
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
  sessionActions: HermesOfficialSessionActionsStatus
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
    sessionActions: source.sessionActions,
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
  const capabilities = [
    capability('openai_chat_completions', 'OpenAI Chat Completions', docs, adapter, ['/v1/chat/completions', '_handle_chat_completions']),
    capability('openai_responses', 'OpenAI Responses', docs, adapter, ['/v1/responses', '_handle_responses']),
    capability('runs_api', 'Runs API', docs, adapter, ['/v1/runs', '_handle_runs', '_handle_run_events']),
    capability('run_stop', 'Run Stop', docs, adapter, ['/v1/runs/{run_id}/stop', '_handle_stop_run']),
    capability('jobs_api', 'Jobs API', docs, adapter, ['/api/jobs', '_handle_create_job', '_handle_run_job']),
    capability('session_state', 'Session / previous_response_id / conversation', docs, adapter, ['previous_response_id', 'conversation_history', 'ResponseStore']),
    capability('streaming_events', 'Streaming Events', docs, adapter, ['message.delta', 'tool.started', 'tool.completed', 'reasoning.available']),
    capability('image_input', 'Inline Image Input', docs, adapter, ['input_image', 'image_url', 'data:image/']),
    capability('dashboard_sessions', 'Dashboard Sessions API', dashboard, dashboard, ['/api/sessions', '/api/sessions/{session_id}/messages']),
    capability('dashboard_session_search', 'Dashboard Session Search', dashboard, dashboard, ['/api/sessions/search']),
    capability('dashboard_session_delete', 'Dashboard Session Delete', dashboard, dashboard, ['@app.delete("/api/sessions/{session_id}")', 'delete_session_endpoint']),
    capability('dashboard_session_rename', 'Dashboard Session Rename', dashboard, dashboard, ['@app.patch("/api/sessions/{session_id}")', '@app.put("/api/sessions/{session_id}")', 'rename_session_endpoint']),
    capability('dashboard_session_resume_rest', 'Dashboard Session Resume REST', dashboard, dashboard, ['@app.post("/api/sessions/{session_id}/resume")', 'resume_session_endpoint']),
    capability('dashboard_session_export', 'Dashboard Session Export REST', dashboard, dashboard, ['@app.get("/api/sessions/{session_id}/export")', 'export_session_endpoint']),
    capability('tui_websocket_resume', 'TUI WebSocket Resume', dashboard, dashboard, ['HERMES_TUI_RESUME', '_resolve_chat_argv']),
    capability('dashboard_logs_analytics', 'Dashboard Logs / Analytics', dashboard, dashboard, ['/api/logs', '/api/analytics/usage']),
    capability('dashboard_skills_toolsets', 'Dashboard Skills / Toolsets', dashboard, dashboard, ['/api/skills', '/api/tools/toolsets']),
    capability('mcp_session_events', 'Hermes MCP Session Events', mcpServer, mcpServer, ['events_poll', 'events_wait', 'permissions_respond'])
  ]

  return {
    agentDir,
    docsPath,
    adapterPath,
    dashboardPath,
    mcpServerPath,
    capabilities,
    sessionActions: buildSessionActions(capabilities)
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
      '保留 tui_gateway 作为当前主通道，official runs adapter 只做并行验证。',
      '在官方 API Server 真实运行时，用 /v1/runs + /v1/runs/{run_id}/events + /v1/runs/{run_id}/stop 做 real smoke。',
      '当前 Runs API 未覆盖 workdir、approval.request / approval.respond、clarify.request / clarify.respond；这些能力继续留在 tui_gateway。',
      'Session delete 官方 Dashboard REST 已存在，但 Cowork 继续保留删除前备份、确认和失败恢复链路；rename / resume / export 暂无官方 Dashboard REST。'
    ]
    : [
      '当前 Hermes 源码未完整暴露 Runs/Events/Stop，暂不迁移主通道。',
      '继续把 Dashboard Sessions、Logs、Analytics 和 Jobs API 前端化。',
      'Session 写入动作按 sessionActions 决策表逐项迁移，不能只因为源码里有局部函数就替换现有 Cowork 安全链路。'
    ]

  return {
    shouldReplaceCurrentGatewayNow,
    summary: runtime.running
      ? '本机 Hermes 官方 API Server 已可探测；下一步可以做并行 adapter smoke，但不应立即替换现有 gateway。'
      : '本机 Hermes 官方 API Server 当前未运行；源码已具备能力时，下一步先做启动配置和 smoke，再决定迁移范围。',
    nextActions
  }
}

function buildSessionActions(capabilities: HermesOfficialApiSourceCapability[]): HermesOfficialSessionActionsStatus {
  const byId = new Map(capabilities.map((item) => [item.id, item]))
  const sessions = byId.get('dashboard_sessions')
  const search = byId.get('dashboard_session_search')
  const deleteSession = byId.get('dashboard_session_delete')
  const rename = byId.get('dashboard_session_rename')
  const resumeRest = byId.get('dashboard_session_resume_rest')
  const exportRest = byId.get('dashboard_session_export')
  const tuiResume = byId.get('tui_websocket_resume')

  const actions: HermesOfficialSessionActionStatus[] = [
    sessionAction({
      id: 'list_detail_messages',
      label: '读取会话、详情和消息',
      available: Boolean(sessions?.available),
      officialStatus: 'missing',
      coworkPath: '/api/hermes/sessions, /api/hermes/sessions/:sessionId',
      decision: 'use_official_read',
      userMeaning: 'Cowork 可以优先读 Hermes Dashboard 的会话元数据，再回退本地 transcript。',
      evidence: sessions?.evidence
    }),
    sessionAction({
      id: 'search',
      label: '全文搜索',
      available: Boolean(search?.available),
      officialStatus: 'missing',
      coworkPath: '/api/hermes/sessions?q=...',
      decision: 'use_official_read',
      userMeaning: '搜索可以合并官方索引和 Cowork 本地 transcript，并在界面标注来源。',
      evidence: search?.evidence
    }),
    sessionAction({
      id: 'delete',
      label: '删除会话',
      available: Boolean(deleteSession?.available),
      officialStatus: 'missing',
      coworkPath: 'DELETE /api/hermes/sessions/:sessionId',
      decision: 'keep_cowork_safe_write',
      userMeaning: 'Hermes 官方能删除 session，但 Cowork 继续使用带备份、确认和失败恢复的本机删除链路。',
      evidence: deleteSession?.evidence
    }),
    sessionAction({
      id: 'rename',
      label: '重命名会话',
      available: Boolean(rename?.available),
      officialStatus: 'missing_rest',
      coworkPath: 'PATCH /api/hermes/sessions/:sessionId',
      decision: 'keep_cowork_safe_write',
      userMeaning: 'Dashboard REST 暂未暴露重命名；Cowork 继续通过 Hermes SessionDB.set_session_title 写入。',
      evidence: rename?.evidence
    }),
    sessionAction({
      id: 'continue',
      label: '继续原生会话',
      available: Boolean(resumeRest?.available),
      officialStatus: 'missing_rest',
      coworkPath: 'POST /api/hermes/sessions/:sessionId/continue',
      decision: 'keep_cowork_gateway',
      userMeaning: tuiResume?.available
        ? 'Dashboard REST 暂未暴露 resume，但 TUI WebSocket 支持 HERMES_TUI_RESUME；Cowork 继续走 gateway session.resume。'
        : '暂未找到官方 REST 或 TUI resume 能力；继续会话必须保持 Cowork 现有保护链路。',
      evidence: resumeRest?.available ? resumeRest.evidence : `${resumeRest?.evidence || '未找到 REST resume'}；TUI: ${tuiResume?.evidence || '未找到 TUI resume'}`
    }),
    sessionAction({
      id: 'export',
      label: '导出会话',
      available: Boolean(exportRest?.available),
      officialStatus: 'missing_rest',
      coworkPath: '尚未开放用户入口',
      decision: 'watch_upstream',
      userMeaning: 'Hermes state 内部有 export_session，但 Dashboard REST 暂未暴露；先记录，不做前端按钮。',
      evidence: exportRest?.evidence
    })
  ]

  return {
    summary: 'Session 读取和搜索可以优先使用官方 Dashboard；删除虽有官方 REST，但 Cowork 继续保留安全备份链路；重命名、继续和导出仍不是官方 Dashboard REST 能力。',
    actions
  }
}

function sessionAction(input: {
  id: string
  label: string
  available: boolean
  officialStatus: HermesOfficialSessionActionStatus['officialStatus']
  coworkPath: string
  decision: HermesOfficialSessionActionStatus['decision']
  userMeaning: string
  evidence?: string
}): HermesOfficialSessionActionStatus {
  return {
    id: input.id,
    label: input.label,
    officialStatus: input.available ? 'available' : input.officialStatus,
    coworkPath: input.coworkPath,
    decision: input.decision,
    userMeaning: input.userMeaning,
    evidence: input.evidence || '未在本机 Hermes 文档或源码中找到匹配特征'
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
