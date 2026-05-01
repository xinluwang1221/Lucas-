import type { ExecutionEvent, Task, WorkspaceFile } from '../../lib/api'
import { taskResultText } from './messageUtils'

export type TodoStepStatus = 'done' | 'running' | 'pending' | 'skipped' | 'stopped' | 'failed'
export type AgentWorkMode = 'plan' | 'react' | 'reflection' | 'result'

export type StepView = {
  label: string
  status: TodoStepStatus
  mode: AgentWorkMode
}

export type TodoStepItem = StepView & {
  detail: string
  source: 'hermes' | 'inferred'
}

type ParsedTodoStep = {
  label: string
  detail: string
  mode: AgentWorkMode
  status?: TodoStepStatus
}

export type TraceKind = 'thinking' | 'search' | 'file' | 'tool' | 'status' | 'done' | 'stopped' | 'error'

export type TraceRowView = {
  id: string
  kind: TraceKind
  title: string
  detail: string
  createdAt: string
}

export type TraceRow = TraceRowView
export type TraceGroupKind = 'thinking' | 'search' | 'file' | 'tool' | 'result' | 'error'

export type TraceGroupView = {
  kind: TraceGroupKind
  label: string
  iconKind: TraceKind
  rows: TraceRow[]
}

export type ContextFileItem = {
  name: string
  reference: string
  size: number
  percent: number
  matched: boolean
}

export type ContextResourceSnapshot = {
  files: ContextFileItem[]
  links: string[]
  tools: string[]
  skills: string[]
}

export function taskStepItems(task: Task): TodoStepItem[] {
  const explicitSteps = explicitHermesDecomposition(task)
  if (explicitSteps.length) return explicitSteps

  const dynamicSteps = inferredTaskDecomposition(task)
  if (dynamicSteps.length) return dynamicSteps

  return [
    {
      label: intentTitleFromPrompt(task.prompt),
      detail: intentDetailFromPrompt(task.prompt),
      status: task.status === 'running' ? 'running' : 'done',
      mode: 'plan',
      source: 'inferred'
    }
  ]
}

export function workModeLabel(mode: AgentWorkMode | string) {
  if (mode === 'plan') return '计划'
  if (mode === 'react') return '行动'
  if (mode === 'reflection') return '校验'
  return '结果'
}

export function taskProgressSummary(task: Task) {
  const steps = taskStepItems(task)
  const activeStep = steps.find((step) => ['running', 'failed', 'stopped'].includes(step.status))
    ?? steps.filter((step) => step.status === 'done').at(-1)
    ?? steps[0]
  const doneCount = steps.filter((step) => step.status === 'done' || step.status === 'skipped').length
  const totalCount = steps.length
  return {
    currentLabel: activeStep ? activeStep.label : '等待开始',
    doneCount,
    totalCount,
    percent: Math.min(100, Math.round((doneCount / totalCount) * 100))
  }
}

export function groupTraceRows(rows: TraceRow[]): TraceGroupView[] {
  const groups = new Map<TraceGroupKind, TraceRow[]>()

  for (const row of rows) {
    const groupKind = traceGroupKind(row)
    groups.set(groupKind, [...(groups.get(groupKind) ?? []), row])
  }

  return traceGroupOrder
    .map((kind) => {
      const groupRows = groups.get(kind) ?? []
      if (!groupRows.length) return null
      return {
        kind,
        label: traceGroupLabel(kind),
        iconKind: traceGroupIconKind(kind),
        rows: groupRows
      }
    })
    .filter((group): group is TraceGroupView => Boolean(group))
}

export function traceSummaryParts(task: Task, rows: TraceRow[]) {
  const searchCount = rows.filter((row) => row.kind === 'search').length
  const toolCount = rows.filter((row) => row.kind === 'tool').length
  const fileCount = rows.filter((row) => row.kind === 'file').length
  const errorCount = rows.filter((row) => row.kind === 'error').length
  const parts = [
    searchCount > 0 ? `${searchCount} 次检索` : '',
    toolCount > 0 ? `${toolCount} 次工具` : '',
    fileCount > 0 ? `${fileCount} 个文件` : '',
    task.artifacts.length > 0 ? `${task.artifacts.length} 个产物` : '',
    errorCount > 0 ? `${errorCount} 个异常` : ''
  ].filter(Boolean)
  if (task.status === 'running' && !parts.length) return ['Hermes 正在处理']
  return parts
}

export function executionTraceRows(task: Task): TraceRow[] {
  if (task.executionView?.activity?.length) {
    return task.executionView.activity.map((activity) => ({
      id: activity.id,
      kind: activity.kind,
      title: activity.title,
      detail: activity.detail,
      createdAt: activity.createdAt
    })).slice(-24)
  }

  const rows = taskRunEvents(task)
    .filter((event) =>
      ['bridge.started', 'step', 'thinking', 'status', 'tool.started', 'tool.completed', 'tool.progress', 'artifact.created', 'approval.request', 'approval.resolved', 'task.completed', 'task.stopped', 'task.failed'].includes(
        event.type
      )
    )
    .map((event): TraceRow => {
      if (event.type === 'thinking') {
        if (!isDisplayableThinkingText(eventSummary(event))) {
          return {
            id: event.id,
            kind: 'status',
            title: 'Hermes 正在思考',
            detail: '',
            createdAt: event.createdAt
          }
        }
        return {
          id: event.id,
          kind: 'thinking',
          title: '思考',
          detail: eventSummary(event),
          createdAt: event.createdAt
        }
      }
      if (event.type === 'step') {
        return {
          id: event.id,
          kind: 'thinking',
          title: eventTitle(event),
          detail: eventSummary(event),
          createdAt: event.createdAt
        }
      }
      if (event.type.startsWith('tool.')) {
        const name = toolDisplayName(event)
        return {
          id: event.id,
          kind: traceToolKind(name, event),
          title: `${toolPhaseLabel(event)}：${name}`,
          detail: traceToolDetail(event),
          createdAt: event.createdAt
        }
      }
      if (event.type === 'artifact.created') {
        return {
          id: event.id,
          kind: 'file',
          title: `生成产物：${String(event.name ?? '文件')}`,
          detail: eventSummary(event),
          createdAt: event.createdAt
        }
      }
      if (event.type === 'task.completed') {
        return {
          id: event.id,
          kind: 'done',
          title: '任务完成',
          detail: 'Hermes 已返回最终结果',
          createdAt: event.createdAt
        }
      }
      if (event.type === 'task.stopped') {
        return {
          id: event.id,
          kind: 'stopped',
          title: '任务已停止',
          detail: eventSummary(event),
          createdAt: event.createdAt
        }
      }
      if (event.type === 'task.failed') {
        return {
          id: event.id,
          kind: 'error',
          title: '任务失败',
          detail: eventSummary(event),
          createdAt: event.createdAt
        }
      }
      if (event.type === 'approval.request') {
        return {
          id: event.id,
          kind: 'status',
          title: '需要人工确认',
          detail: approvalRequestMessage(event),
          createdAt: event.createdAt
        }
      }
      if (event.type === 'approval.resolved') {
        return {
          id: event.id,
          kind: event.choice === 'deny' ? 'stopped' : 'status',
          title: event.choice === 'deny' ? '已拒绝命令' : '已确认命令',
          detail: eventSummary(event) || '命令审批已处理',
          createdAt: event.createdAt
        }
      }
      return {
        id: event.id,
        kind: 'status',
        title: eventTitle(event),
        detail: eventSummary(event),
        createdAt: event.createdAt
      }
    })

  if (task.status === 'completed' && !rows.some((row) => row.kind === 'done')) {
    rows.push({
      id: `${task.id}-completed`,
      kind: 'done',
      title: '任务完成',
      detail: 'Hermes 已返回最终结果',
      createdAt: task.completedAt ?? task.updatedAt
    })
  }

  if (task.status === 'stopped' && !rows.some((row) => row.kind === 'stopped')) {
    rows.push({
      id: `${task.id}-stopped`,
      kind: 'stopped',
      title: '任务已停止',
      detail: '用户已停止这次执行',
      createdAt: task.completedAt ?? task.updatedAt
    })
  }

  if (task.status === 'failed' && !rows.some((row) => row.kind === 'error')) {
    rows.push({
      id: `${task.id}-failed`,
      kind: 'error',
      title: '任务失败',
      detail: task.error || 'Hermes 返回失败状态',
      createdAt: task.completedAt ?? task.updatedAt
    })
  }

  if (task.status === 'running' && !rows.some((row) => row.kind === 'done' || row.kind === 'error')) {
    rows.push({
      id: `${task.id}-running`,
      kind: 'status',
      title: '持续运行中',
      detail: 'Hermes 正在执行任务，新的思考和操作会继续出现在这里。',
      createdAt: task.updatedAt
    })
  }

  return rows.slice(-24)
}

export function liveTraceRows(task: Task): TraceRow[] {
  const rows = executionTraceRows(task)
    .filter((row) => row.kind !== 'done' && row.kind !== 'stopped')
    .filter((row) => row.title !== '任务完成')

  if (!rows.length) return [fallbackLiveTraceRow(task)]

  const durableRows = rows.filter((row) => {
    if (row.title === '持续运行中' && rows.length > 1) return false
    return true
  })

  return (durableRows.length ? durableRows : rows).slice(-6)
}

export function fallbackLiveTraceRow(task: Task): TraceRow {
  return {
    id: `${task.id}-live-fallback`,
    kind: 'thinking',
    title: '正在确认任务目标',
    detail: 'Hermes 已收到你的问题，正在准备计划和工具行动。',
    createdAt: task.updatedAt
  }
}

export function compactTraceRows(task: Task, rows: TraceRow[]) {
  if (task.status === 'running') return rows.slice(-8)

  const durableRows = rows.filter((row) => row.kind !== 'thinking' || row.title !== '思考')
  return (durableRows.length ? durableRows : rows).slice(-5)
}

export function taskOperationStats(task: Task) {
  const rows = executionTraceRows(task)
  return {
    thinking: rows.filter((row) => row.kind === 'thinking').length,
    tools: rows.filter((row) => row.kind === 'tool' || row.kind === 'search' || row.kind === 'file').length,
    files: rows.filter((row) => row.kind === 'file').length,
    errors: rows.filter((row) => row.kind === 'error').length
  }
}

export function taskElapsedLabel(task: Task) {
  const start = task.startedAt ?? task.createdAt
  const end = task.completedAt ?? (task.status === 'running' ? new Date().toISOString() : task.updatedAt)
  const elapsed = Math.max(0, new Date(end).getTime() - new Date(start).getTime())
  if (!Number.isFinite(elapsed) || elapsed <= 0) return '刚刚'
  const seconds = Math.floor(elapsed / 1000)
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const restSeconds = seconds % 60
  if (minutes < 60) return restSeconds ? `${minutes} 分 ${restSeconds} 秒` : `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes ? `${hours} 小时 ${restMinutes} 分` : `${hours} 小时`
}

export function extractTaskReferences(task: Task) {
  const text = [
    task.prompt,
    task.stdout ?? '',
    ...(task.events ?? []).flatMap((event) => [
      toolPrimaryText(event),
      payloadText(event.args),
      payloadText(event.kwargs),
      payloadText(event.result)
    ])
  ].join('\n')
  return extractReferencesFromText(text)
}

export function buildContextResourceSnapshot(task: Task, workspaceFiles: WorkspaceFile[]): ContextResourceSnapshot {
  const liveResources = currentAgentResources(task)
  const allReferences = extractTaskReferences(task)
  const allLinks = allReferences.filter((reference) => /^https?:\/\//.test(reference))
  const allFiles = allReferences.filter((reference) => !/^https?:\/\//.test(reference))
  const files = resolveContextFiles(uniqueCompact([...liveResources.files, ...allFiles]), workspaceFiles)
  return {
    files,
    links: uniqueByDisplay([...liveResources.links, ...allLinks]).slice(0, 10),
    tools: uniqueCompact(liveResources.tools).slice(0, 10),
    skills: uniqueCompact(liveResources.skills).slice(0, 10)
  }
}

export function isUserVisibleExecutionEvent(event: ExecutionEvent) {
  if (event.type === 'message.delta' || event.type === 'message.complete') return false
  if (event.type === 'reasoning.delta' || event.type === 'thinking.delta' || event.type === 'tool.generating') return false
  if (event.ephemeral && event.type !== 'status') return false
  if (event.type === 'status' && isEphemeralStatusEvent(event)) return false
  if (event.type === 'thinking' && !isDisplayableThinkingText(eventSummary(event))) return false
  if (event.type === 'tool.progress' && isInternalToolName(toolDisplayName(event))) return false
  return true
}

const traceGroupOrder: TraceGroupKind[] = ['thinking', 'search', 'file', 'tool', 'result', 'error']

function explicitHermesDecomposition(task: Task): TodoStepItem[] {
  const events = taskRunEvents(task)
  const planEvent = [...events].reverse().find((event) =>
    Array.isArray(event.steps) ||
    Array.isArray(event.todos) ||
    Array.isArray(event.items) ||
    /(^|\.)(plan|todo|decomposition|task_step)/i.test(event.type)
  )
  if (!planEvent) return []

  const rawSteps = [
    ...arrayStepValues(planEvent.steps),
    ...arrayStepValues(planEvent.todos),
    ...arrayStepValues(planEvent.items)
  ]
  const parsedSteps: ParsedTodoStep[] = rawSteps.length ? rawSteps : parsePlanLines(eventSummary(planEvent))
  if (!parsedSteps.length) return []

  const activeIndex = explicitActiveStepIndex(parsedSteps.length, task)
  return parsedSteps.slice(0, 6).map((step, index) => ({
    label: normalizeHermesTodoTitle(step.label || step.detail, step.mode),
    detail: normalizeStepDetail(step.detail || step.label),
    status: step.status ?? explicitStepStatus(index, activeIndex, task),
    mode: step.mode,
    source: 'hermes' as const
  }))
}

function inferredTaskDecomposition(task: Task): TodoStepItem[] {
  if (task.status === 'completed') {
    return [{
      label: '任务已完成',
      detail: task.artifacts.length ? `${task.artifacts.length} 个文件已加入产物区` : 'Hermes 未返回结构化计划，结果见对话区。',
      status: 'done',
      mode: 'result',
      source: 'inferred'
    }]
  }
  if (task.status === 'failed') {
    return [{
      label: '处理失败',
      detail: compactStepDetail(task.error || 'Hermes 返回失败状态'),
      status: 'failed',
      mode: 'reflection',
      source: 'inferred'
    }]
  }
  if (task.status === 'stopped') {
    return [{
      label: '任务停止',
      detail: '用户主动停止了这次执行',
      status: 'stopped',
      mode: 'result',
      source: 'inferred'
    }]
  }
  return [{
    label: task.status === 'idle' ? '等待开始' : '等待 Hermes 规划',
    detail: task.status === 'idle'
      ? intentDetailFromPrompt(task.prompt)
      : 'Hermes 还没有返回结构化任务计划。工具调用会出现在过程资源中，不再混入任务拆解。',
    status: task.status === 'running' ? 'running' : 'pending',
    mode: 'plan',
    source: 'inferred'
  }]
}

function arrayStepValues(value: unknown): ParsedTodoStep[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item, index) => {
      if (typeof item === 'string') {
        return { label: compactStepDetail(item, 28), detail: compactStepDetail(item), mode: inferModeFromText(item) }
      }
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const label = String(record.title ?? record.content ?? record.label ?? record.name ?? `步骤 ${index + 1}`)
      const detail = String(record.detail ?? record.description ?? record.summary ?? record.content ?? label)
      const status = normalizeTodoStatus(record.status)
      return { label: compactStepDetail(label, 28), detail: compactStepDetail(detail), mode: inferModeFromText(`${label} ${detail}`), status }
    })
    .filter((item): item is ParsedTodoStep => Boolean(item))
}

function normalizeTodoStatus(value: unknown): TodoStepStatus | undefined {
  const status = String(value ?? '').toLowerCase()
  if (status === 'completed' || status === 'done') return 'done'
  if (status === 'in_progress' || status === 'running') return 'running'
  if (status === 'pending' || status === 'todo') return 'pending'
  if (status === 'cancelled' || status === 'canceled' || status === 'skipped') return 'skipped'
  if (status === 'failed' || status === 'error') return 'failed'
  if (status === 'stopped') return 'stopped'
  return undefined
}

function parsePlanLines(text: string): ParsedTodoStep[] {
  if (!/(plan|todo|步骤|计划|拆解|规划)/i.test(text)) return []
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .map((line) => line.match(/^(?:[-*•]\s*|\d+[.、)]\s*|[一二三四五六七八九十]+[、.]\s*)(.+)$/)?.[1] ?? '')
    .filter(Boolean)
    .slice(0, 8)
    .map((line) => ({ label: compactStepDetail(line, 28), detail: compactStepDetail(line), mode: inferModeFromText(line) }))
}

function explicitActiveStepIndex(total: number, task: Task) {
  if (task.status === 'completed') return total
  if (task.status === 'failed' || task.status === 'stopped') return Math.max(0, total - 1)
  const events = taskRunEvents(task)
  const progressSignals = events.filter((event) => event.type.startsWith('tool.') || event.type === 'artifact.created' || event.type === 'step').length
  return Math.max(0, Math.min(total - 1, progressSignals))
}

function explicitStepStatus(index: number, activeIndex: number, task: Task): TodoStepStatus {
  if (task.status === 'completed') return 'done'
  if (task.status === 'failed' && index === activeIndex) return 'failed'
  if (task.status === 'stopped' && index === activeIndex) return 'stopped'
  if (index < activeIndex) return 'done'
  if (index === activeIndex && task.status === 'running') return 'running'
  return 'pending'
}

function dedupeTodoSteps(steps: TodoStepItem[]) {
  const seen = new Set<string>()
  return steps.filter((step) => {
    const key = `${step.label}:${step.detail}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function toolEventKey(event: ExecutionEvent) {
  return String(event.toolCallId ?? event.name ?? event.id)
}

function toolStillRunning(startEvent: ExecutionEvent, events: ExecutionEvent[]) {
  const key = toolEventKey(startEvent)
  return !events.some((event) => event.type === 'tool.completed' && toolEventKey(event) === key)
}

function inferPlanningTitle(event: ExecutionEvent, prompt = '') {
  const text = stepEventText(event)
  const cleaned = stripBackendNoise(text)
  if (cleaned) return normalizeStepTitle(cleaned, planningText(cleaned) ? 'plan' : inferModeFromText(cleaned))
  if (event.type === 'step') return '推进任务计划'
  return intentTitleFromPrompt(prompt)
}

function planningText(text: string) {
  return /(plan|todo|步骤|计划|拆解|规划|方案|先.*再)/i.test(text)
}

function reflectionText(text: string) {
  return /(reflect|reflection|review|verify|retry|fix|检查|验证|校验|复测|反思|修正|重试|错误|失败)/i.test(text)
}

function meaningfulStepText(text: string) {
  const compact = text.trim()
  return compact && !/^(Hermes 正在处理|Hermes 正在思考|thinking|reasoning|\(\s*[·.\-▮\s]+\s*\))$/i.test(compact)
}

function inferModeFromText(text: string): AgentWorkMode {
  if (reflectionText(text)) return 'reflection'
  if (planningText(text)) return 'plan'
  if (/tool|search|browser|file|网页|搜索|工具|读取|写入|调用/.test(text)) return 'react'
  return 'plan'
}

function compactStepDetail(value: string, maxLength = 72) {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, maxLength - 1)}…`
}

function normalizeStepTitle(value: string, mode: AgentWorkMode) {
  const text = stripBackendNoise(value)
  if (!text) return mode === 'result' ? '整理结果' : mode === 'reflection' ? '检查与修正' : '明确任务目标'
  const lower = text.toLowerCase()
  if (/你好|您好|hello|hi\b/.test(lower) && text.length <= 24) return '回应问候'
  if (looksLikeUserStepTitle(text)) return compactStepDetail(text, 24)
  if (/(验证|测试|复测|检查).*(后端|运行|runtime|gateway|接口|服务)|后端.*(验证|测试|复测)/i.test(text)) return '验证运行状态'
  if (/模型|api\s*key|plan\s*key|base\s*url|凭据|provider|供应商|key/i.test(text)) return '配置模型服务'
  if (/工作区|文件夹|目录|授权目录|workspace/.test(lower)) return '管理工作区'
  if (/预览|打开.*文件|pdf|docx|pptx|xlsx|csv/.test(lower)) return '预览文件'
  if (/讲一下|解释|说明|介绍|怎么理解/.test(text)) return '解释问题'
  if (/github|网页|联网|搜索|检索|资料|调研|查找|search|browser|web/.test(lower)) return '检索资料'
  if (/读取|查看|文件|目录|工作区|文档|pdf|docx|pptx|xlsx|csv|read|file|workspace/.test(lower)) return '读取文件'
  if (/写入|生成|创建|修改|编辑|输出|产物|报告|文档|write|create|edit|artifact/.test(lower)) return '生成产物'
  if (reflectionText(text)) return '检查与修正'
  if (planningText(text) || mode === 'plan') return '明确任务目标'
  if (mode === 'result') return '整理结果'
  if (mode === 'react') return '执行操作'
  return compactStepDetail(text, 18)
}

function normalizeHermesTodoTitle(value: string, mode: AgentWorkMode) {
  const text = stripBackendNoise(value)
  if (!text) return mode === 'result' ? '整理结果' : mode === 'reflection' ? '检查与修正' : '明确任务目标'
  return compactStepDetail(text, 28)
}

function looksLikeUserStepTitle(text: string) {
  return (
    text.length <= 30 &&
    /^(获取|加载|分析|改写|输出|克隆|识别|生成|梳理|读取|搜索|检查|验证|调用|整理|确认|修复|创建|打开|下载|上传|查询|汇总|提取|转换|更新|发布|测试)/.test(text)
  )
}

function normalizeStepDetail(value: string) {
  const text = stripBackendNoise(value)
  return text ? compactStepDetail(text) : '等待 Hermes 回传更具体的执行信息'
}

function stripBackendNoise(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^The user is\s*/i, '')
    .replace(/^Hermes\s*(正在处理|正在思考|已返回最终结果)[。.]?$/i, '')
    .replace(/^\d+\s*个上一轮工具结果$/i, '')
    .replace(/^工具(开始执行|执行完成)$/i, '')
    .replace(/^返回结果$/i, '')
    .trim()
}

function intentTitleFromPrompt(prompt: string) {
  const text = stripBackendNoise(prompt)
  if (/^(你好|您好|hello|hi)[！!。.\s]*$/i.test(text)) return '回应问候'
  if (/(验证|测试|复测|检查).*(后端|运行|runtime|gateway|接口|服务)|后端.*(验证|测试|复测)/i.test(text)) return '验证运行状态'
  if (/模型|API\s*Key|Plan\s*Key|Base\s*URL|凭据|供应商|provider|key/i.test(text)) return '配置模型服务'
  if (/工作区|文件夹|目录|授权目录|workspace/i.test(text)) return '管理工作区'
  if (/预览|打开.*文件|pdf|docx|pptx|xlsx|csv/i.test(text)) return '预览文件'
  if (/讲一下|解释|说明|介绍|怎么理解/.test(text)) return '解释问题'
  if (/总结|整理|归纳|报告|文档/.test(text)) return '整理需求'
  if (/分析|判断|评估|对比|找原因/.test(text)) return '分析目标'
  if (/搜索|查|调研|github|网页|官网/.test(text.toLowerCase())) return '确认调研目标'
  if (/生成|创建|写|改|优化|开发/.test(text)) return '确认交付目标'
  return '明确任务目标'
}

function intentDetailFromPrompt(prompt: string) {
  const text = stripBackendNoise(prompt)
  return text ? compactStepDetail(text) : '等待输入任务目标'
}

function toolStepTitle(event: ExecutionEvent, kind: TraceKind) {
  const text = `${toolDisplayName(event)} ${toolPrimaryText(event)} ${eventSummary(event)}`
  if (kind === 'search') return '检索资料'
  if (kind === 'file') return /写入|生成|创建|修改|edit|write|create/i.test(text) ? '处理文件' : '读取文件'
  if (kind === 'error') return `处理异常：${humanToolName(toolDisplayName(event))}`
  return `调用工具：${humanToolName(toolDisplayName(event))}`
}

function shortArtifactName(name: string) {
  return compactStepDetail(fileNameFromReference(name), 18)
}

function resultTitleForTask(task: Task) {
  if (task.artifacts.length) return '交付产物'
  const result = taskResultText(task)
  if (result.length <= 80 && /^(你好|您好|hello|hi|心路|好的|可以|没问题)/i.test(result.trim())) return '完成回复'
  return '整理结果'
}

function resultDetailForTask(task: Task) {
  if (task.artifacts.length) return `${task.artifacts.length} 个文件已加入产物区`
  const result = stripBackendNoise(taskResultText(task))
  return result ? compactStepDetail(result) : 'Hermes 已完成本轮回复'
}

function stepEventText(event: ExecutionEvent) {
  const text = eventSummary(event)
  if (/(contemplating|thinking|reasoning)\.\.\./i.test(text)) return ''
  if (/^[\s()[\]{}·.\-▮▯ʕ｡•ᴥ•｡ʔ]+$/.test(text)) return ''
  return text
}

function traceGroupKind(row: TraceRow): TraceGroupKind {
  if (row.kind === 'search') return 'search'
  if (row.kind === 'file') return 'file'
  if (row.kind === 'tool') return 'tool'
  if (row.kind === 'done' || row.kind === 'stopped') return 'result'
  if (row.kind === 'error') return 'error'
  return 'thinking'
}

function traceGroupLabel(kind: TraceGroupKind) {
  if (kind === 'thinking') return '思考与规划'
  if (kind === 'search') return '网页与搜索'
  if (kind === 'file') return '文件活动'
  if (kind === 'tool') return '工具调用'
  if (kind === 'result') return '结果'
  return '错误'
}

function traceGroupIconKind(kind: TraceGroupKind): TraceKind {
  if (kind === 'thinking') return 'thinking'
  if (kind === 'search') return 'search'
  if (kind === 'file') return 'file'
  if (kind === 'tool') return 'tool'
  if (kind === 'result') return 'done'
  return 'error'
}

function isEphemeralStatusEvent(event: ExecutionEvent) {
  const text = eventSummary(event).trim()
  if (String(event.kind ?? '').toLowerCase() === 'reasoning') return true
  return /^(Hermes 正在思考|Hermes 正在处理|thinking|reasoning)$/i.test(text)
}

function isDisplayableThinkingText(value: string) {
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return false
  if (/^(thinking|reasoning|computing|analyzing|deliberating|reflecting)(\.\.\.)?$/i.test(text)) return false
  if (/^[()[\]{}·.\-▮▯ʕ｡•ᴥ•｡ʔ\s]+$/.test(text)) return false
  if (/^[A-Za-z0-9_`'".,;:!?()/-]+$/.test(text) && text.length < 18) return false
  if (/^[A-Za-z0-9_`'".,;:!?()/-]+(?:\s+[A-Za-z0-9_`'".,;:!?()/-]+){0,3}$/.test(text)) return false
  if (/^(the|a|an|and|or|to|in|of|for|with|terminal|configuration|files?|now|let|me|look)$/i.test(text)) return false
  return /(计划|步骤|拆解|检查|验证|校验|修正|搜索|读取|写入|调用|生成|完成|失败|需要|将|先|再|plan|todo|verify|check|search|read|write|tool|file)/i.test(text)
}

function approvalRequestMessage(event: ExecutionEvent) {
  const command = String(event.command ?? '').replace(/\s+/g, ' ').trim()
  return command
    ? `Hermes 请求执行需要人工确认的命令。${command.slice(0, 120)}`
    : 'Hermes 请求执行需要人工确认的命令。'
}

function taskRunEvents(task: Task) {
  const runStartedAt = new Date(task.startedAt ?? task.createdAt).getTime()
  if (!Number.isFinite(runStartedAt)) return (task.events ?? []).filter(isUserVisibleExecutionEvent)

  let events = (task.events ?? []).filter((event) => {
    const eventTime = new Date(event.createdAt).getTime()
    return !Number.isFinite(eventTime) || eventTime >= runStartedAt - 1000
  }).filter(isUserVisibleExecutionEvent)

  if (task.status === 'completed') {
    events = events.filter((event) => event.category !== 'error')
  }

  if (task.status === 'completed' || task.status === 'failed' || task.status === 'stopped') {
    const terminalIndex = events.findIndex((event) => ['task.completed', 'task.failed', 'task.stopped'].includes(event.type))
    if (terminalIndex >= 0) return events.slice(0, terminalIndex + 1)
  }

  return events
}

function traceToolKind(name: string, event: ExecutionEvent): TraceKind {
  if (event.category === 'search') return 'search'
  if (event.category === 'file') return 'file'
  if (event.category === 'error') return 'error'
  if (event.category === 'result') return 'done'
  const text = `${name} ${event.type} ${toolPrimaryText(event)} ${payloadText(event.args)} ${payloadText(event.kwargs)}`.toLowerCase()
  if (event.isError) return 'error'
  if (text.includes('search') || text.includes('browser') || text.includes('web') || text.includes('url') || text.includes('http')) return 'search'
  if (text.includes('file') || text.includes('read') || text.includes('write') || text.includes('workspace') || text.includes('path')) return 'file'
  return 'tool'
}

function traceToolDetail(event: ExecutionEvent) {
  const primary = toolPrimaryText(event)
  if (primary) return stringifyPreview(primary, 180)
  if (event.type === 'tool.started') return stringifyPreview(event.args ?? event.kwargs ?? '工具开始执行', 180)
  if (event.type === 'tool.completed') return event.isError ? eventSummary(event) : stringifyPreview(event.result ?? '工具执行完成', 180)
  return eventSummary(event)
}

function extractReferencesFromText(text: string) {
  const urls = text.match(/https?:\/\/[^\s"'<>）)]+/g) ?? []
  const files = text.match(/(?:\/Users\/[^\s"'<>]+|[\w.-]+\/[\w./-]+\.(?:md|csv|xlsx|pdf|docx|txt|json))/g) ?? []
  return [...new Set([...urls, ...files])].slice(0, 16)
}

function currentAgentResources(task: Task) {
  const events = currentResourceEvents(task)
  const eventText = events
    .flatMap((event) => [
      event.name,
      eventSummary(event),
      toolPrimaryText(event),
      payloadText(event.args),
      payloadText(event.kwargs),
      payloadText(event.result)
    ])
    .join('\n')
  const references = extractReferencesFromText(eventText)
  const links = references.filter((reference) => /^https?:\/\//.test(reference))
  const files = [
    ...references.filter((reference) => !/^https?:\/\//.test(reference)),
    ...events
      .filter((event) => event.type === 'artifact.created')
      .map((event) => String(event.relativePath ?? event.name ?? ''))
      .filter(Boolean)
  ]
  const tools = events
    .filter((event) => event.type.startsWith('tool.'))
    .map((event) => humanToolName(toolDisplayName(event)))
    .filter((name) => name && !isInternalToolName(name))
  return {
    tools: uniqueCompact(tools).slice(0, 8),
    links: uniqueByDisplay(links).slice(0, 8),
    files: uniqueCompact(files).slice(0, 12),
    skills: uniqueCompact(task.skillNames ?? []).slice(0, 8)
  }
}

function resolveContextFiles(references: string[], workspaceFiles: WorkspaceFile[]): ContextFileItem[] {
  const fileMatches = references
    .map((reference) => {
      const matched = findWorkspaceFileByReference(reference, workspaceFiles)
      return {
        name: matched?.name ?? fileNameFromReference(reference),
        reference: matched?.relativePath ?? reference,
        size: matched?.size ?? 0,
        percent: 0,
        matched: Boolean(matched)
      }
    })
    .filter((file) => file.name && file.name !== '.')

  const deduped = Array.from(
    fileMatches
      .reduce((map, file) => {
        const key = normalizeReference(file.reference).toLowerCase()
        if (!map.has(key)) map.set(key, file)
        return map
      }, new Map<string, ContextFileItem>())
      .values()
  )
  const totalSize = deduped.reduce((sum, file) => sum + file.size, 0)
  return deduped
    .map((file) => ({
      ...file,
      percent: file.size && totalSize ? Math.max(1, Math.round((file.size / totalSize) * 100)) : 0
    }))
    .sort((a, b) => b.size - a.size || a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .slice(0, 12)
}

function findWorkspaceFileByReference(reference: string, workspaceFiles: WorkspaceFile[]) {
  const normalized = normalizeReference(reference)
  const normalizedLower = normalized.toLowerCase()
  const baseName = fileNameFromReference(normalized).toLowerCase()
  return workspaceFiles.find((file) => {
    const path = normalizeReference(file.path).toLowerCase()
    const relativePath = normalizeReference(file.relativePath).toLowerCase()
    const name = file.name.toLowerCase()
    return (
      normalizedLower === path ||
      normalizedLower === relativePath ||
      path.endsWith(`/${normalizedLower}`) ||
      relativePath.endsWith(normalizedLower) ||
      (baseName.length > 2 && name === baseName)
    )
  })
}

function normalizeReference(value: string) {
  return value.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^["'`]+|["'`,，。；;:：]+$/g, '').trim()
}

function fileNameFromReference(reference: string) {
  const normalized = normalizeReference(reference)
  return normalized.split('/').filter(Boolean).pop() ?? normalized
}

function currentResourceEvents(task: Task) {
  const events = taskRunEvents(task)
  if (task.status !== 'running') return events

  const lastStepIndex = events.reduce((lastIndex, event, index) => {
    if (event.type === 'step' || event.type === 'thinking' || event.type === 'status') return index
    return lastIndex
  }, -1)

  return lastStepIndex >= 0 ? events.slice(lastStepIndex + 1) : events
}

function uniqueCompact(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))]
}

function uniqueByDisplay(items: string[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = shortReference(item)
    if (!key || key === '...') return false
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function humanToolName(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('mimo_web_search') || lower.includes('web_search') || lower.includes('smart_search')) return '网页搜索'
  if (lower.includes('browser') || lower.includes('playwright') || lower.includes('chrome')) return '浏览器'
  if (lower.includes('terminal') || lower.includes('shell') || lower.includes('command')) return '命令行'
  if (lower.includes('file') || lower.includes('workspace')) return '文件读写'
  if (lower.includes('lark') || lower.includes('feishu')) return '飞书'
  return name
}

function isInternalToolName(name: string) {
  const lower = name.toLowerCase()
  return lower.includes('reasoning.') || lower === 'tool.started' || lower === 'tool.completed'
}

function eventTitle(event: ExecutionEvent) {
  if (event.type === 'bridge.started') return '桥接已启动'
  if (event.type === 'step') return `第 ${event.iteration ?? '?'} 轮推理`
  if (event.type === 'thinking') return '思考中'
  if (event.type === 'status') return `状态：${event.kind ?? '运行'}`
  if (event.type === 'tool.started') return `开始工具：${event.name ?? 'tool'}`
  if (event.type === 'tool.completed') return `完成工具：${event.name ?? 'tool'}`
  if (event.type === 'artifact.created') return `生成产物：${event.name ?? '文件'}`
  if (event.type === 'task.completed') return '任务完成'
  if (event.type === 'task.stopped') return '任务已停止'
  if (event.type === 'task.failed') return '任务失败'
  return event.type
}

function eventSummary(event: ExecutionEvent) {
  if (event.type === 'bridge.started') return String(event.cwd ?? '授权工作区')
  if (event.type === 'step') return `${Array.isArray(event.previousTools) ? event.previousTools.length : 0} 个上一轮工具结果`
  if (event.type === 'thinking') return String(event.message || 'Hermes 正在处理')
  if (event.type === 'status') return String(event.message ?? '')
  if (event.type === 'tool.started') return stringifyPreview(event.args, 120)
  if (event.type === 'tool.completed') return event.isError ? '工具返回错误' : String(event.result ?? '工具执行完成').slice(0, 140)
  if (event.type === 'artifact.created') return String(event.summary ?? event.relativePath ?? '文件已加入产物区')
  if (event.type === 'task.completed') return 'Hermes 已返回最终结果'
  if (event.type === 'task.stopped') return String(event.summary ?? '用户已停止当前 Hermes 任务')
  if (event.type === 'task.failed') return String(event.error ?? 'Hermes 执行失败')
  return stringifyPreview(event, 140)
}

function toolDisplayName(event: ExecutionEvent) {
  if (event.name) return String(event.name)
  if (Array.isArray(event.args)) {
    const [, maybeName] = event.args
    if (typeof maybeName === 'string' && maybeName.trim()) return maybeName
    const [kind] = event.args
    if (typeof kind === 'string' && kind.trim()) return kind
  }
  return event.type
}

function toolPhaseLabel(event: ExecutionEvent) {
  if (event.type === 'tool.started') return '开始'
  if (event.type === 'tool.completed') return event.isError ? '异常' : '完成'
  if (event.type === 'tool.progress') return '进度'
  return event.type.replace('tool.', '')
}

function toolPrimaryText(event: ExecutionEvent) {
  if (typeof event.summary === 'string' && event.summary.trim()) return event.summary
  if (typeof event.message === 'string' && event.message.trim()) return event.message
  if (typeof event.text === 'string' && event.text.trim()) return event.text
  if (Array.isArray(event.args) && typeof event.args[2] === 'string' && event.args[2].trim()) return event.args[2]
  if (typeof event.result === 'string' && event.result.trim()) return event.result.slice(0, 180)
  if (typeof event.error === 'string' && event.error.trim()) return event.error
  return ''
}

function payloadText(value: unknown) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function stringifyPreview(value: unknown, limit = 260) {
  let text: string
  if (typeof value === 'string') {
    text = value
  } else {
    try {
      text = JSON.stringify(value, null, 2)
    } catch {
      text = String(value)
    }
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

function shortReference(value: string) {
  try {
    const url = new URL(value)
    return url.hostname.replace(/^www\./, '')
  } catch {
    const parts = value.split(/[\\/]/).filter(Boolean)
    return parts.slice(-2).join('/')
  }
}
