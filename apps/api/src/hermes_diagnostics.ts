import { requestHermesDashboardJson, type HermesDashboardProxyResult } from './hermes_dashboard.js'
import type { ExecutionEvent, Task } from './types.js'

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
      createdAt?: string
      sessionId?: string
      linkedTaskId?: string
      linkedTaskTitle?: string
      linkedTaskStatus?: Task['status']
      linkReason?: 'session' | 'time-window'
    }>
  }
  taskHealth: {
    windowDays: number
    totalTasks: number
    recentTasks: number
    runningTasks: number
    completedTasks: number
    failedTasks: number
    tasksWithIssues: number
    recentTaskIssues: Array<{
      id: string
      taskId: string
      title: string
      status: Task['status']
      hermesSessionId?: string
      toolName?: string
      message: string
      updatedAt: string
    }>
    tools: Array<{
      name: string
      calls: number
      failures: number
      failureRate: number
      averageMs?: number
      lastTaskId?: string
      lastTaskTitle?: string
      lastError?: string
      lastSeenAt?: string
    }>
  }
  nextActions: string[]
  updatedAt: string
}

type DashboardRequester = (apiPath: string) => Promise<HermesDashboardProxyResult>
type LogIssue = HermesDiagnosticsStatus['logHealth']['recentIssues'][number]
type ToolStats = {
  name: string
  calls: number
  failures: number
  durations: number[]
  lastTaskId?: string
  lastTaskTitle?: string
  lastError?: string
  lastSeenAt?: string
}

export async function readHermesDiagnostics(options: {
  days?: number
  startDashboard?: boolean
  requestDashboard?: DashboardRequester
  tasks?: Task[]
} = {}): Promise<HermesDiagnosticsStatus> {
  const days = clampInteger(options.days, 1, 90, 30)
  const tasks = options.tasks ?? []
  const requestDashboard = options.requestDashboard ?? ((apiPath: string) =>
    requestHermesDashboardJson(apiPath, {}, { start: Boolean(options.startDashboard) }))

  const [usageResult, ...logResults] = await Promise.all([
    readDashboardJson(requestDashboard, `/api/analytics/usage?days=${days}`),
    readDashboardJson(requestDashboard, '/api/logs?file=errors&lines=80'),
    readDashboardJson(requestDashboard, '/api/logs?file=agent&lines=120&level=ERROR'),
    readDashboardJson(requestDashboard, '/api/logs?file=gateway&lines=80&level=ERROR')
  ])

  const usage = normalizeUsage(usageResult.ok ? usageResult.body : undefined, days)
  const taskHealth = normalizeTaskHealth(tasks, days)
  const logHealth = normalizeLogs([
    { id: 'errors', label: '错误日志', result: logResults[0] },
    { id: 'agent', label: 'Agent 日志', result: logResults[1] },
    { id: 'gateway', label: 'Gateway 日志', result: logResults[2] }
  ], tasks)
  const dashboardAvailable = usageResult.ok || logResults.some((result) => result.ok)
  const usageAvailable = usageResult.ok
  const logsAvailable = logResults.some((result) => result.ok)
  const issueCount = logHealth.recentIssues.length
  const status: HermesDiagnosticsStatus['status'] = dashboardAvailable || taskHealth.totalTasks
    ? (!dashboardAvailable || issueCount || taskHealth.tasksWithIssues ? 'warn' : 'ok')
    : 'unavailable'

  return {
    status,
    summary: buildSummary(status, usage, usageAvailable, issueCount, taskHealth, days),
    source: {
      dashboard: dashboardAvailable ? 'available' : 'unavailable',
      usage: usageAvailable ? 'available' : 'unavailable',
      logs: logsAvailable ? 'available' : 'unavailable'
    },
    usage,
    logHealth,
    taskHealth,
    nextActions: buildNextActions(status, usageAvailable, logsAvailable, logHealth.recentIssues, taskHealth),
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
  entries: Array<{ id: string; label: string; result: Awaited<ReturnType<typeof readDashboardJson>> }>,
  tasks: Task[]
): HermesDiagnosticsStatus['logHealth'] {
  const recentIssues: LogIssue[] = []
  const files = entries.map((entry) => {
    const lines = entry.result.ok && isRecord(entry.result.body) && Array.isArray(entry.result.body.lines)
      ? entry.result.body.lines.filter((line): line is string => typeof line === 'string')
      : []
    const issues = lines
      .map((line) => normalizeIssueLine(entry.id, line))
      .filter((issue): issue is LogIssue => Boolean(issue))

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
    recentIssues: linkIssuesToTasks(dedupeIssues(recentIssues), tasks)
      .sort((a, b) => issueTimestamp(a) - issueTimestamp(b))
      .slice(-6)
      .reverse()
  }
}

function normalizeTaskHealth(tasks: Task[], days: number): HermesDiagnosticsStatus['taskHealth'] {
  const since = Date.now() - days * 24 * 60 * 60 * 1000
  const recentTasks = tasks.filter((task) => taskTimestamp(task) >= since)
  const toolStats = new Map<string, ToolStats>()
  const issueMap = new Map<string, HermesDiagnosticsStatus['taskHealth']['recentTaskIssues'][number]>()

  for (const task of recentTasks) {
    if (task.status === 'failed') {
      addTaskIssue(issueMap, task, undefined, task.error || '任务失败：Hermes 没有返回可用结果。')
    }

    for (const event of task.events ?? []) {
      if (!isRecentEvent(event, since)) continue
      if (event.type === 'tool.started' || event.type === 'tool.completed') {
        const name = diagnosticsToolName(event)
        const stats = ensureToolStats(toolStats, name)
        if (event.type === 'tool.started') stats.calls += 1
        if (event.type === 'tool.completed' && stats.calls === 0) stats.calls += 1
        const duration = eventDurationMs(event)
        if (duration !== undefined) stats.durations.push(duration)
        stats.lastTaskId = task.id
        stats.lastTaskTitle = task.title
        stats.lastSeenAt = event.createdAt
        if (event.isError) {
          stats.failures += 1
          const message = taskIssueMessage(event, name)
          stats.lastError = message
          addTaskIssue(issueMap, task, name, message, event.createdAt)
        }
      }
      if (event.type === 'task.failed') addTaskIssue(issueMap, task, undefined, taskIssueMessage(event), event.createdAt)
      if (event.type === 'approval.request' && !hasResolvedBlockingEvent(task.events ?? [], event, 'approval.resolved')) {
        addTaskIssue(issueMap, task, undefined, '等待人工审批：Hermes 需要你确认风险操作，任务会停在审批卡。', event.createdAt)
      }
      if (event.type === 'clarify.request' && !hasResolvedBlockingEvent(task.events ?? [], event, 'clarify.resolved')) {
        addTaskIssue(issueMap, task, undefined, '等待补充信息：Hermes 需要你回答澄清问题后才能继续。', event.createdAt)
      }
    }
  }

  const tools = [...toolStats.values()]
    .map((tool) => ({
      name: tool.name,
      calls: tool.calls,
      failures: tool.failures,
      failureRate: tool.calls ? Math.round((tool.failures / tool.calls) * 100) : 0,
      averageMs: tool.durations.length ? Math.round(tool.durations.reduce((sum, value) => sum + value, 0) / tool.durations.length) : undefined,
      lastTaskId: tool.lastTaskId,
      lastTaskTitle: tool.lastTaskTitle,
      lastError: tool.lastError,
      lastSeenAt: tool.lastSeenAt
    }))
    .sort((a, b) => b.failures - a.failures || b.calls - a.calls || (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''))
    .slice(0, 8)

  const recentTaskIssues = [...issueMap.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8)

  return {
    windowDays: days,
    totalTasks: tasks.length,
    recentTasks: recentTasks.length,
    runningTasks: recentTasks.filter((task) => task.status === 'running').length,
    completedTasks: recentTasks.filter((task) => task.status === 'completed').length,
    failedTasks: recentTasks.filter((task) => task.status === 'failed').length,
    tasksWithIssues: new Set(recentTaskIssues.map((issue) => issue.taskId)).size,
    recentTaskIssues,
    tools
  }
}

function normalizeIssueLine(file: string, line: string): LogIssue | null {
  const level = /\bWARN(?:ING)?\b/i.test(line) ? 'warn' : /\b(ERROR|CRITICAL|Traceback|Exception)\b/i.test(line) ? 'error' : null
  if (!level) return null
  const metadata = parseLogMetadata(line)
  const rawMessage = line
    .replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:,\d+)?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const message = describeKnownIssue(file, rawMessage)
  if (!message) return null
  return {
    id: `${file}:${hashText(`${message}:${metadata.createdAt ?? ''}:${metadata.sessionId ?? ''}`)}`,
    file,
    level,
    message,
    createdAt: metadata.createdAt,
    sessionId: metadata.sessionId
  }
}

function parseLogMetadata(line: string) {
  return {
    createdAt: parseLogTimestamp(line),
    sessionId: parseLogSessionId(line)
  }
}

function parseLogTimestamp(line: string) {
  const match = line.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:[,.](\d{1,6}))?/)
  if (!match) return undefined
  const [, date, time, fraction = '0'] = match
  const milliseconds = fraction.slice(0, 3).padEnd(3, '0')
  const parsed = new Date(`${date}T${time}.${milliseconds}`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

function parseLogSessionId(line: string) {
  const keyed = line.match(/\b(?:session[_-]?id|sessionId|hermesSessionId)[:=\s]+([A-Za-z0-9][A-Za-z0-9._:-]{1,120})/i)
  const direct = line.match(/\b(session-[A-Za-z0-9._:-]+)/i)
  const value = keyed?.[1] ?? direct?.[1]
  return value?.replace(/[),.;\]]+$/, '')
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

function dedupeIssues(issues: LogIssue[]) {
  const latestByKey = new Map<string, LogIssue>()
  for (const issue of issues) {
    const key = [issue.message, issue.sessionId ?? ''].join(':')
    const current = latestByKey.get(key)
    if (!current || issueTimestamp(issue) >= issueTimestamp(current)) latestByKey.set(key, issue)
  }
  return [...latestByKey.values()]
}

function linkIssuesToTasks(issues: LogIssue[], tasks: Task[]) {
  if (!tasks.length) return issues
  return issues.map((issue) => {
    const sessionTask = issue.sessionId
      ? tasks.find((task) => task.hermesSessionId === issue.sessionId)
      : undefined
    if (sessionTask) return attachTaskLink(issue, sessionTask, 'session')

    const timeTask = findTaskByLogTime(tasks, issue.createdAt)
    if (timeTask) return attachTaskLink(issue, timeTask, 'time-window')
    return issue
  })
}

function attachTaskLink(issue: LogIssue, task: Task, linkReason: NonNullable<LogIssue['linkReason']>): LogIssue {
  return {
    ...issue,
    linkedTaskId: task.id,
    linkedTaskTitle: task.title || task.prompt.slice(0, 42) || task.id,
    linkedTaskStatus: task.status,
    linkReason
  }
}

function findTaskByLogTime(tasks: Task[], createdAt?: string) {
  const issueTime = dateTime(createdAt)
  if (!Number.isFinite(issueTime)) return undefined
  return tasks
    .map((task) => ({ task, distance: taskLogDistanceMs(task, issueTime) }))
    .filter((item): item is { task: Task; distance: number } => item.distance !== undefined)
    .sort((a, b) => a.distance - b.distance || taskTimestamp(b.task) - taskTimestamp(a.task))[0]?.task
}

function taskLogDistanceMs(task: Task, issueTime: number) {
  const start = dateTime(task.startedAt) || dateTime(task.createdAt) || dateTime(task.updatedAt)
  const end = dateTime(task.completedAt) || dateTime(task.updatedAt) || start
  if (!Number.isFinite(start) && !Number.isFinite(end)) return undefined
  const windowStart = (Number.isFinite(start) ? start : end) - 5 * 60 * 1000
  const windowEnd = (Number.isFinite(end) ? end : start) + 15 * 60 * 1000
  if (issueTime >= windowStart && issueTime <= windowEnd) {
    const anchors = [start, end].filter(Number.isFinite)
    return Math.min(...anchors.map((anchor) => Math.abs(anchor - issueTime)))
  }
  const anchors = [start, end, dateTime(task.updatedAt), dateTime(task.createdAt)].filter(Number.isFinite)
  const distance = Math.min(...anchors.map((anchor) => Math.abs(anchor - issueTime)))
  return distance <= 15 * 60 * 1000 ? distance : undefined
}

function issueTimestamp(issue: LogIssue) {
  return dateTime(issue.createdAt) || 0
}

function buildSummary(
  status: HermesDiagnosticsStatus['status'],
  usage: HermesDiagnosticsStatus['usage'],
  usageAvailable: boolean,
  issueCount: number,
  taskHealth: HermesDiagnosticsStatus['taskHealth'],
  days: number
) {
  if (status === 'unavailable') return 'Hermes 官方后台未连接，暂时无法读取日志和使用统计。'
  const usageText = !usageAvailable
    ? 'Hermes 使用统计暂不可读。'
    : usage.totalSessions
    ? `最近 ${usage.periodDays || days} 天有 ${usage.totalSessions} 个会话、${usage.totalApiCalls} 次模型调用。`
    : `最近 ${usage.periodDays || days} 天还没有可统计的会话。`
  const taskText = taskHealth.recentTasks
    ? `Cowork 本地有 ${taskHealth.recentTasks} 个近期任务，其中 ${taskHealth.tasksWithIssues} 个需要关注。`
    : 'Cowork 本地暂时没有可关联的近期任务。'
  return issueCount || taskHealth.tasksWithIssues
    ? `${usageText} ${taskText} 发现 ${issueCount} 类后台异常。`
    : `${usageText} ${taskText} 未发现近期错误日志。`
}

function buildNextActions(
  status: HermesDiagnosticsStatus['status'],
  usageAvailable: boolean,
  logsAvailable: boolean,
  issues: HermesDiagnosticsStatus['logHealth']['recentIssues'],
  taskHealth: HermesDiagnosticsStatus['taskHealth']
) {
  if (status === 'unavailable') return ['先在“运行环境”里启动 Hermes 官方后台，然后刷新诊断。']
  const actions: string[] = []
  if (!usageAvailable) actions.push('使用统计暂不可读，先确认 Hermes Dashboard 的 Analytics API 是否可用。')
  if (!logsAvailable) actions.push('日志暂不可读，先确认 Hermes 日志目录和 Dashboard token 是否正常。')
  const messages = issues.map((issue) => issue.message).join('\n')
  if (/模型凭据/.test(messages)) {
    actions.push(taskHealth.recentTasks
      ? '优先查看最近异常对应的任务；如果是模型凭据问题，回到模型设置重填 Key。'
      : '后台日志里有模型凭据失败；先到设置 > 模型重填对应供应商 Key。')
  }
  if (/飞书|消息通道|外部应用授权/.test(messages)) actions.push('飞书消息连接不稳定；先检查网络和代理，再到设置 > 外部应用授权重新登录。')
  if (/审批/.test(messages)) actions.push('最近有命令审批未完成；下次任务出现审批卡时，需要在对话区直接确认或拒绝。')
  if (/MCP/.test(messages)) actions.push('最近有 MCP 工具异常；到技能页检查对应 MCP 的启用状态和凭据。')
  if (taskHealth.tasksWithIssues) actions.push('先打开最近失败或等待输入的任务；如果同一工具反复失败，再到技能页检查对应能力。')
  if (taskHealth.tools.some((tool) => tool.failures > 0 && tool.failureRate >= 50)) actions.push('有工具失败率偏高；优先处理失败率最高的工具，再重新运行相关任务。')
  if (issues.length && !actions.length) actions.push('最近有未归类异常；如果同一任务反复失败，再打开诊断详情定位来源。')
  if (!actions.length) actions.push('当前不需要处理，继续正常使用。')
  return Array.from(new Set(actions))
}

function taskTimestamp(task: Task) {
  return dateTime(task.updatedAt || task.completedAt || task.startedAt || task.createdAt) || 0
}

function isRecentEvent(event: ExecutionEvent, since: number) {
  const timestamp = dateTime(event.createdAt)
  return !Number.isFinite(timestamp) || timestamp >= since
}

function ensureToolStats(toolStats: Map<string, ToolStats>, name: string): ToolStats {
  const current = toolStats.get(name)
  if (current) return current
  const created: ToolStats = { name, calls: 0, failures: 0, durations: [] }
  toolStats.set(name, created)
  return created
}

function addTaskIssue(
  issueMap: Map<string, HermesDiagnosticsStatus['taskHealth']['recentTaskIssues'][number]>,
  task: Task,
  toolName: string | undefined,
  message: string,
  updatedAt = task.updatedAt
) {
  const normalized = message.trim()
  if (!normalized) return
  const key = `${task.id}:${toolName ?? 'task'}:${normalized}`
  issueMap.set(key, {
    id: `${task.id}:${hashText(key)}`,
    taskId: task.id,
    title: task.title || task.prompt.slice(0, 42) || task.id,
    status: task.status,
    hermesSessionId: task.hermesSessionId,
    toolName,
    message: normalized,
    updatedAt
  })
}

function diagnosticsToolName(event: ExecutionEvent) {
  if (typeof event.name === 'string' && event.name.trim()) return humanToolName(event.name)
  if (Array.isArray(event.args)) {
    const [, maybeName] = event.args
    if (typeof maybeName === 'string' && maybeName.trim()) return humanToolName(maybeName)
    const [kind] = event.args
    if (typeof kind === 'string' && kind.trim()) return humanToolName(kind)
  }
  return humanToolName(event.type.replace(/^tool\./, '') || '工具')
}

function humanToolName(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('mimo_web_search') || lower.includes('web_search') || lower.includes('smart_search')) return '网页搜索'
  if (lower.includes('browser') || lower.includes('playwright') || lower.includes('chrome')) return '浏览器'
  if (lower.includes('terminal') || lower.includes('shell') || lower.includes('command')) return '命令行'
  if (lower.includes('file') || lower.includes('workspace') || lower.includes('read') || lower.includes('write')) return '文件读写'
  if (lower.includes('lark') || lower.includes('feishu')) return '飞书'
  if (lower.includes('mcp')) return 'MCP 工具'
  return name
}

function eventDurationMs(event: ExecutionEvent) {
  for (const key of ['elapsedMs', 'durationMs', 'duration_ms', 'runtimeMs']) {
    const value = event[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  }
  return undefined
}

function taskIssueMessage(event: ExecutionEvent, toolName?: string) {
  const raw = [
    event.error,
    event.message,
    event.summary,
    typeof event.result === 'string' ? event.result : undefined,
    Array.isArray(event.args) ? event.args.find((item) => typeof item === 'string') : undefined
  ].find((value): value is string => typeof value === 'string' && Boolean(value.trim()))
  const described = describeKnownIssue('task', raw ?? '')
  if (described && !described.startsWith('未归类异常')) return described
  if (toolName) return `${toolName} 执行失败：请检查该工具的授权、配置或输入参数。`
  return described || '任务失败：Hermes 没有返回可用结果。'
}

function hasResolvedBlockingEvent(events: ExecutionEvent[], request: ExecutionEvent, resolvedType: string) {
  const requestTime = dateTime(request.createdAt)
  return events.some((event) => {
    if (event.type !== resolvedType) return false
    const eventTime = dateTime(event.createdAt)
    return !Number.isFinite(eventTime) || !Number.isFinite(requestTime) || eventTime >= requestTime
  })
}

function dateTime(value?: string) {
  if (!value) return Number.NaN
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : Number.NaN
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
