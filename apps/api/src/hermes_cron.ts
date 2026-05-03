import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { requestHermesDashboardJson } from './hermes_dashboard.js'
import { hermesAgentDir, hermesBin, hermesPythonBin } from './paths.js'

const execFileAsync = promisify(execFile)
const cronToolCode = `
import json
import sys

agent_dir = sys.argv[1]
payload = json.loads(sys.argv[2])
sys.path.insert(0, agent_dir)

from tools.cronjob_tools import cronjob

print(cronjob(**payload))
`

export type HermesCronSchedule =
  | { kind: 'once'; run_at?: string; display?: string }
  | { kind: 'interval'; minutes?: number; display?: string }
  | { kind: 'cron'; expr?: string; display?: string }

export type HermesCronRepeat = {
  times: number | null
  completed: number
}

export type HermesCronJob = {
  id: string
  name: string
  prompt: string
  promptPreview: string
  schedule: HermesCronSchedule
  scheduleDisplay: string
  repeat: HermesCronRepeat
  deliver: string
  enabled: boolean
  state: 'scheduled' | 'paused' | 'completed' | 'error' | string
  skills: string[]
  skill?: string | null
  model?: string | null
  provider?: string | null
  baseUrl?: string | null
  script?: string | null
  contextFrom?: string[] | null
  enabledToolsets?: string[] | null
  workdir?: string | null
  nextRunAt?: string | null
  lastRunAt?: string | null
  lastStatus?: string | null
  lastError?: string | null
  lastDeliveryError?: string | null
  pausedAt?: string | null
  pausedReason?: string | null
  createdAt?: string | null
  outputs: HermesCronOutput[]
  latestOutput?: HermesCronOutput
}

export type HermesCronOutput = {
  name: string
  path: string
  size: number
  createdAt: string
  preview: string
}

export type HermesCronSchedulerStatus = {
  running: boolean
  statusText: string
  command: string
  checkedAt: string
}

export type HermesCronState = {
  jobs: HermesCronJob[]
  source: 'official-dashboard' | 'local-config'
  sourceError?: string
  scheduler: HermesCronSchedulerStatus
  paths: {
    hermesHome: string
    jobsFile: string
    outputDir: string
  }
  updatedAt: string
}

export type HermesCronJobInput = {
  name?: string
  prompt?: string
  schedule?: string
  deliver?: string
  repeat?: number | null
  skills?: string[]
  model?: string
  provider?: string
  baseUrl?: string
  script?: string
  contextFrom?: string[]
  enabledToolsets?: string[]
  workdir?: string
}

type RawCronJob = Record<string, unknown>

export async function readHermesCronState(): Promise<HermesCronState> {
  const paths = cronPaths()
  const [officialJobs, localJobs, scheduler] = await Promise.all([
    readOfficialDashboardCronJobs(paths.outputDir),
    readCronJobs(paths.outputDir),
    readCronSchedulerStatus()
  ])
  const usingOfficialJobs = officialJobs.ok
  return {
    jobs: usingOfficialJobs ? officialJobs.jobs : localJobs,
    source: usingOfficialJobs ? 'official-dashboard' : 'local-config',
    sourceError: usingOfficialJobs ? undefined : officialJobs.error,
    scheduler,
    paths: {
      hermesHome: paths.hermesHome,
      jobsFile: paths.jobsFile,
      outputDir: paths.outputDir
    },
    updatedAt: new Date().toISOString()
  }
}

export async function createHermesCronJob(input: HermesCronJobInput): Promise<HermesCronState> {
  const payload = buildCronToolPayload('create', input)
  const skills = Array.isArray(payload.skills) ? payload.skills : []
  if (!payload.schedule) throw new Error('请填写执行时间。')
  if (!payload.prompt && !skills.length) throw new Error('请填写任务说明，或至少绑定一个 Skill。')
  await runCronTool(payload)
  return readHermesCronState()
}

export async function updateHermesCronJob(jobId: string, input: HermesCronJobInput): Promise<HermesCronState> {
  assertJobId(jobId)
  await runCronTool({ ...buildCronToolPayload('update', input), job_id: jobId })
  return readHermesCronState()
}

export async function pauseHermesCronJob(jobId: string, reason?: string): Promise<HermesCronState> {
  assertJobId(jobId)
  await runCronTool({ action: 'pause', job_id: jobId, reason: reason || 'Paused from Hermes Cowork' })
  return readHermesCronState()
}

export async function resumeHermesCronJob(jobId: string): Promise<HermesCronState> {
  assertJobId(jobId)
  await runCronTool({ action: 'resume', job_id: jobId })
  return readHermesCronState()
}

export async function triggerHermesCronJob(jobId: string): Promise<HermesCronState> {
  assertJobId(jobId)
  await runCronTool({ action: 'run', job_id: jobId })
  return readHermesCronState()
}

export async function removeHermesCronJob(jobId: string): Promise<HermesCronState> {
  assertJobId(jobId)
  await runCronTool({ action: 'remove', job_id: jobId })
  return readHermesCronState()
}

function cronPaths() {
  const hermesHome = path.resolve(process.env.HERMES_HOME || path.join(os.homedir(), '.hermes'))
  const cronDir = path.join(hermesHome, 'cron')
  return {
    hermesHome,
    cronDir,
    jobsFile: path.join(cronDir, 'jobs.json'),
    outputDir: path.join(cronDir, 'output')
  }
}

async function readCronJobs(outputDir: string): Promise<HermesCronJob[]> {
  const paths = cronPaths()
  if (!fs.existsSync(paths.jobsFile)) return []
  const raw = JSON.parse(fs.readFileSync(paths.jobsFile, 'utf8')) as { jobs?: RawCronJob[] }
  return (raw.jobs ?? []).map((job) => normalizeCronJob(job, outputDir))
}

type OfficialCronJobsResult =
  | { ok: true; jobs: HermesCronJob[] }
  | { ok: false; error: string }

async function readOfficialDashboardCronJobs(outputDir: string): Promise<OfficialCronJobsResult> {
  if (cronSourceMode() === 'local') {
    return { ok: false, error: '已配置为只读取本机 Cron 配置。' }
  }
  try {
    const result = await requestHermesDashboardJson('/api/cron/jobs', {}, { start: false })
    if (!result.ok) {
      return { ok: false, error: dashboardProxyError(result.body) || `Hermes 官方定时任务接口返回 ${result.status}` }
    }
    const rawJobs = rawCronJobsFromPayload(result.body)
    if (!rawJobs) return { ok: false, error: 'Hermes 官方定时任务接口返回了无法识别的数据。' }
    return {
      ok: true,
      jobs: rawJobs.map((job) => normalizeCronJob(job, outputDir))
    }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

function normalizeCronJob(job: RawCronJob, outputDir: string): HermesCronJob {
  const id = stringValue(job.id) || ''
  const prompt = stringValue(job.prompt)
  const skills = normalizeStringList(job.skills ?? job.skill)
  const outputs = readCronOutputs(id, outputDir)
  const schedule = normalizeSchedule(job.schedule)
  return {
    id,
    name: stringValue(job.name) || prompt.slice(0, 50) || id,
    prompt,
    promptPreview: prompt.length > 100 ? `${prompt.slice(0, 100)}...` : prompt,
    schedule,
    scheduleDisplay: stringValue(job.schedule_display) || schedule.display || schedule.kind,
    repeat: normalizeRepeat(job.repeat),
    deliver: stringValue(job.deliver) || 'local',
    enabled: booleanValue(job.enabled, true),
    state: stringValue(job.state) || (booleanValue(job.enabled, true) ? 'scheduled' : 'paused'),
    skills,
    skill: skills[0] ?? null,
    model: nullableString(job.model),
    provider: nullableString(job.provider),
    baseUrl: nullableString(job.base_url),
    script: nullableString(job.script),
    contextFrom: normalizeOptionalStringList(job.context_from),
    enabledToolsets: normalizeOptionalStringList(job.enabled_toolsets),
    workdir: nullableString(job.workdir),
    nextRunAt: nullableString(job.next_run_at),
    lastRunAt: nullableString(job.last_run_at),
    lastStatus: nullableString(job.last_status),
    lastError: nullableString(job.last_error),
    lastDeliveryError: nullableString(job.last_delivery_error),
    pausedAt: nullableString(job.paused_at),
    pausedReason: nullableString(job.paused_reason),
    createdAt: nullableString(job.created_at),
    outputs,
    latestOutput: outputs[0]
  }
}

function readCronOutputs(jobId: string, outputDir: string): HermesCronOutput[] {
  if (!jobId || !/^[a-f0-9]{12}$/i.test(jobId)) return []
  const jobOutputDir = path.join(outputDir, jobId)
  if (!fs.existsSync(jobOutputDir)) return []
  return fs.readdirSync(jobOutputDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const outputPath = path.join(jobOutputDir, name)
      const stat = fs.statSync(outputPath)
      return {
        name,
        path: outputPath,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
        preview: readOutputPreview(outputPath)
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function readOutputPreview(outputPath: string) {
  try {
    const raw = fs.readFileSync(outputPath, 'utf8').trim()
    return raw.length > 360 ? `${raw.slice(0, 360)}...` : raw
  } catch {
    return ''
  }
}

async function readCronSchedulerStatus(): Promise<HermesCronSchedulerStatus> {
  const command = `${hermesBin} cron status`
  try {
    const { stdout, stderr } = await execFileAsync(hermesBin, ['cron', 'status'], {
      timeout: 5000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, HERMES_ACCEPT_HOOKS: '1' }
    })
    const statusText = [stdout, stderr].filter(Boolean).join('\n').trim()
    return {
      running: /Gateway is running|scheduler is running|cron scheduler is running/i.test(statusText) && !/not running/i.test(statusText),
      statusText,
      command,
      checkedAt: new Date().toISOString()
    }
  } catch (error) {
    const statusText = error instanceof Error ? error.message : String(error)
    return {
      running: false,
      statusText,
      command,
      checkedAt: new Date().toISOString()
    }
  }
}

function buildCronToolPayload(action: string, input: HermesCronJobInput) {
  const payload: Record<string, unknown> = { action }
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.prompt !== undefined) payload.prompt = input.prompt.trim()
  if (input.schedule !== undefined) payload.schedule = input.schedule.trim()
  if (input.deliver !== undefined) payload.deliver = input.deliver.trim() || 'local'
  if (input.repeat !== undefined) payload.repeat = input.repeat
  if (input.skills !== undefined) payload.skills = input.skills.map((skill) => skill.trim()).filter(Boolean)
  if (input.model !== undefined) payload.model = input.model.trim()
  if (input.provider !== undefined) payload.provider = input.provider.trim()
  if (input.baseUrl !== undefined) payload.base_url = input.baseUrl.trim()
  if (input.script !== undefined) payload.script = input.script.trim()
  if (input.contextFrom !== undefined) payload.context_from = input.contextFrom.map((id) => id.trim()).filter(Boolean)
  if (input.enabledToolsets !== undefined) payload.enabled_toolsets = input.enabledToolsets.map((item) => item.trim()).filter(Boolean)
  if (input.workdir !== undefined) payload.workdir = input.workdir.trim()
  return payload
}

async function runCronTool(payload: Record<string, unknown>) {
  const { stdout } = await execFileAsync(hermesPythonBin, ['-c', cronToolCode, hermesAgentDir, JSON.stringify(payload)], {
    cwd: hermesAgentDir,
    timeout: 12000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      HERMES_ACCEPT_HOOKS: '1',
      PYTHONPATH: [hermesAgentDir, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)
    }
  })
  const parsed = parseCronToolJson(stdout)
  if (parsed && typeof parsed === 'object' && 'success' in parsed && parsed.success === false) {
    throw new Error(stringValue(parsed.error) || stringValue(parsed.message) || 'Hermes cron 操作失败')
  }
  return parsed
}

function parseCronToolJson(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim()
  if (!trimmed) return {}
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    }
    throw new Error(trimmed)
  }
}

function assertJobId(jobId: string) {
  if (!/^[a-f0-9]{12}$/i.test(jobId)) {
    throw new Error('无效的 Hermes cron job_id。')
  }
}

function normalizeSchedule(value: unknown): HermesCronSchedule {
  if (!value || typeof value !== 'object') return { kind: 'once' }
  const raw = value as Record<string, unknown>
  const kind = stringValue(raw.kind)
  if (kind === 'interval') {
    return { kind, minutes: numberValue(raw.minutes), display: stringValue(raw.display) }
  }
  if (kind === 'cron') {
    return { kind, expr: stringValue(raw.expr), display: stringValue(raw.display) }
  }
  return { kind: 'once', run_at: stringValue(raw.run_at), display: stringValue(raw.display) }
}

function normalizeRepeat(value: unknown): HermesCronRepeat {
  if (!value || typeof value !== 'object') return { times: null, completed: 0 }
  const raw = value as Record<string, unknown>
  const times = raw.times === null || raw.times === undefined ? null : numberValue(raw.times) ?? null
  return {
    times,
    completed: numberValue(raw.completed) ?? 0
  }
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean)
  const text = stringValue(value).trim()
  return text ? [text] : []
}

function normalizeOptionalStringList(value: unknown): string[] | null {
  const values = normalizeStringList(value)
  return values.length ? values : null
}

function nullableString(value: unknown) {
  const text = stringValue(value).trim()
  return text || null
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)
}

function numberValue(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function rawCronJobsFromPayload(payload: unknown): RawCronJob[] | null {
  if (Array.isArray(payload)) return payload.filter(isRecord)
  if (isRecord(payload) && Array.isArray(payload.jobs)) return payload.jobs.filter(isRecord)
  return null
}

function dashboardProxyError(payload: unknown) {
  if (!isRecord(payload)) return ''
  return stringValue(payload.detail) || stringValue(payload.error) || stringValue(payload.message)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is RawCronJob {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cronSourceMode() {
  return (process.env.HERMES_COWORK_CRON_SOURCE || 'auto').trim().toLowerCase()
}
