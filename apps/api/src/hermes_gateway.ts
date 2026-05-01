import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { hermesAgentDir, hermesPythonBin } from './paths.js'
import type { HermesBridgeEvent, HermesBridgeResult } from './hermes_python.js'

type JsonRpcResponse = {
  jsonrpc?: '2.0'
  id?: number | string | null
  result?: unknown
  error?: {
    code?: number
    message?: string
  }
}

type GatewayEventFrame = {
  method?: string
  params?: {
    type?: string
    session_id?: string
    payload?: Record<string, unknown>
  }
}

type PendingCall = {
  method: string
  resolve: (value: JsonRpcResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const gatewayIdleNoticeMs = numberEnv('HERMES_COWORK_GATEWAY_IDLE_NOTICE_MS', 30_000)
const gatewayIdleHeartbeatMs = numberEnv('HERMES_COWORK_GATEWAY_IDLE_HEARTBEAT_MS', 15_000)
const gatewayIdleTimeoutMs = numberEnv('HERMES_COWORK_GATEWAY_IDLE_TIMEOUT_MS', 5 * 60_000)

export type HermesGatewayTaskParams = {
  taskId: string
  prompt: string
  cwd: string
  resumeSessionId?: string
  maxTurns?: number
  model?: string
  provider?: string
  skills?: string[]
  enabledSkills?: string[]
  onEvent?: (event: HermesBridgeEvent) => void
  onStdout?: (chunk: string, accumulated: string) => void
  onStderr?: (chunk: string, accumulated: string) => void
  onHandle?: (handle: { kind: string; stop: () => void; approve?: (choice: 'once' | 'session' | 'always' | 'deny') => Promise<void> }) => void
}

class HermesGatewayClient extends EventEmitter {
  private child: ReturnType<typeof spawn> | null = null
  private lineBuffer = ''
  private stderr = ''
  private readyPromise: Promise<void> | null = null
  private readyResolve: (() => void) | null = null
  private readyReject: ((error: Error) => void) | null = null
  private nextId = 1
  private pending = new Map<number, PendingCall>()
  private readonly listenersBySession = new Map<string, Set<(frame: GatewayEventFrame['params']) => void>>()

  constructor(readonly cwd: string) {
    super()
  }

  async start() {
    if (this.child && this.readyPromise) {
      await this.readyPromise
      return
    }

    const child = spawn(hermesPythonBin, ['-u', '-m', 'tui_gateway.entry'], {
      cwd: hermesAgentDir,
      env: {
        ...process.env,
        HERMES_AGENT_DIR: hermesAgentDir,
        PYTHONUNBUFFERED: '1',
        TERMINAL_CWD: this.cwd
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child = child

    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })

    const readyTimer = setTimeout(() => {
      this.readyReject?.(new Error('Hermes gateway 启动超时'))
    }, 15000)

    this.readyPromise.finally(() => clearTimeout(readyTimer)).catch(() => undefined)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => this.handleStdout(String(chunk)))
    child.stderr.on('data', (chunk) => {
      this.stderr = keepTail(`${this.stderr}${String(chunk)}`, 12000)
    })
    child.on('error', (error) => this.failAll(error))
    child.on('close', (code) => {
      const error = new Error(`Hermes gateway 已退出${typeof code === 'number' ? `（${code}）` : ''}`)
      this.child = null
      this.readyPromise = null
      this.readyResolve = null
      this.readyReject = null
      this.failAll(error)
      this.emit('closed', error)
    })

    await this.readyPromise
  }

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = 30000): Promise<T> {
    await this.start()
    const child = this.child
    const stdin = child?.stdin
    if (!stdin?.writable) {
      throw new Error('Hermes gateway stdin 不可写')
    }

    const id = this.nextId++
    const payload = { jsonrpc: '2.0', id, method, params }
    const response = await new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Hermes gateway 调用超时：${method}`))
      }, timeoutMs)
      this.pending.set(id, { method, resolve, reject, timer })
      stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (!error) return
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      })
    })

    if (response.error) {
      throw new Error(response.error.message || `Hermes gateway 调用失败：${method}`)
    }
    return response.result as T
  }

  addSessionListener(sessionId: string, listener: (frame: GatewayEventFrame['params']) => void) {
    const listeners = this.listenersBySession.get(sessionId) ?? new Set()
    listeners.add(listener)
    this.listenersBySession.set(sessionId, listeners)
    return () => {
      const current = this.listenersBySession.get(sessionId)
      if (!current) return
      current.delete(listener)
      if (!current.size) this.listenersBySession.delete(sessionId)
    }
  }

  private handleStdout(chunk: string) {
    this.lineBuffer += chunk
    const lines = this.lineBuffer.split(/\n/)
    this.lineBuffer = lines.pop() ?? ''
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue
      let frame: JsonRpcResponse & GatewayEventFrame
      try {
        frame = JSON.parse(line)
      } catch {
        continue
      }

      if (frame.method === 'event') {
        this.handleEvent(frame.params)
        continue
      }

      if (frame.id !== undefined && frame.id !== null) {
        const id = Number(frame.id)
        const pending = this.pending.get(id)
        if (!pending) continue
        clearTimeout(pending.timer)
        this.pending.delete(id)
        pending.resolve(frame)
      }
    }
  }

  private handleEvent(params: GatewayEventFrame['params']) {
    if (params?.type === 'gateway.ready') {
      this.readyResolve?.()
    }

    const sessionId = params?.session_id
    if (!sessionId) return
    const listeners = this.listenersBySession.get(sessionId)
    if (!listeners) return
    for (const listener of listeners) listener(params)
  }

  private failAll(error: Error) {
    this.readyReject?.(error)
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer)
      this.pending.delete(id)
      pending.reject(error)
    }
  }

  lastStderr() {
    return this.stderr
  }

  shutdown() {
    const child = this.child
    if (!child) return Promise.resolve()

    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (this.child === child && !child.killed) child.kill('SIGKILL')
        resolve()
      }, 3000)
      child.stdin?.destroy()
      child.stdout?.destroy()
      child.stderr?.destroy()
      child.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
      child.kill('SIGTERM')
    })
  }
}

const gateways = new Map<string, HermesGatewayClient>()

export function getHermesGateway(workspacePath: string) {
  const key = workspacePath
  let gateway = gateways.get(key)
  if (!gateway) {
    gateway = new HermesGatewayClient(workspacePath)
    gateway.on('closed', () => {
      if (gateways.get(key) === gateway) gateways.delete(key)
    })
    gateways.set(key, gateway)
  }
  return gateway
}

export async function shutdownHermesGateways() {
  const activeGateways = [...gateways.values()]
  gateways.clear()
  await Promise.all(activeGateways.map((gateway) => gateway.shutdown()))
}

export async function readHermesGatewayStatus(workspacePath: string) {
  const gateway = getHermesGateway(workspacePath)
  const startedAt = Date.now()
  try {
    await gateway.start()
    return {
      available: true,
      mode: 'tui-gateway',
      cwd: workspacePath,
      latencyMs: Date.now() - startedAt
    }
  } catch (error) {
    return {
      available: false,
      mode: 'tui-gateway',
      cwd: workspacePath,
      error: error instanceof Error ? error.message : String(error),
      stderr: gateway.lastStderr()
    }
  }
}

export async function runHermesGatewayTask(params: HermesGatewayTaskParams): Promise<HermesBridgeResult> {
  const gateway = getHermesGateway(params.cwd)
  await gateway.start()

  let gatewaySessionId = ''
  let hermesSessionId = params.resumeSessionId
  let stdout = ''
  let stderr = ''
  let finalResponse = ''
  let bridgeError = ''
  let settled = false
  let lastEventAt = Date.now()
  let reasoningNoticeIndex = 0
  let lastReasoningNoticeAt = 0
  let approvalPending = false
  const events: HermesBridgeEvent[] = []
  let removeListener: (() => void) | undefined

  const emit = (event: HermesBridgeEvent, options: { countsAsProgress?: boolean } = {}) => {
    if (options.countsAsProgress !== false) {
      lastEventAt = Date.now()
    }
    events.push(event)
    params.onEvent?.(event)
  }

  try {
    const session: { session_id: string; resumed?: string } = params.resumeSessionId
      ? await gateway.call<{ session_id: string; resumed?: string }>('session.resume', {
        session_id: params.resumeSessionId,
        cols: 100
      }, 45000)
      : await gateway.call<{ session_id: string }>('session.create', { cols: 100 }, 45000)

    gatewaySessionId = session.session_id
    hermesSessionId = session.resumed || hermesSessionId

    if (!hermesSessionId) {
      const title = await gateway.call<{ session_key?: string }>('session.title', {
        session_id: gatewaySessionId
      })
      hermesSessionId = title.session_key
    }

    params.onHandle?.({
      kind: 'tui-gateway',
      stop: () => {
        void gateway.call('session.interrupt', { session_id: gatewaySessionId }, 5000).catch(() => undefined)
      },
      approve: async (choice) => {
        await gateway.call('approval.respond', { session_id: gatewaySessionId, choice }, 15000)
        approvalPending = false
        lastEventAt = Date.now()
        emit({
          type: 'approval.resolved',
          choice,
          summary: approvalChoiceSummary(choice),
          sessionId: hermesSessionId,
          gatewaySessionId
        })
      }
    })
    emit({
      type: 'bridge.started',
      cwd: params.cwd,
      runtime: 'tui-gateway',
      sessionId: hermesSessionId,
      gatewaySessionId,
      summary: params.resumeSessionId ? '已恢复 Hermes 会话，准备继续任务。' : '已连接 Hermes gateway，准备执行任务。'
    })
    emit({
      type: 'thinking',
      message: '正在理解任务目标并形成执行计划。',
      summary: '正在理解任务目标并形成执行计划。',
      category: 'thinking',
      synthetic: true,
      sessionId: hermesSessionId,
      gatewaySessionId
    })

    removeListener = gateway.addSessionListener(gatewaySessionId, (frame) => {
      if (!frame?.type) return
      const event = convertGatewayEvent(frame.type, frame.payload ?? {}, hermesSessionId, gatewaySessionId)

      if (event.type === 'reasoning.delta' || event.type === 'thinking.delta') {
        lastEventAt = Date.now()
        const now = Date.now()
        if (reasoningNoticeIndex === 0 || now - lastReasoningNoticeAt > 2200) {
          reasoningNoticeIndex += 1
          lastReasoningNoticeAt = now
          emit({
            type: 'thinking',
            message: reasoningNoticeText(reasoningNoticeIndex),
            summary: reasoningNoticeText(reasoningNoticeIndex),
            category: 'thinking',
            synthetic: true,
            sessionId: hermesSessionId,
            gatewaySessionId
          })
        }
        return
      }

      if (event.type === 'message.delta' && typeof event.text === 'string') {
        stdout += event.text
        emit(event)
        return
      }

      if (event.type === 'message.complete') {
        approvalPending = false
        finalResponse = typeof event.text === 'string' ? event.text : stdout.trim()
        stdout = finalResponse || stdout
        const usageEvent = contextEventFromUsage(event.usage, hermesSessionId)
        if (usageEvent) emit(usageEvent)
        const status = typeof event.status === 'string' ? event.status : 'complete'
        if (status === 'error') {
          bridgeError = finalResponse || 'Hermes gateway 返回错误'
          emit({ type: 'task.failed', error: bridgeError, finalResponse, sessionId: hermesSessionId })
        } else {
          emit({ type: 'task.completed', finalResponse, sessionId: hermesSessionId, status })
        }
        settled = true
        return
      }

      if (event.type === 'error') {
        approvalPending = false
        bridgeError = String(event.message ?? event.summary ?? 'Hermes gateway 执行失败')
        emit({ type: 'task.failed', error: bridgeError, sessionId: hermesSessionId })
        settled = true
        return
      }

      if (event.type === 'approval.request') {
        approvalPending = true
      }

      emit(event)
    })

    if (params.model) {
      const value = params.provider ? `${params.model} --provider ${params.provider}` : params.model
      await gateway.call('config.set', { session_id: gatewaySessionId, key: 'model', value }, 45000)
    }

    const prompt = promptWithCoworkSkillContext(params.prompt, params.enabledSkills)
    await gateway.call('prompt.submit', { session_id: gatewaySessionId, text: prompt }, 45000)
    emit({
      type: 'status',
      kind: 'submitted',
      summary: '任务已提交给 Hermes，等待模型规划和工具行动。',
      message: '任务已提交给 Hermes，等待模型规划和工具行动。',
      sessionId: hermesSessionId,
      gatewaySessionId
    })

    const result = await waitForGatewayTurn({
      isSettled: () => settled,
      getError: () => bridgeError,
      getStderr: gateway.lastStderr.bind(gateway),
      getLastEventAt: () => lastEventAt,
      isWaitingForApproval: () => approvalPending,
      onIdleNotice: (idleMs) => {
        emit({
          type: 'status',
          kind: 'idle-wait',
          summary: `Hermes 后端暂未返回新进展，已等待 ${formatDuration(idleMs)}。`,
          message: `Hermes 后端暂未返回新进展，已等待 ${formatDuration(idleMs)}。`,
          sessionId: hermesSessionId,
          gatewaySessionId
        }, { countsAsProgress: false })
      }
    })
    stderr = result.stderr
    if (result.timedOut) {
      bridgeError = result.timeoutMessage
        || `Hermes 后端超过 ${formatDuration(gatewayIdleTimeoutMs)} 没有返回新进展，本轮已停止。`
      if (gatewaySessionId) {
        void gateway.call('session.interrupt', { session_id: gatewaySessionId }, 5000).catch(() => undefined)
      }
      emit({
        type: 'task.failed',
        error: bridgeError,
        sessionId: hermesSessionId,
        gatewaySessionId
      }, { countsAsProgress: false })
    }
  } catch (error) {
    bridgeError = error instanceof Error ? error.message : String(error)
    stderr = gateway.lastStderr()
    emit({ type: 'task.failed', error: bridgeError, sessionId: hermesSessionId })
  } finally {
    removeListener?.()
    if (gatewaySessionId) {
      void gateway.call('session.close', { session_id: gatewaySessionId }, 5000).catch(() => undefined)
    }
  }

  return {
    exitCode: bridgeError ? 1 : 0,
    finalResponse,
    error: bridgeError,
    sessionId: hermesSessionId,
    stdout,
    stderr,
    events
  }
}

function waitForGatewayTurn(options: {
  isSettled: () => boolean
  getError: () => string
  getStderr: () => string
  getLastEventAt: () => number
  isWaitingForApproval?: () => boolean
  onIdleNotice?: (idleMs: number) => void
}): Promise<{ stderr: string; timedOut: boolean; timeoutMessage?: string }> {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    let lastIdleNoticeAt = 0
    const timer = setInterval(() => {
      if (options.isSettled()) {
        clearInterval(timer)
        resolve({ stderr: options.getStderr(), timedOut: false })
        return
      }
      const error = options.getError()
      if (error) {
        clearInterval(timer)
        resolve({ stderr: options.getStderr(), timedOut: false })
        return
      }
      if (Date.now() - startedAt > 1000 * 60 * 60) {
        clearInterval(timer)
        resolve({
          stderr: `${options.getStderr()}\nHermes gateway turn timed out`.trim(),
          timedOut: true,
          timeoutMessage: 'Hermes gateway turn timed out'
        })
        return
      }
      if (options.isWaitingForApproval?.()) {
        return
      }
      const now = Date.now()
      const idleMs = now - Math.max(options.getLastEventAt(), startedAt)
      if (idleMs >= gatewayIdleNoticeMs && now - lastIdleNoticeAt >= gatewayIdleHeartbeatMs) {
        lastIdleNoticeAt = now
        options.onIdleNotice?.(idleMs)
      }
      if (idleMs >= gatewayIdleTimeoutMs) {
        const timeoutMessage = `Hermes 后端超过 ${formatDuration(gatewayIdleTimeoutMs)} 没有返回新进展，本轮已停止。`
        clearInterval(timer)
        resolve({
          stderr: `${options.getStderr()}\n${timeoutMessage}`.trim(),
          timedOut: true,
          timeoutMessage
        })
        return
      }
    }, 100)
  })
}

function approvalChoiceSummary(choice: 'once' | 'session' | 'always' | 'deny') {
  return {
    once: '已允许本次命令，Hermes 将继续执行。',
    session: '已允许本会话同类命令，Hermes 将继续执行。',
    always: '已长期允许同类命令，Hermes 将继续执行。',
    deny: '已拒绝执行该命令，Hermes 将停止或改走其他方案。'
  }[choice]
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(1, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (!minutes) return `${seconds} 秒`
  if (!seconds) return `${minutes} 分钟`
  return `${minutes} 分 ${seconds} 秒`
}

function convertGatewayEvent(
  type: string,
  payload: Record<string, unknown>,
  sessionId?: string,
  gatewaySessionId?: string
): HermesBridgeEvent {
  if (type === 'tool.start') {
    return {
      type: 'tool.started',
      toolCallId: payload.tool_id,
      name: payload.name,
      args: payload.context,
      sessionId,
      gatewaySessionId
    }
  }
  if (type === 'tool.complete') {
    return {
      type: 'tool.completed',
      toolCallId: payload.tool_id,
      name: payload.name,
      result: payload.summary ?? payload.inline_diff ?? '',
      summary: payload.summary,
      inlineDiff: payload.inline_diff,
      sessionId,
      gatewaySessionId
    }
  }
  if (type === 'tool.progress') {
    return {
      type: 'tool.progress',
      name: payload.name,
      message: payload.preview,
      summary: payload.preview,
      sessionId,
      gatewaySessionId
    }
  }
  if (type === 'thinking.delta' || type === 'reasoning.delta') {
    return {
      type: 'reasoning.delta',
      delta: payload.text,
      ephemeral: true,
      sourceType: type,
      sessionId,
      gatewaySessionId
    }
  }
  if (type === 'reasoning.available') {
    return {
      type: 'status',
      kind: 'reasoning',
      message: 'Hermes 正在思考',
      summary: 'Hermes 正在思考',
      ephemeral: true,
      sessionId,
      gatewaySessionId
    }
  }
  if (type === 'status.update') {
    return {
      type: 'status',
      kind: payload.kind,
      message: payload.text,
      summary: payload.text,
      sessionId,
      gatewaySessionId
    }
  }
  if (type === 'browser.progress') {
    return {
      type: 'tool.progress',
      name: '浏览器',
      message: payload.message,
      summary: payload.message,
      sessionId,
      gatewaySessionId
    }
  }
  return {
    type,
    ...payload,
    sessionId,
    gatewaySessionId
  }
}

function reasoningNoticeText(index: number) {
  const sequence = [
    '正在分析问题边界，确认需要哪些步骤。',
    '正在根据上下文规划下一步行动。',
    '正在评估工具结果并调整执行路径。',
    '正在整理中间结论，准备继续推进。'
  ]
  return sequence[Math.min(index - 1, sequence.length - 1)]
}

function contextEventFromUsage(value: unknown, sessionId?: string): HermesBridgeEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const usage = value as Record<string, unknown>
  const contextUsed = numberValue(usage.context_used)
  const contextMax = numberValue(usage.context_max)
  const contextPercent = numberValue(usage.context_percent)
  return {
    type: 'context.updated',
    sessionId,
    model: stringValue(usage.model),
    contextUsed,
    contextMax,
    contextPercent,
    contextSource: contextUsed > 0 ? 'api' : 'unknown',
    thresholdPercent: 0,
    targetRatio: 0,
    protectLast: 0,
    compressionCount: numberValue(usage.compressions),
    compressionEnabled: true,
    canCompress: contextUsed > 0,
    messageCount: 0,
    status: contextPercent >= 90 ? 'danger' : contextPercent >= 60 ? 'warn' : contextPercent > 0 ? 'ok' : 'unknown',
    statusLabel: contextPercent >= 90 ? '接近上限' : contextPercent >= 60 ? '建议压缩' : contextPercent > 0 ? '上下文正常' : '等待 Hermes 回传',
    usage: {
      inputTokens: numberValue(usage.input),
      outputTokens: numberValue(usage.output),
      cacheReadTokens: numberValue(usage.cache_read),
      cacheWriteTokens: numberValue(usage.cache_write),
      reasoningTokens: numberValue(usage.reasoning),
      apiCalls: numberValue(usage.calls)
    },
    updatedAt: new Date().toISOString()
  }
}

function promptWithCoworkSkillContext(prompt: string, enabledSkills?: string[]) {
  const skills = [...new Set((enabledSkills ?? []).map((item) => item.trim()).filter(Boolean))].slice(0, 80)
  if (!skills.length) return prompt
  return [
    `[Hermes Cowork 工作区提示：当前前端启用的技能范围为 ${skills.join(', ')}。如果任务相关，优先使用这些技能；除非用户明确要求，避免使用未启用的技能。]`,
    '',
    prompt
  ].join('\n')
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function keepTail(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(value.length - maxLength) : value
}
