import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { hermesAgentDir, hermesBin } from './paths.js'
import { HermesModelConfigureRequest, HermesModelCredential, HermesModelOverview, HermesModelProvider, ModelOption, ModelSettings } from './types.js'

const hermesConfigPath = '/Users/lucas/.hermes/config.yaml'
const hermesEnvPath = '/Users/lucas/.hermes/.env'

const providerModels: Record<string, { label: string; models: string[] }> = {
  custom: { label: 'Custom endpoint', models: [] },
  xiaomi: { label: 'Xiaomi MiMo', models: ['mimo-v2-pro', 'mimo-v2.5-pro', 'mimo-v2-omni', 'mimo-v2-flash'] },
  minimax: { label: 'MiniMax', models: ['MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2.1', 'MiniMax-M2'] },
  anthropic: { label: 'Anthropic', models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'] },
  'openai-codex': { label: 'OpenAI Codex', models: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.3-codex-spark'] },
  openrouter: { label: 'OpenRouter', models: ['anthropic/claude-opus-4.6', 'anthropic/claude-sonnet-4.6', 'openai/gpt-5.4', 'xiaomi/mimo-v2-pro'] },
  kimi: { label: 'Kimi / Moonshot', models: ['kimi-k2.5', 'kimi-k2-thinking', 'kimi-k2-turbo-preview'] },
  'kimi-coding': { label: 'Kimi Coding', models: ['kimi-for-coding', 'kimi-k2.5', 'kimi-k2-thinking'] },
  zai: { label: 'Z.AI / GLM', models: ['glm-5.1', 'glm-5', 'glm-5-turbo', 'glm-4.7'] },
  gemini: { label: 'Google Gemini', models: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'] },
  xai: { label: 'xAI', models: ['grok-4.20-0309-reasoning', 'grok-4-fast-reasoning', 'grok-code-fast-1'] },
  deepseek: { label: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'] },
  qwen: { label: 'Qwen OAuth', models: ['qwen3-coder-plus', 'qwen3.5-plus', 'qwen3-coder-next'] },
  copilot: { label: 'GitHub Copilot', models: ['gpt-5.4', 'gpt-5.4-mini', 'claude-sonnet-4.6', 'gemini-2.5-pro'] }
}

export function listModelOptions(settings: ModelSettings) {
  const configModel = readHermesDefaultModel()
  const builtIns: ModelOption[] = [
    {
      id: 'auto',
      label: configModel.model ? `Hermes 默认模型 · ${configModel.model}` : 'Hermes 默认模型',
      builtIn: true,
      provider: configModel.provider || undefined,
      description: configModel.model
        ? `跟随 Hermes config.yaml 当前配置${configModel.provider ? ` · ${configModel.provider}` : ''}`
        : '跟随 Hermes config.yaml 当前配置'
    }
  ]

  if (configModel.model) {
    builtIns.push({
      id: configModel.model,
      label: configModel.model,
      provider: configModel.provider,
      builtIn: true,
      description: configModel.provider ? `Hermes 当前默认模型 · ${configModel.provider}` : 'Hermes 当前默认模型'
    })
  }

  const seen = new Set<string>()
  return [...builtIns, ...settings.customModels]
    .filter((model) => {
      if (seen.has(model.id)) return false
      seen.add(model.id)
      return true
    })
}

export function normalizeModelId(value: string) {
  return value.trim().replace(/\s+/g, '-').slice(0, 120)
}

export function selectedModelOption(settings: ModelSettings) {
  const options = listModelOptions(settings)
  return options.find((model) => model.id === settings.selectedModelId) ?? options[0]
}

export function readHermesModelOverview(settings: ModelSettings): HermesModelOverview {
  const config = readHermesModelConfig()
  const statusCredentials = parseHermesStatusCredentials(runHermesText(['status']))
  const poolCredentials = parseHermesAuthList(runHermesText(['auth', 'list']))
  const credentials = mergeCredentials(statusCredentials, poolCredentials)
  const providers = buildHermesProviders(config, credentials, settings)

  return {
    configPath: hermesConfigPath,
    envPath: hermesEnvPath,
    defaultModel: config.defaultModel,
    provider: config.provider,
    providerLabel: providerLabel(config.provider),
    baseUrl: config.baseUrl,
    apiMode: config.apiMode,
    fallbackProviders: config.fallbackProviders,
    credentials,
    providers,
    updatedAt: new Date().toISOString()
  }
}

export function setHermesDefaultModel(modelId: string, provider?: string) {
  const safeModel = normalizeModelValue(modelId)
  const safeProvider = normalizeProviderId(provider ?? '')
  if (!safeModel) {
    throw new Error('模型 ID 不合法')
  }

  const raw = fs.readFileSync(hermesConfigPath, 'utf8')
  const backupPath = backupHermesConfig(raw)
  const nextRaw = upsertModelConfig(raw, safeModel, safeProvider)
  fs.writeFileSync(hermesConfigPath, nextRaw, 'utf8')
  return { ok: true, backupPath }
}

export function setHermesFallbackProviders(providers: string[]) {
  const safeProviders = uniqueStrings(providers.map(normalizeProviderId)).slice(0, 8)
  const raw = fs.readFileSync(hermesConfigPath, 'utf8')
  const backupPath = backupHermesConfig(raw)
  const nextRaw = upsertRootYamlList(raw, 'fallback_providers', safeProviders)
  fs.writeFileSync(hermesConfigPath, nextRaw, 'utf8')
  return { ok: true, backupPath }
}

export function configureHermesModel(request: HermesModelConfigureRequest) {
  const provider = normalizeProviderId(request.provider)
  const modelId = normalizeModelValue(request.modelId)
  const baseUrl = normalizeModelValue(request.baseUrl ?? '')
  const apiKey = normalizeSecretValue(request.apiKey ?? '')
  const apiMode = normalizeModelValue(request.apiMode ?? '')
  if (!provider) throw new Error('请选择模型服务商')
  if (!modelId) throw new Error('请填写模型 ID')

  const raw = fs.readFileSync(hermesConfigPath, 'utf8')
  const backupPath = backupHermesConfig(raw)
  const fields: Record<string, string | undefined> = {
    default: modelId,
    provider
  }
  if (baseUrl) fields.base_url = baseUrl
  if (apiKey) fields.api_key = apiKey
  if (apiMode) fields.api_mode = apiMode
  const nextRaw = upsertModelConfigFields(raw, fields)
  fs.writeFileSync(hermesConfigPath, nextRaw, { encoding: 'utf8', mode: 0o600 })
  try {
    fs.chmodSync(hermesConfigPath, 0o600)
  } catch {
    // macOS may already enforce permissions; failing chmod should not block config.
  }
  return { ok: true, backupPath }
}

function readHermesDefaultModel() {
  try {
    const config = readHermesModelConfig()
    return { model: config.defaultModel, provider: config.provider }
  } catch {
    return { model: '', provider: '' }
  }
}

function readHermesModelConfig() {
  const raw = fs.readFileSync(hermesConfigPath, 'utf8')
  const modelBlock = rootBlock(raw, 'model')
  const fallbackBlock = rootBlock(raw, 'fallback_providers')
  return {
    defaultModel: readYamlScalar(modelBlock, 'default') || readYamlScalar(modelBlock, 'model'),
    provider: normalizeProviderId(readYamlScalar(modelBlock, 'provider') || 'auto'),
    baseUrl: readYamlScalar(modelBlock, 'base_url'),
    apiMode: readYamlScalar(modelBlock, 'api_mode'),
    fallbackProviders: readYamlList(fallbackBlock),
    customProviders: readCustomProviders(raw)
  }
}

function buildHermesProviders(
  config: ReturnType<typeof readHermesModelConfig>,
  credentials: HermesModelCredential[],
  settings: ModelSettings
): HermesModelProvider[] {
  const configuredIds = new Set(credentials.filter((credential) => credential.configured).map((credential) => credential.id))
  const providers = new Map<string, HermesModelProvider>()
  const currentProvider = config.provider || 'auto'
  const customModelOptions = settings.customModels.filter((model) => model.provider)

  const addProvider = (provider: HermesModelProvider) => {
    providers.set(provider.id, provider)
  }

  const currentPreset = providerModels[currentProvider] ?? providerModels.custom
  addProvider({
    id: currentProvider,
    label: providerLabel(currentProvider),
    source: currentProvider === 'custom' ? 'custom' : 'hermes',
    configured: true,
    isCurrent: true,
    baseUrl: config.baseUrl,
    apiMode: config.apiMode,
    models: uniqueStrings([config.defaultModel, ...currentPreset.models]),
    credentialSummary: credentialSummary(currentProvider, credentials) || '当前 Hermes model 配置'
  })

  for (const credential of credentials.filter((item) => item.configured)) {
    const preset = providerModels[credential.id]
    addProvider({
      id: credential.id,
      label: preset?.label ?? credential.label,
      source: credential.kind === 'pool' ? 'auth' : 'hermes',
      configured: true,
      isCurrent: credential.id === currentProvider,
      models: uniqueStrings([...(preset?.models ?? [])]),
      credentialSummary: credential.detail
    })
  }

  for (const provider of config.customProviders) {
    addProvider({
      id: provider.id,
      label: provider.name,
      source: 'config',
      configured: true,
      isCurrent: provider.id === currentProvider,
      baseUrl: provider.baseUrl,
      models: uniqueStrings(provider.models),
      credentialSummary: '来自 config.yaml custom_providers'
    })
  }

  for (const model of customModelOptions) {
    const providerId = normalizeProviderId(model.provider ?? 'custom')
    if (!providers.has(providerId)) {
      const preset = providerModels[providerId]
      addProvider({
        id: providerId,
        label: preset?.label ?? providerId,
        source: 'custom',
        configured: configuredIds.has(providerId),
        isCurrent: providerId === currentProvider,
        models: uniqueStrings([model.id, ...(preset?.models ?? [])]),
        credentialSummary: configuredIds.has(providerId) ? 'Hermes 已检测到凭据' : 'Cowork 本地模型选项'
      })
    }
  }

  return [...providers.values()].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
    if (a.configured !== b.configured) return a.configured ? -1 : 1
    return a.label.localeCompare(b.label)
  })
}

function parseHermesStatusCredentials(raw: string): HermesModelCredential[] {
  const credentials: HermesModelCredential[] = []
  let section = ''
  for (const line of raw.replace(/\r/g, '').split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '◆ API Keys') {
      section = 'api_key'
      continue
    }
    if (trimmed === '◆ Auth Providers') {
      section = 'oauth'
      continue
    }
    if (trimmed === '◆ API-Key Providers') {
      section = 'provider'
      continue
    }
    if (trimmed.startsWith('◆ ')) {
      section = ''
      continue
    }
    if (!section || !/^[A-Za-z0-9]/.test(trimmed)) continue
    const match = trimmed.match(/^(.+?)\s+([✓✗])\s+(.+)$/)
    if (!match) continue
    const label = match[1].trim()
    const configured = match[2] === '✓'
    const detail = configured ? '已配置' : sanitizeStatusDetail(match[3])
    credentials.push({
      id: normalizeCredentialLabel(label),
      label,
      kind: section === 'oauth' ? 'oauth' : 'api_key',
      configured,
      detail
    })
  }
  return credentials
}

function parseHermesAuthList(raw: string): HermesModelCredential[] {
  const credentials: HermesModelCredential[] = []
  for (const line of raw.replace(/\r/g, '').split('\n')) {
    const match = line.match(/^([A-Za-z0-9_:. -]+)\s+\((\d+)\s+credentials?\):/)
    if (!match) continue
    const id = normalizeProviderId(match[1])
    credentials.push({
      id,
      label: providerLabel(id),
      kind: 'pool',
      configured: Number(match[2]) > 0,
      detail: `${match[2]} 个 Hermes 凭据池条目`
    })
  }
  return credentials
}

function mergeCredentials(...groups: HermesModelCredential[][]) {
  const merged = new Map<string, HermesModelCredential>()
  for (const credential of groups.flat()) {
    const existing = merged.get(credential.id)
    if (!existing) {
      merged.set(credential.id, credential)
      continue
    }
    const mergedConfigured = existing.configured || credential.configured
    const detailParts = [existing.detail, credential.detail]
      .map((detail) => sanitizeStatusDetail(detail))
      .filter((detail) => detail && !(mergedConfigured && detail.includes('未配置')))
    merged.set(credential.id, {
      ...existing,
      configured: mergedConfigured,
      detail: [...new Set(detailParts)].join('；'),
      kind: existing.configured ? existing.kind : credential.kind
    })
  }
  return [...merged.values()].sort((a, b) => Number(b.configured) - Number(a.configured) || a.label.localeCompare(b.label))
}

function readCustomProviders(raw: string) {
  const block = rootBlock(raw, 'custom_providers')
  const providers: Array<{ id: string; name: string; baseUrl?: string; models: string[] }> = []
  let current: { name: string; baseUrl?: string; models: string[] } | null = null
  for (const line of block.split('\n')) {
    const itemMatch = line.match(/^ {2}-\s+name:\s*(.+)$/)
    if (itemMatch) {
      if (current) providers.push({ id: customProviderId(current.name), ...current })
      current = { name: unquoteYaml(itemMatch[1]), models: [] }
      continue
    }
    if (!current) continue
    const fieldMatch = line.match(/^ {4}([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!fieldMatch) continue
    const value = unquoteYaml(fieldMatch[2] ?? '')
    if (fieldMatch[1] === 'base_url' || fieldMatch[1] === 'url' || fieldMatch[1] === 'api') current.baseUrl = value
    if ((fieldMatch[1] === 'model' || fieldMatch[1] === 'default_model') && value) current.models.push(value)
  }
  if (current) providers.push({ id: customProviderId(current.name), ...current })
  return providers
}

function rootBlock(raw: string, key: string) {
  const lines = raw.replace(/\r/g, '').split('\n')
  const start = lines.findIndex((line) => line.trim() === `${key}:`)
  if (start === -1) return ''
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\S/.test(lines[index]) && lines[index].trim()) {
      end = index
      break
    }
  }
  return lines.slice(start + 1, end).join('\n')
}

function readYamlScalar(block: string, key: string) {
  const match = block.match(new RegExp(`^\\s+${key}:\\s*(.+)$`, 'm'))
  if (!match) return ''
  return unquoteYaml(match[1])
}

function readYamlList(block: string) {
  return block
    .split('\n')
    .map((line) => line.match(/^\s*-\s*(.+)$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(unquoteYaml)
}

function upsertModelConfig(raw: string, modelId: string, provider?: string) {
  return upsertModelConfigFields(raw, {
    default: modelId,
    provider: provider || undefined
  })
}

function upsertModelConfigFields(raw: string, fields: Record<string, string | undefined>) {
  const lines = raw.replace(/\r/g, '').split('\n')
  const start = lines.findIndex((line) => line.trim() === 'model:')
  const entries = Object.entries(fields).filter((entry): entry is [string, string] => Boolean(entry[1]))
  if (start === -1) {
    return [`model:`, ...entries.map(([key, value]) => `  ${key}: ${quoteYaml(value)}`), raw].join('\n')
  }

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\S/.test(lines[index]) && lines[index].trim()) {
      end = index
      break
    }
  }
  let block = lines.slice(start + 1, end)
  for (const [key, value] of entries) {
    block = upsertIndentedScalar(block, key, value)
  }
  return [...lines.slice(0, start + 1), ...block, ...lines.slice(end)].join('\n')
}

function upsertIndentedScalar(lines: string[], key: string, value: string) {
  const next = [...lines]
  const index = next.findIndex((line) => line.match(new RegExp(`^\\s+${key}:`)))
  const line = `  ${key}: ${quoteYaml(value)}`
  if (index >= 0) next[index] = line
  else next.unshift(line)
  return next
}

function upsertRootYamlList(raw: string, key: string, values: string[]) {
  const lines = raw.replace(/\r/g, '').split('\n')
  const start = lines.findIndex((line) => line.trim() === `${key}:`)
  const block = values.map((value) => `  - ${quoteYaml(value)}`)
  if (start === -1) {
    return [`${key}:`, ...block, ...lines].join('\n')
  }

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\S/.test(lines[index]) && lines[index].trim()) {
      end = index
      break
    }
  }
  return [...lines.slice(0, start + 1), ...block, ...lines.slice(end)].join('\n')
}

function backupHermesConfig(raw: string) {
  const backupPath = `${hermesConfigPath}.cowork-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`
  fs.writeFileSync(backupPath, raw, 'utf8')
  return backupPath
}

function runHermesText(args: string[]) {
  try {
    return execFileSync(hermesBin, args, {
      cwd: hermesAgentDir,
      timeout: 10000,
      encoding: 'utf8'
    })
  } catch (error) {
    return error instanceof Error ? error.message : ''
  }
}

function sanitizeStatusDetail(value: string) {
  const masked = value.replace(/sk-[A-Za-z0-9._-]+/g, '<hidden>').replace(/[A-Za-z0-9_-]{16,}/g, '<hidden>').trim()
  return masked
    .replace(/^\(not set\)$/gi, '未设置')
    .replace(/not logged in\s*\(run:\s*hermes model\)/gi, '未登录，请运行 hermes model')
    .replace(/not logged in\s*\(run:\s*([^)]+)\)/gi, '未登录，请运行 $1')
    .replace(/not logged in/gi, '未登录')
    .replace(/not configured\s*\(run:\s*hermes model\)/gi, '未配置，请运行 hermes model')
    .replace(/not configured/gi, '未配置')
    .replace(/configured/gi, '已配置')
}

function credentialSummary(provider: string, credentials: HermesModelCredential[]) {
  return credentials.find((credential) => credential.id === provider && credential.configured)?.detail ?? ''
}

function normalizeCredentialLabel(label: string) {
  const normalized = label.toLowerCase()
  if (normalized.includes('openrouter')) return 'openrouter'
  if (normalized.includes('openai codex')) return 'openai-codex'
  if (normalized.includes('openai')) return 'openai'
  if (normalized.includes('anthropic') || normalized.includes('claude')) return 'anthropic'
  if (normalized.includes('mini') && normalized.includes('cn')) return 'minimax-cn'
  if (normalized.includes('mini')) return 'minimax'
  if (normalized.includes('z.ai') || normalized.includes('glm')) return 'zai'
  if (normalized.includes('kimi') || normalized.includes('moonshot')) return 'kimi'
  if (normalized.includes('qwen')) return 'qwen'
  if (normalized.includes('github') || normalized.includes('copilot')) return 'copilot'
  return normalizeProviderId(label)
}

function normalizeProviderId(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9:._-]/g, '').slice(0, 80)
}

function normalizeModelValue(value: string) {
  return value.trim().replace(/[\r\n\0]/g, '').slice(0, 160)
}

function normalizeSecretValue(value: string) {
  return value.trim().replace(/[\r\n\0]/g, '').slice(0, 4096)
}

function customProviderId(value: string) {
  return `custom:${normalizeProviderId(value)}`
}

function providerLabel(provider: string) {
  if (!provider || provider === 'auto') return '自动'
  return providerModels[provider]?.label ?? provider.replace(/^custom:/, '')
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function unquoteYaml(value: string) {
  return value
    .trim()
    .replace(/\s+#.*$/, '')
    .replace(/^['"]|['"]$/g, '')
}

function quoteYaml(value: string) {
  return JSON.stringify(value)
}
