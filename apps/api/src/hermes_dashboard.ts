import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { hermesBin } from './paths.js'

const sessionHeaderName = 'X-Hermes-Session-Token'
const defaultHost = '127.0.0.1'
const defaultPort = 9120
const tokenTtlMs = 10 * 60 * 1000

type DashboardToken = {
  baseUrl: string
  token: string
  expiresAt: number
}

export type HermesDashboardAdapterStatus = {
  available: boolean
  running: boolean
  baseUrl: string
  protectedApiReady: boolean
  startedByCowork: boolean
  pid?: number
  version?: string
  releaseDate?: string
  configVersion?: number
  latestConfigVersion?: number
  gatewayRunning?: boolean
  gatewayState?: string
  activeSessions?: number
  error?: string
  updatedAt: string
}

export type HermesDashboardProxyResult = {
  status: number
  ok: boolean
  body: unknown
  contentType?: string
}

let dashboardProcess: ChildProcess | null = null
let cachedToken: DashboardToken | null = null
let startPromise: Promise<void> | null = null

export function hermesDashboardBaseUrl() {
  const explicitUrl = process.env.HERMES_COWORK_DASHBOARD_URL?.trim()
  if (explicitUrl) return trimTrailingSlash(explicitUrl)
  const host = process.env.HERMES_COWORK_DASHBOARD_HOST?.trim() || defaultHost
  const port = numberEnv('HERMES_COWORK_DASHBOARD_PORT', defaultPort)
  return `http://${host}:${port}`
}

export async function readHermesDashboardAdapterStatus(options: { start?: boolean } = {}): Promise<HermesDashboardAdapterStatus> {
  const baseUrl = hermesDashboardBaseUrl()
  try {
    const ready: { status?: Record<string, unknown>; token?: string; error?: string } = options.start
      ? await ensureHermesDashboard()
      : await probeHermesDashboard(baseUrl)
    if (!ready.status) {
      return {
        available: false,
        running: false,
        baseUrl,
        protectedApiReady: false,
        startedByCowork: Boolean(dashboardProcess?.pid),
        pid: dashboardProcess?.pid,
        error: ready.error || 'Hermes Dashboard 未启动。',
        updatedAt: new Date().toISOString()
      }
    }

    return {
      available: true,
      running: true,
      baseUrl,
      protectedApiReady: Boolean(ready.token),
      startedByCowork: Boolean(dashboardProcess?.pid),
      pid: dashboardProcess?.pid,
      ...normalizeStatusPayload(ready.status),
      updatedAt: new Date().toISOString()
    }
  } catch (error) {
    return {
      available: false,
      running: false,
      baseUrl,
      protectedApiReady: false,
      startedByCowork: Boolean(dashboardProcess?.pid),
      pid: dashboardProcess?.pid,
      error: errorMessage(error),
      updatedAt: new Date().toISOString()
    }
  }
}

export async function requestHermesDashboardJson(
  apiPath: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  options: { start?: boolean } = {}
): Promise<HermesDashboardProxyResult> {
  const ready: { status?: Record<string, unknown>; token?: string; error?: string } = options.start === false
    ? await probeHermesDashboard(hermesDashboardBaseUrl())
    : await ensureHermesDashboard()
  if (!ready.status) {
    throw new Error(ready.error || 'Hermes Dashboard 未启动。')
  }
  return requestWithToken(apiPath, init, ready.token, true)
}

export function extractDashboardSessionToken(html: string) {
  const match = html.match(/window\.__HERMES_SESSION_TOKEN__\s*=\s*["']([^"']+)["']/)
  return match?.[1] ?? ''
}

export async function resetHermesDashboardAdapterForTest() {
  cachedToken = null
  startPromise = null
  const child = dashboardProcess
  dashboardProcess = null
  if (!child) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), 1500)
    child.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

async function ensureHermesDashboard() {
  const baseUrl = hermesDashboardBaseUrl()
  let ready = await probeHermesDashboard(baseUrl)
  if (ready.status) return ready as { status: Record<string, unknown>; token: string }
  if (!shouldAutoStartDashboard()) {
    throw new Error(ready.error || 'Hermes Dashboard 未启动，且当前配置禁止自动启动。')
  }

  await startHermesDashboard()
  ready = await waitForDashboard(baseUrl)
  if (!ready.status) {
    throw new Error(ready.error || 'Hermes Dashboard 启动后仍不可用。')
  }
  return ready as { status: Record<string, unknown>; token: string }
}

async function probeHermesDashboard(baseUrl: string): Promise<{ status?: Record<string, unknown>; token?: string; error?: string }> {
  const status = await readDashboardStatus(baseUrl)
  if (!status.ok) return { error: status.error }
  const token = await readDashboardToken(baseUrl).catch(() => '')
  return { status: status.body, token }
}

async function waitForDashboard(baseUrl: string) {
  const startedAt = Date.now()
  const timeoutMs = numberEnv('HERMES_COWORK_DASHBOARD_START_TIMEOUT_MS', 15000)
  let lastError = ''
  while (Date.now() - startedAt < timeoutMs) {
    const ready = await probeHermesDashboard(baseUrl)
    if (ready.status) return ready
    lastError = ready.error || lastError
    await delay(300)
  }
  return { error: lastError || `Hermes Dashboard 启动超时：${baseUrl}` }
}

async function startHermesDashboard() {
  if (dashboardProcess && !dashboardProcess.killed) return
  if (startPromise) return startPromise

  startPromise = new Promise<void>((resolve, reject) => {
    const baseUrl = new URL(hermesDashboardBaseUrl())
    const host = baseUrl.hostname || defaultHost
    const port = baseUrl.port || String(defaultPort)
    const child = spawn(hermesBin, ['dashboard', '--host', host, '--port', port, '--no-open'], {
      env: { ...process.env },
      stdio: 'ignore'
    })
    dashboardProcess = child

    const timer = setTimeout(() => resolve(), 500)
    child.once('error', (error) => {
      clearTimeout(timer)
      dashboardProcess = null
      reject(error)
    })
    child.once('close', () => {
      if (dashboardProcess === child) dashboardProcess = null
    })
  }).finally(() => {
    startPromise = null
  })

  await startPromise
}

async function readDashboardStatus(baseUrl: string) {
  try {
    const response = await fetch(`${baseUrl}/api/status`, { signal: AbortSignal.timeout(2500) })
    if (!response.ok) return { ok: false as const, error: `Hermes Dashboard 状态接口返回 ${response.status}` }
    return { ok: true as const, body: await response.json() as Record<string, unknown> }
  } catch (error) {
    return { ok: false as const, error: errorMessage(error) }
  }
}

async function readDashboardToken(baseUrl: string) {
  const cached = cachedToken
  if (cached && cached.baseUrl === baseUrl && cached.expiresAt > Date.now()) return cached.token

  const response = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(2500) })
  if (!response.ok) throw new Error(`Hermes Dashboard 页面返回 ${response.status}`)
  const token = extractDashboardSessionToken(await response.text())
  if (!token) throw new Error('Hermes Dashboard 页面没有暴露本机会话 token。')
  cachedToken = { baseUrl, token, expiresAt: Date.now() + tokenTtlMs }
  return token
}

async function requestWithToken(
  apiPath: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> },
  token: string | undefined,
  canRefreshToken: boolean
): Promise<HermesDashboardProxyResult> {
  const baseUrl = hermesDashboardBaseUrl()
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const headers: Record<string, string> = {
    ...(init.headers ?? {})
  }
  if (token) headers[sessionHeaderName] = token
  const hasBody = init.body !== undefined
  if (hasBody && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: hasBody ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(numberEnv('HERMES_COWORK_DASHBOARD_REQUEST_TIMEOUT_MS', 10000))
  })

  if (response.status === 401 && canRefreshToken) {
    cachedToken = null
    const nextToken = await readDashboardToken(baseUrl)
    return requestWithToken(apiPath, init, nextToken, false)
  }

  const contentType = response.headers.get('content-type') ?? undefined
  const body = contentType?.includes('application/json') ? await response.json() : await response.text()
  return { status: response.status, ok: response.ok, body, contentType }
}

function normalizeStatusPayload(status: Record<string, unknown>) {
  return {
    version: stringValue(status.version),
    releaseDate: stringValue(status.release_date),
    configVersion: numberValue(status.config_version),
    latestConfigVersion: numberValue(status.latest_config_version),
    gatewayRunning: booleanValue(status.gateway_running),
    gatewayState: stringValue(status.gateway_state),
    activeSessions: numberValue(status.active_sessions)
  }
}

function shouldAutoStartDashboard() {
  const value = process.env.HERMES_COWORK_DASHBOARD_AUTOSTART
  return value === undefined || !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase())
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value ? value : undefined
}

function numberValue(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}
