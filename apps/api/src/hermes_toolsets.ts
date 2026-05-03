import fs from 'node:fs'
import path from 'node:path'
import { requestHermesDashboardJson } from './hermes_dashboard.js'
import { dataDir } from './paths.js'

export type HermesDashboardToolset = {
  name: string
  label: string
  description: string
  enabled: boolean
  available?: boolean
  configured: boolean
  tools: string[]
}

const platformDefaultToolsets = new Set([
  'hermes-cli',
  'hermes-telegram',
  'hermes-discord',
  'hermes-whatsapp',
  'hermes-slack',
  'hermes-signal',
  'hermes-homeassistant'
])

export async function readHermesDashboardToolsets(options: { start?: boolean } = {}) {
  const result = await requestHermesDashboardJson('/api/tools/toolsets', {}, options)
  if (!result.ok) throw dashboardError('读取 Hermes 工具集失败', result.status, result.body)
  const toolsets = rawToolsets(result.body)
  if (!toolsets) throw new Error('Hermes 工具集接口返回了无法识别的数据。')
  return toolsets
}

export async function toggleHermesDashboardToolset(toolsetName: string, enabled: boolean) {
  const normalizedName = toolsetName.trim()
  if (!normalizedName) throw new Error('工具集名称不能为空。')

  const toolsets = await readHermesDashboardToolsets()
  const target = toolsets.find((toolset) => toolset.name === normalizedName)
  if (!target) throw new Error(`Hermes 工具集不存在：${normalizedName}`)

  const configResult = await requestHermesDashboardJson('/api/config')
  if (!configResult.ok) throw dashboardError('读取 Hermes 配置失败', configResult.status, configResult.body)
  if (!isRecord(configResult.body)) throw new Error('Hermes 配置接口返回了无法识别的数据。')

  const config = { ...configResult.body }
  const platformToolsets = isRecord(config.platform_toolsets) ? { ...config.platform_toolsets } : {}
  const currentCliEntries = stringList(platformToolsets.cli)
  const officialNames = new Set(toolsets.map((toolset) => toolset.name))
  const nextEnabledNames = new Set(
    toolsets
      .filter((toolset) => toolset.enabled)
      .map((toolset) => toolset.name)
  )
  if (enabled) nextEnabledNames.add(target.name)
  else nextEnabledNames.delete(target.name)

  const preservedEntries = currentCliEntries.filter(
    (entry) => !officialNames.has(entry) && !platformDefaultToolsets.has(entry)
  )
  platformToolsets.cli = [...nextEnabledNames, ...preservedEntries].sort()
  config.platform_toolsets = platformToolsets

  const backupPath = backupDashboardConfig(configResult.body)
  const updateResult = await requestHermesDashboardJson('/api/config', {
    method: 'PUT',
    body: { config }
  })
  if (!updateResult.ok) throw dashboardError('写入 Hermes 工具集配置失败', updateResult.status, updateResult.body)

  const refreshed = await readHermesDashboardToolsets()
  return {
    toolset: refreshed.find((toolset) => toolset.name === target.name) ?? { ...target, enabled },
    backupPath
  }
}

function rawToolsets(payload: unknown): HermesDashboardToolset[] | null {
  const value = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.toolsets)
      ? payload.toolsets
      : null
  if (!value) return null
  return value
    .map((item) => normalizeToolset(item))
    .filter((item): item is HermesDashboardToolset => Boolean(item))
}

function normalizeToolset(value: unknown): HermesDashboardToolset | null {
  if (!isRecord(value)) return null
  const name = stringValue(value.name)
  if (!name) return null
  return {
    name,
    label: stringValue(value.label) || name,
    description: stringValue(value.description) || '',
    enabled: booleanValue(value.enabled),
    available: typeof value.available === 'boolean' ? value.available : undefined,
    configured: booleanValue(value.configured),
    tools: stringList(value.tools)
  }
}

function dashboardError(prefix: string, status: number, body: unknown) {
  if (isRecord(body)) {
    const detail = stringValue(body.error) || stringValue(body.detail)
    if (detail) return new Error(`${prefix}：${detail}`)
  }
  return new Error(`${prefix}：HTTP ${status}`)
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : false
}

function backupDashboardConfig(config: unknown) {
  const backupDir = path.join(dataDir, 'hermes-config-backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupDir, `dashboard-config-${stamp}.json`)
  fs.writeFileSync(backupPath, JSON.stringify(config, null, 2), 'utf8')
  return backupPath
}
