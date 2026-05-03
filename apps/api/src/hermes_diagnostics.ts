import { requestHermesDashboardJson, type HermesDashboardProxyResult } from './hermes_dashboard.js'

export type HermesDiagnosticsStatus = {
  status: 'ok' | 'warn' | 'unavailable'
  summary: string
  source: {
    dashboard: 'available' | 'unavailable'
    usage: 'available' | 'unavailable'
    logs: 'available' | 'unavailable'
  }
  usage: {
    periodDays: number
    totalSessions: number
    totalApiCalls: number
    totalTokens: number
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
    cacheReadTokens: number
    estimatedCostUsd: number
    actualCostUsd: number
    topModels: Array<{
      model: string
      sessions: number
      apiCalls: number
      tokens: number
      estimatedCostUsd: number
    }>
  }
  logHealth: {
    files: Array<{
      id: string
      label: string
      status: 'ok' | 'warn' | 'unavailable'
      lineCount: number
      issueCount: number
      latestIssue?: string
    }>
    recentIssues: Array<{
      id: string
      file: string
      level: 'error' | 'warn'
      message: string
    }>
  }
  nextActions: string[]
  updatedAt: string
}

type DashboardRequester = (apiPath: string) => Promise<HermesDashboardProxyResult>

export async function readHermesDiagnostics(options: {
  days?: number
  startDashboard?: boolean
  requestDashboard?: DashboardRequester
} = {}): Promise<HermesDiagnosticsStatus> {
  const days = clampInteger(options.days, 1, 90, 30)
  const requestDashboard = options.requestDashboard ?? ((apiPath: string) =>
    requestHermesDashboardJson(apiPath, {}, { start: Boolean(options.startDashboard) }))

  const [usageResult, ...logResults] = await Promise.all([
    readDashboardJson(requestDashboard, `/api/analytics/usage?days=${days}`),
    readDashboardJson(requestDashboard, '/api/logs?file=errors&lines=80'),
    readDashboardJson(requestDashboard, '/api/logs?file=agent&lines=120&level=ERROR'),
    readDashboardJson(requestDashboard, '/api/logs?file=gateway&lines=80&level=ERROR')
  ])

  const usage = normalizeUsage(usageResult.ok ? usageResult.body : undefined, days)
  const logHealth = normalizeLogs([
    { id: 'errors', label: '错误日志', result: logResults[0] },
    { id: 'agent', label: 'Agent 日志', result: logResults[1] },
    { id: 'gateway', label: 'Gateway 日志', result: logResults[2] }
  ])
  const dashboardAvailable = usageResult.ok || logResults.some((result) => result.ok)
  const usageAvailable = usageResult.ok
  const logsAvailable = logResults.some((result) => result.ok)
  const issueCount = logHealth.recentIssues.length
  const status: HermesDiagnosticsStatus['status'] = dashboardAvailable ? (issueCount ? 'warn' : 'ok') : 'unavailable'

  return {
    status,
    summary: buildSummary(status, usage, issueCount, days),
    source: {
      dashboard: dashboardAvailable ? 'available' : 'unavailable',
      usage: usageAvailable ? 'available' : 'unavailable',
      logs: logsAvailable ? 'available' : 'unavailable'
    },
    usage,
    logHealth,
    nextActions: buildNextActions(status, usageAvailable, logsAvailable, logHealth.recentIssues),
    updatedAt: new Date().toISOString()
  }
}

async function readDashboardJson(requestDashboard: DashboardRequester, apiPath: string) {
  try {
    const result = await requestDashboard(apiPath)
    if (!result.ok) {
      return { ok: false as const, error: `Hermes Dashboard ${apiPath} 返回 ${result.status}` }
    }
    return { ok: true as const, body: result.body }
  } catch (error) {
    return { ok: false as const, error: errorMessage(error) }
  }
}

function normalizeUsage(body: unknown, periodDays: number): HermesDiagnosticsStatus['usage'] {
  const payload = isRecord(body) ? body : {}
  const totals = isRecord(payload.totals) ? payload.totals : {}
  const topModels = Array.isArray(payload.by_model)
    ? payload.by_model.slice(0, 5).map((item): HermesDiagnosticsStatus['usage']['topModels'][number] => {
      const model = isRecord(item) ? item : {}
      const inputTokens = numberValue(model.input_tokens)
      const outputTokens = numberValue(model.output_tokens)
      return {
        model: stringValue(model.model, '未知模型'),
        sessions: numberValue(model.sessions),
        apiCalls: numberValue(model.api_calls),
        tokens: inputTokens + outputTokens,
        estimatedCostUsd: numberValue(model.estimated_cost)
      }
    })
    : []
  const inputTokens = numberValue(totals.total_input)
  const outputTokens = numberValue(totals.total_output)
  const reasoningTokens = numberValue(totals.total_reasoning)
  const cacheReadTokens = numberValue(totals.total_cache_read)

  return {
    periodDays: numberValue(payload.period_days) || periodDays,
    totalSessions: numberValue(totals.total_sessions),
    totalApiCalls: numberValue(totals.total_api_calls),
    totalTokens: inputTokens + outputTokens + reasoningTokens,
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    estimatedCostUsd: numberValue(totals.total_estimated_cost),
    actualCostUsd: numberValue(totals.total_actual_cost),
    topModels
  }
}

function normalizeLogs(
  entries: Array<{ id: string; label: string; result: Awaited<ReturnType<typeof readDashboardJson>> }>
): HermesDiagnosticsStatus['logHealth'] {
  const recentIssues: HermesDiagnosticsStatus['logHealth']['recentIssues'] = []
  const files = entries.map((entry) => {
    const lines = entry.result.ok && isRecord(entry.result.body) && Array.isArray(entry.result.body.lines)
      ? entry.result.body.lines.filter((line): line is string => typeof line === 'string')
      : []
    const issues = lines
      .map((line) => normalizeIssueLine(entry.id, line))
      .filter((issue): issue is HermesDiagnosticsStatus['logHealth']['recentIssues'][number] => Boolean(issue))

    recentIssues.push(...issues)
    return {
      id: entry.id,
      label: entry.label,
      status: entry.result.ok ? (issues.length ? 'warn' as const : 'ok' as const) : 'unavailable' as const,
      lineCount: lines.length,
      issueCount: issues.length,
      latestIssue: issues.at(-1)?.message
    }
  })

  return {
    files,
    recentIssues: dedupeIssues(recentIssues).slice(-6).reverse()
  }
}

function normalizeIssueLine(file: string, line: string): HermesDiagnosticsStatus['logHealth']['recentIssues'][number] | null {
  const level = /\bWARN(?:ING)?\b/i.test(line) ? 'warn' : /\b(ERROR|CRITICAL|Traceback|Exception)\b/i.test(line) ? 'error' : null
  if (!level) return null
  const rawMessage = line
    .replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:,\d+)?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const message = describeKnownIssue(file, rawMessage)
  if (!message) return null
  return {
    id: `${file}:${hashText(message)}`,
    file,
    level,
    message
  }
}

function describeKnownIssue(file: string, message: string) {
  if (/most recent call last/i.test(message)) return ''
  if (/invalid api key|unauthorized|401/i.test(message)) {
    return '模型凭据失败：当前模型 Key 被拒绝。请到设置 > 模型重填对应供应商 Key，再重新发送任务。'
  }
  if (/approval timeout|approval.*timed out|requires approval|needs approval/i.test(message)) {
    return '命令审批未完成：Hermes 遇到需要你确认的风险操作。下次任务会在对话区显示审批卡，请直接允许或拒绝。'
  }
  if (/keepalive ping timeout|no close frame received|receive message loop exit/i.test(message)) {
    return '消息通道中断：飞书或外部消息长连接断开。通常会自动重连；如果频繁出现，去外部应用授权页重新登录。'
  }
  if (/open\.feishu\.cn|HTTPSConnectionPool|Max retries exceeded|callback\/ws/i.test(message)) {
    return '飞书连接失败：Hermes 无法连上飞书开放平台。请检查网络或代理；如果一直失败，去外部应用授权页重新登录。'
  }
  if (/dashboard.*offline|connection refused|econnrefused|failed to fetch/i.test(message)) {
    return '后台连接失败：Cowork 暂时连不上 Hermes 后台。请先在设置 > 运行环境启动后台，再刷新诊断。'
  }
  if (/rate limit|too many requests|quota/i.test(message)) {
    return '模型额度或频率受限：当前供应商限制了请求。可以稍后重试，或在模型设置切换备用模型。'
  }
  if (/timeout|timed out/i.test(message)) {
    return '任务执行超时：某个工具或模型调用等待过久。建议重新运行任务，若重复出现再查看对应工具配置。'
  }
  if (/mcp/i.test(message) && /fail|error|exception/i.test(message)) {
    return 'MCP 工具异常：某个外部能力没有正常返回。请到技能页检查对应 MCP 的启用状态和凭据。'
  }
  const trimmed = message
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\b(ERROR|CRITICAL|Traceback|Exception|WARNING|WARN)\b:?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return trimmed ? `未归类异常：${trimmed}` : `${file} 日志出现未归类异常。`
}

function dedupeIssues(issues: HermesDiagnosticsStatus['logHealth']['recentIssues']) {
  const seen = new Set<string>()
  const result: HermesDiagnosticsStatus['logHealth']['recentIssues'] = []
  for (const issue of issues) {
    const key = issue.message
    if (seen.has(key)) continue
    seen.add(key)
    result.push(issue)
  }
  return result
}

function buildSummary(
  status: HermesDiagnosticsStatus['status'],
  usage: HermesDiagnosticsStatus['usage'],
  issueCount: number,
  days: number
) {
  if (status === 'unavailable') return 'Hermes 官方后台未连接，暂时无法读取日志和使用统计。'
  const usageText = usage.totalSessions
    ? `最近 ${usage.periodDays || days} 天有 ${usage.totalSessions} 个会话、${usage.totalApiCalls} 次模型调用。`
    : `最近 ${usage.periodDays || days} 天还没有可统计的会话。`
  return issueCount ? `${usageText} 发现 ${issueCount} 条近期异常，需要优先处理。` : `${usageText} 未发现近期错误日志。`
}

function buildNextActions(
  status: HermesDiagnosticsStatus['status'],
  usageAvailable: boolean,
  logsAvailable: boolean,
  issues: HermesDiagnosticsStatus['logHealth']['recentIssues']
) {
  if (status === 'unavailable') return ['先在“运行环境”里启动 Hermes 官方后台，然后刷新诊断。']
  const actions: string[] = []
  if (!usageAvailable) actions.push('使用统计暂不可读，先确认 Hermes Dashboard 的 Analytics API 是否可用。')
  if (!logsAvailable) actions.push('日志暂不可读，先确认 Hermes 日志目录和 Dashboard token 是否正常。')
  const messages = issues.map((issue) => issue.message).join('\n')
  if (/模型凭据/.test(messages)) {
    actions.push('优先查看最近异常对应的任务；如果是模型凭据问题，回到模型设置重填 Key。')
  }
  if (/飞书|消息通道|外部应用授权/.test(messages)) actions.push('飞书消息连接不稳定；先检查网络和代理，再到设置 > 外部应用授权重新登录。')
  if (/审批/.test(messages)) actions.push('最近有命令审批未完成；下次任务出现审批卡时，需要在对话区直接确认或拒绝。')
  if (/MCP/.test(messages)) actions.push('最近有 MCP 工具异常；到技能页检查对应 MCP 的启用状态和凭据。')
  if (issues.length && !actions.length) actions.push('最近有未归类异常；如果同一任务反复失败，再打开诊断详情定位来源。')
  if (!actions.length) actions.push('当前不需要处理，继续正常使用。')
  return Array.from(new Set(actions))
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function numberValue(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hashText(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
