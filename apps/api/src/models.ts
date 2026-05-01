import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { dataDir, hermesAgentDir, hermesBin, hermesPythonBin } from './paths.js'
import { HermesModelCatalogProvider, HermesModelCatalogRefreshSource, HermesModelConfigureRequest, HermesModelCredential, HermesModelOverview, HermesModelProvider, HermesReasoningConfigureRequest, HermesReasoningEffort, ModelOption, ModelSettings } from './types.js'

const hermesConfigPath = '/Users/lucas/.hermes/config.yaml'
const hermesEnvPath = '/Users/lucas/.hermes/.env'
const modelCatalogSupplementsPath = path.join(dataDir, 'model-catalog-supplements.json')
const chineseModelProviderIds = new Set([
  'xiaomi',
  'deepseek',
  'zai',
  'kimi-coding',
  'kimi-coding-cn',
  'minimax',
  'minimax-cn',
  'alibaba',
  'qwen-oauth'
])

const xiaomiMiMoModels = [
  'mimo-v2.5-pro',
  'mimo-v2.5',
  'mimo-v2.5-tts-voiceclone',
  'mimo-v2.5-tts-voicedesign',
  'mimo-v2.5-tts',
  'mimo-v2-pro',
  'mimo-v2-omni',
  'mimo-v2-tts'
]

const providerModels: Record<string, { label: string; models: string[] }> = {
  custom: { label: 'Custom endpoint', models: [] },
  xiaomi: { label: 'Xiaomi MiMo', models: xiaomiMiMoModels },
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
  'qwen-oauth': { label: 'Qwen OAuth', models: ['qwen3-coder-plus', 'qwen3.5-plus', 'qwen3-coder-next'] },
  qwen: { label: 'Qwen OAuth', models: ['qwen3-coder-plus', 'qwen3.5-plus', 'qwen3-coder-next'] },
  copilot: { label: 'GitHub Copilot', models: ['gpt-5.4', 'gpt-5.4-mini', 'claude-sonnet-4.6', 'gemini-2.5-pro'] }
}

const nativeProviderCredentialEnv: Record<string, { apiKeyEnv?: string; baseUrlEnv?: string }> = {
  xiaomi: { apiKeyEnv: 'XIAOMI_API_KEY', baseUrlEnv: 'XIAOMI_BASE_URL' },
  deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY', baseUrlEnv: 'DEEPSEEK_BASE_URL' },
  zai: { apiKeyEnv: 'GLM_API_KEY', baseUrlEnv: 'GLM_BASE_URL' },
  'kimi-coding': { apiKeyEnv: 'KIMI_API_KEY', baseUrlEnv: 'KIMI_BASE_URL' },
  'kimi-coding-cn': { apiKeyEnv: 'KIMI_CN_API_KEY' },
  minimax: { apiKeyEnv: 'MINIMAX_API_KEY', baseUrlEnv: 'MINIMAX_BASE_URL' },
  'minimax-cn': { apiKeyEnv: 'MINIMAX_CN_API_KEY', baseUrlEnv: 'MINIMAX_CN_BASE_URL' },
  alibaba: { apiKeyEnv: 'DASHSCOPE_API_KEY', baseUrlEnv: 'DASHSCOPE_BASE_URL' },
  'alibaba-coding-plan': { apiKeyEnv: 'ALIBABA_CODING_PLAN_API_KEY', baseUrlEnv: 'ALIBABA_CODING_PLAN_BASE_URL' }
}

const reasoningEffortValues = new Set(['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh'])

let catalogCache: { value: HermesModelCatalogProvider[]; expiresAt: number } | null = null

export function listModelOptions(settings: ModelSettings) {
  const configModel = readHermesDefaultModel()
  const builtIns: ModelOption[] = [
    {
      id: 'auto',
      label: configModel.model ? `Hermes 默认模型 · ${configModel.model}` : 'Hermes 默认模型',
      builtIn: true,
      provider: configModel.provider || undefined,
      source: 'auto',
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
      source: 'current',
      description: configModel.provider ? `Hermes 当前默认模型 · ${configModel.provider}` : 'Hermes 当前默认模型'
    })
  }

  const seen = new Set<string>()
  const customModels = settings.customModels.map((model) => ({ ...model, source: model.source ?? 'custom' }))
  return [...builtIns, ...customModels, ...listConfiguredProviderModelOptions(settings, configModel)]
    .map((model) => ({
      ...model,
      runtimeModelId: model.id,
      selectedModelKey: modelSelectionKey(model)
    }))
    .filter((model) => {
      if (seen.has(model.selectedModelKey ?? model.id)) return false
      seen.add(model.selectedModelKey ?? model.id)
      return true
    })
}

export function normalizeModelId(value: string) {
  return value.trim().replace(/\s+/g, '-').slice(0, 120)
}

export function modelSelectionKey(model: Pick<ModelOption, 'id' | 'provider' | 'source'>) {
  const provider = normalizeProviderId(model.provider ?? '')
  if (model.id === 'auto' || !provider || provider === 'auto') return model.id
  if (model.source === 'current' || model.source === 'catalog' || model.provider) return `${provider}:${model.id}`
  return model.id
}

export function findModelBySelectionId(options: ModelOption[], selectedModelId: string) {
  return options.find((model) => (model.selectedModelKey ?? modelSelectionKey(model)) === selectedModelId)
    || options.find((model) => model.id === selectedModelId)
}

export function selectedModelOption(settings: ModelSettings) {
  const options = listModelOptions(settings)
  const selected = findModelBySelectionId(options, settings.selectedModelId)
  if (selected && selected.source !== 'catalog') return selected
  return options[0]
}

function listConfiguredProviderModelOptions(
  settings: ModelSettings,
  currentModel: { model: string; provider: string }
): ModelOption[] {
  const providerIds = new Set<string>()
  const currentProviderId = normalizeProviderId(currentModel.provider || '')
  if (currentProviderId && currentProviderId !== 'auto') providerIds.add(currentProviderId)

  for (const model of settings.customModels) {
    const providerId = normalizeProviderId(model.provider || '')
    if (providerId && providerId !== 'auto') providerIds.add(providerId)
  }

  try {
    const config = readHermesModelConfig()
    for (const provider of config.fallbackProviders) {
      const providerId = normalizeProviderId(provider)
      if (providerId && providerId !== 'auto') providerIds.add(providerId)
    }
    for (const provider of config.customProviders) {
      const providerId = normalizeProviderId(provider.id)
      if (!providerId || providerId === 'auto') continue
      if (provider.apiKey || isLocalModelEndpoint(provider.baseUrl) || providerId === currentProviderId) {
        providerIds.add(providerId)
      }
    }
  } catch {
    // If Hermes config is temporarily unreadable, keep the menu to the known built-ins.
  }

  if (!providerIds.size) return []

  const options: ModelOption[] = []
  for (const provider of readHermesModelCatalog()) {
    const providerId = normalizeProviderId(provider.id)
    if (!providerIds.has(providerId)) continue
    const label = provider.label || providerModels[providerId]?.label || providerId
    for (const modelId of provider.models) {
      options.push({
        id: modelId,
        label: modelId,
        provider: providerId,
        builtIn: true,
        source: 'catalog',
        description: `${label} · Hermes 模型目录`
      })
    }
  }
  return options
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
    reasoning: {
      effort: config.reasoningEffort,
      effectiveEffort: config.reasoningEffort || 'medium',
      showReasoning: config.showReasoning,
      delegationEffort: config.delegationReasoningEffort
    },
    updatedAt: new Date().toISOString()
  }
}

export function readHermesModelCatalog(): HermesModelCatalogProvider[] {
  const now = Date.now()
  if (catalogCache && catalogCache.expiresAt > now) return catalogCache.value
  try {
    const raw = execFileSync(hermesPythonBin, ['-c', `
import json
from hermes_cli.models import CANONICAL_PROVIDERS, OPENROUTER_MODELS, _PROVIDER_MODELS
items = [{
    "id": "custom",
    "label": "Custom endpoint",
    "description": "OpenAI-compatible custom endpoint",
    "models": [],
    "source": "hermes",
}]
for provider in CANONICAL_PROVIDERS:
    models = list(_PROVIDER_MODELS.get(provider.slug, []))
    if provider.slug == "openrouter":
        models = [item[0] for item in OPENROUTER_MODELS]
    items.append({
        "id": provider.slug,
        "label": provider.label,
        "description": getattr(provider, "description", None) or getattr(provider, "tui_desc", "") or provider.label,
        "models": models,
        "source": "hermes",
    })
print(json.dumps(items, ensure_ascii=False))
`], {
      cwd: hermesAgentDir,
      env: {
        ...process.env,
        PYTHONPATH: hermesAgentDir
      },
      timeout: 5000,
      encoding: 'utf8'
    })
    const parsed = JSON.parse(raw) as HermesModelCatalogProvider[]
    const value = mergeHermesCatalogSupplements(parsed.filter((provider) => provider.id && provider.label))
    catalogCache = { value, expiresAt: now + 5 * 60 * 1000 }
    return value
  } catch {
    return mergeHermesCatalogSupplements(Object.entries(providerModels).map(([id, preset]) => ({
      id,
      label: preset.label,
      description: preset.label,
      models: preset.models,
      source: 'hermes'
    })))
  }
}

export async function refreshHermesModelCatalog() {
  const sources = await fetchOfficialModelCatalogSupplements()
  const savedSupplements = readSavedModelSupplements()
  let changed = false

  for (const source of sources) {
    if (!source.ok || source.addedModels.length === 0) continue
    const current = savedSupplements[source.provider] ?? []
    const next = uniqueStrings([...source.addedModels, ...current])
    if (next.length !== current.length) {
      savedSupplements[source.provider] = next
      changed = true
    }
  }

  if (changed) writeSavedModelSupplements(savedSupplements)
  catalogCache = null

  return {
    catalog: readHermesModelCatalog(),
    sources,
    updatedAt: new Date().toISOString()
  }
}

function mergeHermesCatalogSupplements(catalog: HermesModelCatalogProvider[]) {
  const providers = new Map<string, HermesModelCatalogProvider>()
  const savedSupplements = readSavedModelSupplements()

  for (const provider of catalog) {
    const id = normalizeProviderId(provider.id)
    const supplement = providerModels[id]
    const savedModels = savedSupplements[id] ?? []
    providers.set(id, {
      ...provider,
      id,
      label: provider.label || supplement?.label || id,
      description: provider.description || supplement?.label || provider.label || id,
      models: normalizeProviderModels(id, [...(supplement?.models ?? []), ...savedModels, ...(provider.models ?? [])]),
      source: provider.source || 'hermes'
    })
  }

  for (const [id, preset] of Object.entries(providerModels)) {
    if (providers.has(id)) continue
    if (id !== 'custom' && !chineseModelProviderIds.has(id)) continue
    providers.set(id, {
      id,
      label: preset.label,
      description: preset.label,
      models: normalizeProviderModels(id, [...(savedSupplements[id] ?? []), ...preset.models]),
      source: 'hermes'
    })
  }

  return [...providers.values()].filter((provider) => isChineseModelProvider(provider.id))
}

export function setHermesDefaultModel(modelId: string, provider?: string) {
  const safeModel = normalizeModelValue(modelId)
  const safeProvider = normalizeProviderId(provider ?? '')
  if (!safeModel) {
    throw new Error('模型 ID 不合法')
  }

  const raw = fs.readFileSync(hermesConfigPath, 'utf8')
  const previousConfig = readHermesModelConfig()
  const backupPath = backupHermesConfig(raw)
  let nextRaw = upsertModelConfig(raw, safeModel, safeProvider)
  if (safeProvider && safeProvider !== normalizeProviderId(previousConfig.provider)) {
    nextRaw = removeModelConfigFields(nextRaw, ['base_url', 'api_key', 'api_mode'])
  }
  if (usesHermesNativeProviderConfig(safeProvider)) {
    nextRaw = removeCustomProviderBlocks(nextRaw, [safeProvider])
  }
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

export function removeHermesModelProvider(providerId: string) {
  const safeProvider = normalizeProviderId(providerId)
  if (!safeProvider) throw new Error('模型服务商不合法')

  const config = readHermesModelConfig()
  if (safeProvider === normalizeProviderId(config.provider)) {
    throw new Error('当前默认模型服务不能删除，请先切换默认模型')
  }

  const raw = fs.readFileSync(hermesConfigPath, 'utf8')
  const backupPath = backupHermesConfig(raw)
  const filteredFallbacks = config.fallbackProviders.filter((provider) => normalizeProviderId(provider) !== safeProvider)
  let nextRaw = removeCustomProviderBlocks(raw, [safeProvider])
  nextRaw = upsertRootYamlList(nextRaw, 'fallback_providers', filteredFallbacks)
  fs.writeFileSync(hermesConfigPath, nextRaw, { encoding: 'utf8', mode: 0o600 })
  removeNativeProviderEnvValues(safeProvider)
  try {
    fs.chmodSync(hermesConfigPath, 0o600)
  } catch {
    // macOS may already enforce permissions; failing chmod should not block config.
  }
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
  const previousConfig = readHermesModelConfig()
  const sameProvider = provider === normalizeProviderId(previousConfig.provider)
  const backupPath = backupHermesConfig(raw)
  const nativeEnv = nativeProviderCredentialEnv[provider]
  if (nativeEnv) {
    writeNativeProviderEnvValues(provider, { apiKey, baseUrl })
  }
  const fields: Record<string, string | undefined> = {
    default: modelId,
    provider
  }
  if (baseUrl) fields.base_url = baseUrl
  if (apiKey && !nativeEnv) fields.api_key = apiKey
  if (apiMode) fields.api_mode = apiMode
  let nextRaw = upsertModelConfigFields(raw, fields)
  if (nativeEnv) {
    nextRaw = removeModelConfigFields(nextRaw, ['api_key'])
  }
  if (!sameProvider) {
    const fieldsToClear = [
      !baseUrl && 'base_url',
      (!apiKey || Boolean(nativeEnv)) && 'api_key',
      !apiMode && 'api_mode'
    ].filter((field): field is string => Boolean(field))
    nextRaw = removeModelConfigFields(nextRaw, fieldsToClear)
  }
  if (usesHermesNativeProviderConfig(provider)) {
    nextRaw = removeCustomProviderBlocks(nextRaw, [provider])
  }
  fs.writeFileSync(hermesConfigPath, nextRaw, { encoding: 'utf8', mode: 0o600 })
  try {
    fs.chmodSync(hermesConfigPath, 0o600)
  } catch {
    // macOS may already enforce permissions; failing chmod should not block config.
  }
  return { ok: true, backupPath }
}

export function configureHermesReasoning(request: HermesReasoningConfigureRequest) {
  const fields: Array<{ section: string; values: Record<string, string | boolean> }> = []
  if (request.effort !== undefined) {
    fields.push({
      section: 'agent',
      values: { reasoning_effort: normalizeReasoningEffort(request.effort) }
    })
  }
  if (request.showReasoning !== undefined) {
    fields.push({
      section: 'display',
      values: { show_reasoning: Boolean(request.showReasoning) }
    })
  }
  if (request.delegationEffort !== undefined) {
    fields.push({
      section: 'delegation',
      values: { reasoning_effort: normalizeReasoningEffort(request.delegationEffort) }
    })
  }
  if (!fields.length) throw new Error('没有需要更新的模型运行参数')

  const raw = fs.readFileSync(hermesConfigPath, 'utf8')
  const backupPath = backupHermesConfig(raw)
  const nextRaw = fields.reduce((current, field) => upsertYamlSectionFields(current, field.section, field.values), raw)
  fs.writeFileSync(hermesConfigPath, nextRaw, { encoding: 'utf8', mode: 0o600 })
  try {
    fs.chmodSync(hermesConfigPath, 0o600)
  } catch {
    // macOS may already enforce permissions; failing chmod should not block config.
  }
  return { ok: true, backupPath }
}

export function readHermesDefaultModel() {
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
  const agentBlock = rootBlock(raw, 'agent')
  const displayBlock = rootBlock(raw, 'display')
  const delegationBlock = rootBlock(raw, 'delegation')
  const provider = normalizeProviderId(readYamlScalar(modelBlock, 'provider') || 'auto')
  return {
    defaultModel: readYamlScalar(modelBlock, 'default') || readYamlScalar(modelBlock, 'model'),
    provider,
    baseUrl: readYamlScalar(modelBlock, 'base_url'),
    apiKey: readYamlScalar(modelBlock, 'api_key'),
    apiMode: readYamlScalar(modelBlock, 'api_mode'),
    fallbackProviders: readYamlList(fallbackBlock),
    reasoningEffort: normalizeReasoningEffort(readYamlScalar(agentBlock, 'reasoning_effort'), false),
    showReasoning: readYamlBoolean(displayBlock, 'show_reasoning', false),
    delegationReasoningEffort: normalizeReasoningEffort(readYamlScalar(delegationBlock, 'reasoning_effort'), false),
    customProviders: readCustomProviders(raw).filter((customProvider) => {
      return !(customProvider.id === provider && usesHermesNativeProviderConfig(provider))
    })
  }
}

function buildHermesProviders(
  config: ReturnType<typeof readHermesModelConfig>,
  credentials: HermesModelCredential[],
  settings: ModelSettings
): HermesModelProvider[] {
  const configuredIds = new Set(credentials.filter((credential) => credential.configured).map((credential) => credential.id))
  const credentialById = new Map(credentials.map((credential) => [credential.id, credential]))
  const providers = new Map<string, HermesModelProvider>()
  const currentProvider = config.provider || 'auto'
  const customModelOptions = settings.customModels.filter((model) => model.provider)

  const addProvider = (provider: HermesModelProvider) => {
    const existing = providers.get(provider.id)
    if (!existing) {
      providers.set(provider.id, provider)
      return
    }
    providers.set(provider.id, {
      ...existing,
      source: existing.source === 'hermes' ? existing.source : provider.source,
      configured: existing.configured || provider.configured,
      isCurrent: existing.isCurrent || provider.isCurrent,
      baseUrl: provider.baseUrl || existing.baseUrl,
      apiMode: provider.apiMode || existing.apiMode,
      models: uniqueStrings([...existing.models, ...provider.models]),
      credentialSummary: uniqueStrings([existing.credentialSummary, provider.credentialSummary]).join('；')
    })
  }

  const currentPreset = hermesProviderPreset(currentProvider)
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

  for (const credential of credentials.filter((item) => shouldShowModelProvider(item.id, currentProvider) && (item.configured || credentialNeedsAttention(item)))) {
    const preset = hermesProviderPreset(credential.id)
    addProvider({
      id: credential.id,
      label: preset.label || credential.label,
      source: credential.kind === 'pool' ? 'auth' : 'hermes',
      configured: credential.configured,
      isCurrent: credential.id === currentProvider,
      models: uniqueStrings([...preset.models]),
      credentialSummary: credential.detail
    })
  }

  for (const provider of config.customProviders) {
    const providerConfigured = Boolean(provider.apiKey) || isLocalModelEndpoint(provider.baseUrl)
    addProvider({
      id: provider.id,
      label: provider.name,
      source: 'config',
      configured: providerConfigured,
      isCurrent: provider.id === currentProvider,
      baseUrl: provider.baseUrl,
      apiMode: provider.apiMode,
      models: uniqueStrings(provider.models),
      credentialSummary: providerConfigured
        ? '来自 config.yaml custom_providers'
        : 'custom_providers 缺少 API Key'
    })
  }

  for (const model of customModelOptions) {
    const providerId = normalizeProviderId(model.provider ?? 'custom')
    if (!providers.has(providerId) && shouldShowModelProvider(providerId, currentProvider)) {
      const preset = hermesProviderPreset(providerId)
      const credential = credentialById.get(providerId)
      addProvider({
        id: providerId,
        label: preset.label || providerId,
        source: 'custom',
        configured: configuredIds.has(providerId),
        isCurrent: providerId === currentProvider,
        models: uniqueStrings([model.id, ...preset.models]),
        credentialSummary: credential?.detail || (configuredIds.has(providerId) ? 'Hermes 已检测到凭据' : 'Cowork 本地模型选项')
      })
    }
  }

  return [...providers.values()].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
    if (a.configured !== b.configured) return a.configured ? -1 : 1
    return a.label.localeCompare(b.label)
  })
}

function isChineseModelProvider(provider: string) {
  return chineseModelProviderIds.has(normalizeProviderId(provider))
}

function shouldShowModelProvider(provider: string, currentProvider = '') {
  const normalized = normalizeProviderId(provider)
  return isChineseModelProvider(normalized) || normalized === normalizeProviderId(currentProvider) || normalized.startsWith('custom:')
}

function credentialNeedsAttention(credential: HermesModelCredential) {
  return credentialDetailNeedsAttention(credential.detail)
}

function credentialDetailNeedsAttention(detail: string) {
  return /(验证失败|不可用|401|403|invalid|expired|exhausted|denied|forbidden|unauthorized|error)/i.test(detail)
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
  let current: { id: string; label: string; count: number; details: string[] } | null = null

  const flush = () => {
    if (!current) return
    const detailText = current.details.join('；')
    const failedStatus = detailText.match(/auth failed\s+(\d+)/i)
    const hasAuthIssue = Boolean(failedStatus) || /(invalid|expired|exhausted|denied|forbidden|unauthorized|error)/i.test(detailText)
    credentials.push({
      id: current.id,
      label: current.label,
      kind: 'pool',
      configured: current.count > 0 && !hasAuthIssue,
      detail: hasAuthIssue
        ? failedStatus
          ? `凭据已保存但验证失败：HTTP ${failedStatus[1]}，请重新填写 Key`
          : `凭据已保存但不可用：${sanitizeStatusDetail(detailText)}`
        : `${current.count} 个 Hermes 凭据池条目`
    })
    current = null
  }

  for (const line of raw.replace(/\r/g, '').split('\n')) {
    const match = line.match(/^([A-Za-z0-9_:. -]+)\s+\((\d+)\s+credentials?\):/)
    if (match) {
      flush()
      const id = normalizeKnownProviderId(match[1])
      current = {
        id,
        label: providerLabel(id),
        count: Number(match[2]),
        details: []
      }
      continue
    }
    if (current && /^\s+#\d+/.test(line)) {
      current.details.push(line.trim())
    }
  }
  flush()
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
    const hasUsableCredential = existing.configured || credential.configured
    const hasAuthIssue = credentialNeedsAttention(existing) || credentialNeedsAttention(credential)
    const mergedConfigured = hasUsableCredential
    const detailParts = [existing.detail, credential.detail]
      .map((detail) => sanitizeStatusDetail(detail))
      .filter((detail) => detail && !(mergedConfigured && detail.includes('未配置')))
    if (mergedConfigured && hasAuthIssue && !detailParts.some((detail) => credentialDetailNeedsAttention(detail))) {
      detailParts.push('凭据验证失败，请重新填写 Key')
    }
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
  const providers: Array<{ id: string; name: string; baseUrl?: string; apiKey?: string; apiMode?: string; models: string[] }> = []
  let current: { name: string; baseUrl?: string; apiKey?: string; apiMode?: string; models: string[] } | null = null
  for (const line of block.split('\n')) {
    const itemMatch = line.match(/^\s*-\s+name:\s*(.+)$/)
    if (itemMatch) {
      if (current) providers.push({ id: customProviderId(current.name), ...current })
      current = { name: unquoteYaml(itemMatch[1]), models: [] }
      continue
    }
    if (!current) continue
    const fieldMatch = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!fieldMatch) continue
    const value = unquoteYaml(fieldMatch[2] ?? '')
    if (fieldMatch[1] === 'base_url' || fieldMatch[1] === 'url' || fieldMatch[1] === 'api') current.baseUrl = value
    if (fieldMatch[1] === 'api_key') current.apiKey = value
    if (fieldMatch[1] === 'api_mode') current.apiMode = value
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

function readYamlBoolean(block: string, key: string, fallback: boolean) {
  const value = readYamlScalar(block, key).toLowerCase()
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
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

function upsertYamlSectionFields(raw: string, section: string, fields: Record<string, string | boolean>) {
  const lines = raw.replace(/\r/g, '').split('\n')
  const start = lines.findIndex((line) => line.trim() === `${section}:`)
  const entries = Object.entries(fields)
  if (start === -1) {
    return [`${section}:`, ...entries.map(([key, value]) => `  ${key}: ${formatYamlValue(value)}`), raw].join('\n')
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
    block = upsertIndentedYamlValue(block, key, value)
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

function upsertIndentedYamlValue(lines: string[], key: string, value: string | boolean) {
  const next = [...lines]
  const index = next.findIndex((line) => line.match(new RegExp(`^\\s+${key}:`)))
  const line = `  ${key}: ${formatYamlValue(value)}`
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

function removeCustomProviderBlocks(raw: string, providers: string[]) {
  const providerIds = new Set(providers.map(normalizeProviderId).filter(Boolean))
  if (!providerIds.size) return raw

  const lines = raw.replace(/\r/g, '').split('\n')
  const start = lines.findIndex((line) => line.trim() === 'custom_providers:')
  if (start === -1) return raw

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\S/.test(lines[index]) && lines[index].trim()) {
      end = index
      break
    }
  }

  const nextBlock: string[] = []
  let currentBlock: string[] = []
  const flush = () => {
    if (!currentBlock.length) return
    const nameLine = currentBlock.find((line) => /^\s*-\s+name:\s*/.test(line))
    const name = nameLine?.replace(/^\s*-\s+name:\s*/, '') ?? ''
    const normalizedName = normalizeProviderId(unquoteYaml(name))
    const normalizedCustomId = customProviderId(normalizedName)
    if (!providerIds.has(normalizedName) && !providerIds.has(normalizedCustomId)) {
      nextBlock.push(...currentBlock)
    }
    currentBlock = []
  }

  for (const line of lines.slice(start + 1, end)) {
    if (/^\s*-\s+name:\s*/.test(line)) flush()
    currentBlock.push(line)
  }
  flush()

  return [...lines.slice(0, start + 1), ...nextBlock, ...lines.slice(end)].join('\n')
}

function removeModelConfigFields(raw: string, fields: string[]) {
  const fieldSet = new Set(fields.filter(Boolean))
  if (!fieldSet.size) return raw

  const lines = raw.replace(/\r/g, '').split('\n')
  const start = lines.findIndex((line) => line.trim() === 'model:')
  if (start === -1) return raw

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\S/.test(lines[index]) && lines[index].trim()) {
      end = index
      break
    }
  }

  const nextBlock = lines.slice(start + 1, end).filter((line) => {
    const match = line.match(/^\s+([A-Za-z0-9_-]+):/)
    return !match || !fieldSet.has(match[1])
  })
  return [...lines.slice(0, start + 1), ...nextBlock, ...lines.slice(end)].join('\n')
}

function writeNativeProviderEnvValues(provider: string, values: { apiKey?: string; baseUrl?: string }) {
  const env = nativeProviderCredentialEnv[normalizeProviderId(provider)]
  if (!env) return
  const updates: Record<string, string> = {}
  if (env.apiKeyEnv && values.apiKey) updates[env.apiKeyEnv] = values.apiKey
  if (env.baseUrlEnv && values.baseUrl) updates[env.baseUrlEnv] = values.baseUrl.replace(/\/+$/, '')
  writeHermesEnvValues(updates)
}

function removeNativeProviderEnvValues(provider: string) {
  const env = nativeProviderCredentialEnv[normalizeProviderId(provider)]
  if (!env) return
  removeHermesEnvValues([env.apiKeyEnv, env.baseUrlEnv].filter((key): key is string => Boolean(key)))
}

function writeHermesEnvValues(values: Record<string, string>) {
  const entries = Object.entries(values)
    .map(([key, value]) => [normalizeEnvKey(key), normalizeSecretValue(value)] as const)
    .filter(([key, value]) => key && value)
  if (!entries.length) return

  fs.mkdirSync(path.dirname(hermesEnvPath), { recursive: true })
  const lines = fs.existsSync(hermesEnvPath) ? fs.readFileSync(hermesEnvPath, 'utf8').replace(/\r/g, '').split('\n') : []
  for (const [key, value] of entries) {
    const line = `${key}=${value}`
    const index = lines.findIndex((item) => envLineKey(item) === key)
    if (index >= 0) lines[index] = line
    else lines.push(line)
    process.env[key] = value
  }
  fs.writeFileSync(hermesEnvPath, `${trimTrailingEmptyLines(lines).join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
  try {
    fs.chmodSync(hermesEnvPath, 0o600)
  } catch {
    // Keep going if the file system already controls permissions.
  }
}

function removeHermesEnvValues(keys: string[]) {
  const keySet = new Set(keys.map(normalizeEnvKey).filter(Boolean))
  if (!keySet.size || !fs.existsSync(hermesEnvPath)) return
  const lines = fs.readFileSync(hermesEnvPath, 'utf8').replace(/\r/g, '').split('\n')
  const nextLines = lines.filter((line) => {
    const key = envLineKey(line)
    return !key || !keySet.has(key)
  })
  for (const key of keySet) {
    delete process.env[key]
  }
  fs.writeFileSync(hermesEnvPath, `${trimTrailingEmptyLines(nextLines).join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
}

function envLineKey(line: string) {
  const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/)
  return match ? match[1] : ''
}

function normalizeEnvKey(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_]/g, '').slice(0, 80)
}

function trimTrailingEmptyLines(lines: string[]) {
  const next = [...lines]
  while (next.length && !next[next.length - 1].trim()) next.pop()
  return next
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
  return normalizeKnownProviderId(label)
}

function normalizeKnownProviderId(value: string) {
  const normalized = normalizeProviderId(value)
  const unwrappedCustom = normalized.startsWith('custom:') ? normalizeProviderId(normalized.replace(/^custom:/, '')) : normalized
  return isChineseModelProvider(unwrappedCustom) ? unwrappedCustom : normalized
}

async function fetchOfficialModelCatalogSupplements(): Promise<HermesModelCatalogRefreshSource[]> {
  const sources: HermesModelCatalogRefreshSource[] = []
  sources.push(await fetchXiaomiOfficialModels())
  return sources
}

async function fetchXiaomiOfficialModels(): Promise<HermesModelCatalogRefreshSource> {
  const url = 'https://mimo.mi.com/'
  try {
    const response = await fetchWithTimeout(url, 8000)
    if (!response.ok) {
      return {
        provider: 'xiaomi',
        label: 'Xiaomi MiMo',
        url,
        ok: false,
        addedModels: [],
        message: `官网返回 ${response.status}`
      }
    }
    const html = await response.text()
    const matches = [...html.matchAll(/MiMo-?(V[0-9.]+(?:-(?:Pro|Omni|Flash|TTS(?:-(?:VoiceClone|VoiceDesign))?))?)/gi)]
    const models = normalizeProviderModels('xiaomi', [
      ...xiaomiMiMoModels,
      ...matches.map((match) => `mimo-${match[1].toLowerCase()}`)
    ])
    return {
      provider: 'xiaomi',
      label: 'Xiaomi MiMo',
      url,
      ok: true,
      addedModels: models,
      message: models.length ? `从官网发现 ${models.length} 个模型` : '官网暂未解析到可用于对话的模型'
    }
  } catch (error) {
    return {
      provider: 'xiaomi',
      label: 'Xiaomi MiMo',
      url,
      ok: false,
      addedModels: [],
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Hermes-Cowork/0.1 model-catalog-refresh'
      }
    })
  } finally {
    clearTimeout(timer)
  }
}

function readSavedModelSupplements(): Record<string, string[]> {
  try {
    const raw = fs.readFileSync(modelCatalogSupplementsPath, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(Object.entries(parsed).map(([provider, models]) => [
      normalizeProviderId(provider),
      Array.isArray(models) ? uniqueStrings(models.map(String)) : []
    ]))
  } catch {
    return {}
  }
}

function writeSavedModelSupplements(supplements: Record<string, string[]>) {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(modelCatalogSupplementsPath, `${JSON.stringify(supplements, null, 2)}\n`, 'utf8')
}

export function normalizeProviderId(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9:._-]/g, '').slice(0, 80)
}

function normalizeModelValue(value: string) {
  return value.trim().replace(/[\r\n\0]/g, '').slice(0, 160)
}

function normalizeSecretValue(value: string) {
  return value.trim().replace(/[\r\n\0]/g, '').slice(0, 4096)
}

function customProviderId(value: string) {
  const normalized = normalizeProviderId(value)
  return isChineseModelProvider(normalized) ? normalized : `custom:${normalized}`
}

function usesHermesNativeProviderConfig(provider: string) {
  const normalized = normalizeProviderId(provider)
  return isChineseModelProvider(normalized) && !normalized.startsWith('custom:')
}

function isLocalModelEndpoint(baseUrl?: string) {
  return Boolean(baseUrl && /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i.test(baseUrl))
}

function providerLabel(provider: string) {
  if (!provider || provider === 'auto') return '自动'
  return hermesProviderPreset(provider).label || provider.replace(/^custom:/, '')
}

function hermesProviderPreset(provider: string) {
  const normalized = normalizeProviderId(provider)
  const catalogProvider = readHermesModelCatalog().find((item) => item.id === normalized)
  if (catalogProvider) {
    return {
      label: catalogProvider.label,
      models: catalogProvider.models
    }
  }
  return providerModels[normalized] ?? { label: normalized.replace(/^custom:/, '') || 'Custom endpoint', models: [] }
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function normalizeProviderModels(providerId: string, models: string[]) {
  const normalizedProviderId = normalizeProviderId(providerId)
  const uniqueModels = uniqueStrings(models.map((model) => normalizedProviderId === 'xiaomi' ? model.toLowerCase() : model))
  if (normalizedProviderId !== 'xiaomi') return uniqueModels

  const officialModelSet = new Set(xiaomiMiMoModels)
  const officialExtras = uniqueModels.filter((model) => (
    /^mimo-v/i.test(model)
    && model !== 'mimo-v2-flash'
    && !officialModelSet.has(model)
  ))
  return uniqueStrings([...xiaomiMiMoModels, ...officialExtras])
}

function unquoteYaml(value: string) {
  return value
    .trim()
    .replace(/\s+#.*$/, '')
    .replace(/^['"]|['"]$/g, '')
}

function normalizeReasoningEffort(value: unknown, strict = true): HermesReasoningEffort {
  const effort = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (reasoningEffortValues.has(effort)) return effort as HermesReasoningEffort
  if (!strict) return ''
  throw new Error('思考强度不合法')
}

function formatYamlValue(value: string | boolean) {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return quoteYaml(value)
}

function quoteYaml(value: string) {
  return JSON.stringify(value)
}
