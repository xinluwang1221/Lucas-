import cors from 'cors'
import express from 'express'
import type { Response } from 'express'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import multer from 'multer'
import { findChangedArtifacts, takeSnapshot } from './artifacts.js'
import { getBackgroundServiceStatus, installBackgroundServices, uninstallBackgroundServices } from './background.js'
import { quickLookPreviewRoot, readPreviewBody, sendInlineFile, sendQuickLookPreview } from './file_preview.js'
import { cleanHermesOutput } from './hermes.js'
import { runHermesContextCommand } from './hermes_python.js'
import { readHermesRuntimeAdapterStatus, runHermesRuntimeTask, type HermesBridgeEvent, type HermesRuntimeHandle } from './hermes_runtime.js'
import { readHermesUpdateStatus, runHermesAutoUpdate, runHermesCompatibilityTest } from './hermes_update.js'
import { hermesAgentDir, hermesBin, hermesPythonBin } from './paths.js'
import { configureHermesMcpServer, getHermesMcpServeStatus, installHermesMcpServer, readHermesMcpConfig, readHermesMcpRecommendations, refreshHermesMcpRecommendations, refreshHermesMcpRecommendationsWithHermes, removeHermesMcpServer, searchHermesMcpMarketplace, setHermesMcpServerEnabled, setHermesMcpServerTools, startHermesMcpServe, startMcpRecommendationScheduler, stopHermesMcpServe, testHermesMcpServer, updateHermesMcpServer } from './mcp.js'
import {
  configureHermesModel,
  configureHermesReasoning,
  findModelBySelectionId,
  listModelOptions,
  modelSelectionKey,
  normalizeModelId,
  normalizeProviderId,
  readHermesDefaultModel,
  readHermesModelCatalog,
  readHermesModelOverview,
  refreshHermesModelCatalog,
  removeHermesModelProvider,
  selectedModelOption,
  setHermesDefaultModel,
  setHermesFallbackProviders
} from './models.js'
import { installUploadedSkill, listLocalSkills, listSkillFiles, readSkillFile } from './skills.js'
import { ensureInsideWorkspace, store } from './store.js'
import { AppState, Artifact, ExecutionActivity, ExecutionEvent, ExecutionView, HermesContextSnapshot, HermesModelOverview, HermesReasoningEffort, MessageAttachment, ModelOption, ModelSettings, Task, Workspace } from './types.js'

const app = express()
const port = Number(process.env.PORT || 8787)
const upload = multer({ dest: path.join(process.cwd(), 'data', 'uploads') })
const runningTasks = new Map<string, HermesRuntimeHandle>()
const taskStreamClients = new Map<string, Set<Response>>()
const maxStoredExecutionEvents = 180
const TASK_STREAM_BROADCAST_MS = 180
const taskStreamBroadcastTimers = new Map<string, ReturnType<typeof setTimeout>>()
const approvalChoices = new Set(['once', 'session', 'always', 'deny'])

function stopRunningTask(taskId: string) {
  const handle = runningTasks.get(taskId)
  if (!handle) return false
  handle.stop()
  runningTasks.delete(taskId)
  return true
}

app.use(cors({ origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] }))
app.use(express.json({ limit: '2mb' }))
app.use('/api/quicklook', express.static(quickLookPreviewRoot, {
  dotfiles: 'deny',
  fallthrough: false
}))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'Hermes Cowork API' })
})

app.get('/api/hermes/runtime', async (_req, res) => {
  try {
    const workspacePath = store.snapshot.workspaces[0]?.path ?? process.cwd()
    const [versionText, statusText] = await Promise.all([
      runHermesCommand(['version']),
      runHermesCommand(['status'])
    ])
    const adapter = await readHermesRuntimeAdapterStatus(workspacePath)

    res.json({
      bridgeMode: adapter.activeMode,
      adapter,
      paths: {
        hermesBin,
        hermesAgentDir,
        hermesPythonBin
      },
      versionText,
      statusText,
      parsed: parseHermesStatus(statusText),
      updatedAt: new Date().toISOString()
    })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/hermes/update-status', async (_req, res) => {
  try {
    res.json(await readHermesUpdateStatus())
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/hermes/compatibility-test', async (_req, res) => {
  try {
    res.json(await runHermesCompatibilityTest(store.snapshot))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/hermes/update', async (_req, res) => {
  try {
    res.json(await runHermesAutoUpdate(store.snapshot))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/hermes/sessions', (_req, res) => {
  try {
    res.json(readHermesSessions(store.snapshot))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/hermes/mcp', (_req, res) => {
  try {
    res.json(readHermesMcpConfig())
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/hermes/mcp/marketplace', async (req, res) => {
  try {
    res.json(await searchHermesMcpMarketplace(String(req.query.q ?? '')))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/hermes/mcp/recommendations', (_req, res) => {
  try {
    res.json(readHermesMcpRecommendations())
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/hermes/mcp/recommendations/refresh', async (_req, res) => {
  try {
    res.json(await refreshHermesMcpRecommendations(store.snapshot.tasks))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/hermes/mcp/recommendations/refresh-ai', async (_req, res) => {
  try {
    res.json(await refreshHermesMcpRecommendationsWithHermes(store.snapshot.tasks))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/hermes/mcp/serve', (_req, res) => {
  try {
    res.json(getHermesMcpServeStatus())
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/hermes/mcp/serve/start', (_req, res) => {
  try {
    res.json(startHermesMcpServe())
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/hermes/mcp/serve/stop', (_req, res) => {
  try {
    res.json(stopHermesMcpServe())
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/background/status', (_req, res) => {
  res.json(getBackgroundServiceStatus())
})

app.post('/api/background/install', (_req, res) => {
  try {
    res.json(installBackgroundServices())
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/background/uninstall', (_req, res) => {
  try {
    res.json(uninstallBackgroundServices())
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/hermes/mcp/install', async (req, res) => {
  try {
    const { installName, suggestedCommand, suggestedArgs } = req.body as {
      installName?: unknown
      suggestedCommand?: unknown
      suggestedArgs?: unknown
    }
    if (typeof installName !== 'string' || typeof suggestedCommand !== 'string' || !Array.isArray(suggestedArgs)) {
      res.status(400).json({ error: 'installName, suggestedCommand and suggestedArgs are required' })
      return
    }
    res.status(201).json(await installHermesMcpServer({ installName, suggestedCommand, suggestedArgs }))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/hermes/mcp/manual', async (req, res) => {
  try {
    const { name, transport, command, args, url, env, auth, authHeaderName, authHeaderValue, preset } = req.body as {
      name?: unknown
      transport?: unknown
      command?: unknown
      args?: unknown
      url?: unknown
      env?: unknown
      auth?: unknown
      authHeaderName?: unknown
      authHeaderValue?: unknown
      preset?: unknown
    }
    if (typeof name !== 'string' || !['stdio', 'http', 'sse'].includes(String(transport))) {
      res.status(400).json({ error: 'name and transport are required' })
      return
    }
    res.status(201).json(await configureHermesMcpServer({
      name,
      transport: transport as 'stdio' | 'http' | 'sse',
      command: typeof command === 'string' ? command : undefined,
      args: Array.isArray(args) ? args.map(String) : [],
      url: typeof url === 'string' ? url : undefined,
      env: Array.isArray(env) ? env.map(String) : [],
      auth: ['none', 'oauth', 'header'].includes(String(auth)) ? auth as 'none' | 'oauth' | 'header' : 'none',
      authHeaderName: typeof authHeaderName === 'string' ? authHeaderName : undefined,
      authHeaderValue: typeof authHeaderValue === 'string' ? authHeaderValue : undefined,
      preset: typeof preset === 'string' ? preset : undefined
    }))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/hermes/mcp/:serverId/test', async (req, res) => {
  try {
    const serverId = req.params.serverId
    const exists = readHermesMcpConfig().servers.some((server) => server.id === serverId)
    if (!exists) {
      res.status(404).json({ error: 'mcp server not found' })
      return
    }
    res.json(await testHermesMcpServer(serverId))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.delete('/api/hermes/mcp/:serverId', async (req, res) => {
  try {
    res.json(await removeHermesMcpServer(req.params.serverId))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.patch('/api/hermes/mcp/:serverId', async (req, res) => {
  try {
    const { name, transport, command, args, url, env, auth, authHeaderName, authHeaderValue, preset } = req.body as {
      name?: unknown
      transport?: unknown
      command?: unknown
      args?: unknown
      url?: unknown
      env?: unknown
      auth?: unknown
      authHeaderName?: unknown
      authHeaderValue?: unknown
      preset?: unknown
    }
    if (!['stdio', 'http', 'sse'].includes(String(transport))) {
      res.status(400).json({ error: 'transport is required' })
      return
    }
    res.json(await updateHermesMcpServer(req.params.serverId, {
      name: typeof name === 'string' ? name : req.params.serverId,
      transport: transport as 'stdio' | 'http' | 'sse',
      command: typeof command === 'string' ? command : undefined,
      args: Array.isArray(args) ? args.map(String) : [],
      url: typeof url === 'string' ? url : undefined,
      env: Array.isArray(env) ? env.map(String) : [],
      auth: ['none', 'oauth', 'header'].includes(String(auth)) ? auth as 'none' | 'oauth' | 'header' : 'none',
      authHeaderName: typeof authHeaderName === 'string' ? authHeaderName : undefined,
      authHeaderValue: typeof authHeaderValue === 'string' ? authHeaderValue : undefined,
      preset: typeof preset === 'string' ? preset : undefined
    }))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.patch('/api/hermes/mcp/:serverId/tools', (req, res) => {
  try {
    const { mode, tools } = req.body as { mode?: unknown; tools?: unknown }
    if (!['all', 'include', 'exclude'].includes(String(mode))) {
      res.status(400).json({ error: 'mode is required' })
      return
    }
    res.json(setHermesMcpServerTools(req.params.serverId, {
      mode: mode as 'all' | 'include' | 'exclude',
      tools: Array.isArray(tools) ? tools.map(String) : []
    }))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/hermes/mcp/:serverId/enabled', (req, res) => {
  try {
    const { enabled } = req.body as { enabled?: unknown }
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled boolean is required' })
      return
    }
    res.json(setHermesMcpServerEnabled(req.params.serverId, enabled))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/models', (_req, res) => {
  const settings = store.snapshot.modelSettings
  res.json(modelListResponse(settings))
})

app.post('/api/models/catalog/refresh', async (_req, res) => {
  try {
    const refreshResult = await refreshHermesModelCatalog()
    const settings = store.snapshot.modelSettings
    res.json(modelListResponse(settings, refreshResult.catalog, {
      sources: refreshResult.sources,
      updatedAt: refreshResult.updatedAt
    }))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/models/select', (req, res) => {
  const { modelId } = req.body as { modelId?: string }
  const options = listModelOptions(store.snapshot.modelSettings)
  const model = findModelBySelectionId(options, modelId || '')
  if (!model) {
    res.status(404).json({ error: 'model not found' })
    return
  }
  if (model.source === 'catalog') {
    res.status(400).json({ error: '请先在“配置模型服务”中保存该模型，再作为本次任务模型使用。' })
    return
  }

  store.update((state) => {
    state.modelSettings.selectedModelId = model.selectedModelKey ?? modelSelectionKey(model)
  })
  res.json({ ok: true, selectedModelId: model.selectedModelKey ?? modelSelectionKey(model) })
})

app.post('/api/models', (req, res) => {
  const { id, label, provider, description } = req.body as Partial<ModelOption>
  const normalizedId = normalizeModelId(id || label || '')
  if (!normalizedId) {
    res.status(400).json({ error: 'model id is required' })
    return
  }

  const model: ModelOption = {
    id: normalizedId,
    label: label?.trim() || normalizedId,
    provider: provider?.trim() || undefined,
    source: 'custom',
    description: description?.trim() || '用户添加的本机模型选项'
  }

  store.update((state) => {
    state.modelSettings.customModels = [
      model,
      ...state.modelSettings.customModels.filter((item) => item.id !== model.id)
    ]
    state.modelSettings.selectedModelId = modelSelectionKey(model)
  })

  res.status(201).json({
    ...model,
    selectedModelKey: modelSelectionKey(model),
    runtimeModelId: model.id
  })
})

app.delete('/api/models/:modelId', (req, res) => {
  const modelId = normalizeModelId(req.params.modelId)
  if (!modelId || modelId === 'auto') {
    res.status(400).json({ error: '只能删除 Cowork 中已配置的自定义模型' })
    return
  }

  let removed = false
  store.update((state) => {
    const nextModels = state.modelSettings.customModels.filter((model) => {
      const normalizedModelId = modelId || ''
      const key = modelSelectionKey(model)
      return model.id !== normalizedModelId && key !== normalizedModelId
    })
    removed = nextModels.length !== state.modelSettings.customModels.length
    const selectedModelId = state.modelSettings.selectedModelId
    const deletedModel = state.modelSettings.customModels.filter((model) => {
      const key = modelSelectionKey(model)
      return model.id === modelId || key === modelId
    })
    const selectedWasRemoved = deletedModel.some((model) => {
      const key = modelSelectionKey(model)
      return key === selectedModelId || model.id === selectedModelId
    })
    state.modelSettings.customModels = nextModels
    if (selectedWasRemoved) {
      state.modelSettings.selectedModelId = 'auto'
    } else if (selectedModelId === `${modelId}`) {
      state.modelSettings.selectedModelId = 'auto'
    }
  })

  if (!removed) {
    res.status(404).json({ error: 'model not found' })
    return
  }

  const settings = store.snapshot.modelSettings
  res.json(modelListResponse(settings))
})

function rememberConfiguredModels(
  settings: ModelSettings,
  candidates: Array<{ model?: string; modelId?: string; provider?: string }>
) {
  const additions: ModelOption[] = []
  for (const candidate of candidates) {
    const id = normalizeModelId(candidate.model ?? candidate.modelId ?? '')
    const provider = typeof candidate.provider === 'string' ? candidate.provider.trim() : ''
    if (!id || id === 'auto') continue
    const providerKey = normalizeProviderId(provider)
    const candidateKey = providerKey ? `${providerKey}:${id}` : id
    const existing = settings.customModels.find((model) => {
      const key = modelSelectionKey(model)
      if (model.id !== id) return false
      return !providerKey || key === candidateKey
    })
    additions.push({
      id,
      label: existing?.label || id,
      provider: provider || existing?.provider,
      source: 'custom',
      description: existing?.description || (provider ? `${providerLabelForModelOption(provider)} · 已配置模型` : '已配置的 Hermes 模型')
    })
  }

  if (!additions.length) return
  const seen = new Set<string>()
  settings.customModels = [...additions, ...settings.customModels]
    .filter((model) => {
      const key = modelSelectionKey(model)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function providerLabelForModelOption(provider: string) {
  if (provider === 'xiaomi') return 'Xiaomi MiMo'
  if (provider === 'minimax') return 'MiniMax'
  if (provider === 'deepseek') return 'DeepSeek'
  if (provider === 'zai') return 'Z.AI / GLM'
  return provider
}

function effectiveSelectedModelId(settings: ModelSettings) {
  const selected = selectedModelOption(settings)
  return selected?.selectedModelKey ?? (selected ? modelSelectionKey(selected) : 'auto')
}

function modelListResponse(
  settings: ModelSettings,
  catalog = readHermesModelCatalog(),
  catalogRefresh?: { sources: unknown[]; updatedAt: string }
) {
  return {
    selectedModelId: effectiveSelectedModelId(settings),
    models: listModelOptions(settings),
    hermes: withRecentModelFailureSignals(readHermesModelOverview(settings)),
    catalog,
    ...(catalogRefresh ? { catalogRefresh } : {})
  }
}

function withRecentModelFailureSignals(overview: HermesModelOverview): HermesModelOverview {
  const failures = recentModelAuthFailures()
  if (!failures.size) return overview
  return {
    ...overview,
    credentials: overview.credentials.map((credential) => {
      const detail = failures.get(normalizeProviderId(credential.id))
      if (!detail) return credential
      return {
        ...credential,
        detail: appendStatusDetail(credential.detail, detail)
      }
    }),
    providers: overview.providers.map((provider) => {
      const detail = failures.get(normalizeProviderId(provider.id))
      if (!detail) return provider
      return {
        ...provider,
        credentialSummary: appendStatusDetail(provider.credentialSummary, detail)
      }
    })
  }
}

function recentModelAuthFailures() {
  const failures = new Map<string, string>()
  const recentTasks = [...store.snapshot.tasks]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 50)
  for (const task of recentTasks) {
    const text = [
      task.error,
      task.stderr,
      task.stdout,
      ...(task.events ?? []).map((event) => [
        event.error,
        event.message,
        event.summary,
        event.detail,
        event.text
      ].filter(Boolean).join(' '))
    ].filter(Boolean).join('\n')
    if (!/(HTTP\s*401|invalid api key|unauthorized|forbidden|authenticationerror)/i.test(text)) continue
    for (const provider of authFailureProviders(text, task.provider)) {
      if (provider && !failures.has(provider)) {
        failures.set(provider, '最近任务验证失败：HTTP 401 / Invalid API Key，请重新填写 Key')
      }
    }
  }
  return failures
}

function authFailureProviders(text: string, fallbackProvider?: string) {
  const providers = new Set<string>()
  for (const match of text.matchAll(/\bProvider:\s*([A-Za-z0-9:._-]+)/gi)) {
    const provider = normalizeProviderId(match[1])
    if (provider) providers.add(provider)
  }
  if (!providers.size) {
    const fallback = normalizeProviderId(fallbackProvider ?? '')
    if (fallback) providers.add(fallback)
  }
  return [...providers]
}

function appendStatusDetail(current: string, detail: string) {
  if (!current) return detail
  if (current.includes(detail)) return current
  return `${current}；${detail}`
}

app.post('/api/models/hermes-default', (req, res) => {
  try {
    const { modelId, provider } = req.body as { modelId?: unknown; provider?: unknown }
    if (typeof modelId !== 'string') {
      res.status(400).json({ error: 'modelId is required' })
      return
    }
    const previousDefault = readHermesDefaultModel()
    setHermesDefaultModel(modelId, typeof provider === 'string' ? provider : undefined)
    store.update((state) => {
      state.modelSettings.selectedModelId = 'auto'
      rememberConfiguredModels(state.modelSettings, [
        previousDefault,
        { model: modelId, provider: typeof provider === 'string' ? provider : previousDefault.provider }
      ])
    })
    const settings = store.snapshot.modelSettings
    res.json(modelListResponse(settings))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/models/configure', (req, res) => {
  try {
    const { provider, modelId, baseUrl, apiKey, apiMode } = req.body as Record<string, unknown>
    if (typeof provider !== 'string' || typeof modelId !== 'string') {
      res.status(400).json({ error: 'provider and modelId are required' })
      return
    }
    const previousDefault = readHermesDefaultModel()
    configureHermesModel({
      provider,
      modelId,
      baseUrl: typeof baseUrl === 'string' ? baseUrl : undefined,
      apiKey: typeof apiKey === 'string' ? apiKey : undefined,
      apiMode: typeof apiMode === 'string' ? apiMode : undefined
    })
    store.update((state) => {
      state.modelSettings.selectedModelId = 'auto'
      rememberConfiguredModels(state.modelSettings, [
        previousDefault,
        { model: modelId, provider }
      ])
    })
    const settings = store.snapshot.modelSettings
    res.json(modelListResponse(settings))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/models/reasoning', (req, res) => {
  try {
    const { effort, showReasoning, delegationEffort } = req.body as Record<string, unknown>
    configureHermesReasoning({
      effort: typeof effort === 'string' ? effort as HermesReasoningEffort : undefined,
      showReasoning: typeof showReasoning === 'boolean' ? showReasoning : undefined,
      delegationEffort: typeof delegationEffort === 'string' ? delegationEffort as HermesReasoningEffort : undefined
    })
    const settings = store.snapshot.modelSettings
    res.json(modelListResponse(settings))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.delete('/api/models/providers/:providerId', (req, res) => {
  try {
    removeHermesModelProvider(req.params.providerId)
    store.update((state) => {
      state.modelSettings.selectedModelId = 'auto'
      state.modelSettings.customModels = state.modelSettings.customModels.filter((model) => model.provider !== req.params.providerId)
    })
    const settings = store.snapshot.modelSettings
    res.json(modelListResponse(settings))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(message.includes('当前默认') ? 409 : 500).json({ error: message })
  }
})

app.post('/api/models/fallbacks', (req, res) => {
  try {
    const { providers } = req.body as { providers?: unknown }
    if (!Array.isArray(providers) || providers.some((provider) => typeof provider !== 'string')) {
      res.status(400).json({ error: 'providers must be a string array' })
      return
    }
    setHermesFallbackProviders(providers)
    const settings = store.snapshot.modelSettings
    res.json(modelListResponse(settings))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/state', (_req, res) => {
  const state = store.snapshot
  res.json({
    ...state,
    tasks: enrichTasks(state)
  })
})

app.get('/api/skills', (_req, res) => {
  res.json(listLocalSkills(store.snapshot.skillSettings))
})

app.get('/api/skills/:skillId/files', (req, res) => {
  const files = listSkillFiles(req.params.skillId, store.snapshot.skillSettings)
  if (!files) {
    res.status(404).json({ error: 'skill not found' })
    return
  }
  res.json(files)
})

app.get('/api/skills/:skillId/files/content', (req, res) => {
  const relativePath = String(req.query.path ?? '')
  if (!relativePath) {
    res.status(400).json({ error: 'path is required' })
    return
  }

  try {
    const content = readSkillFile(req.params.skillId, relativePath, store.snapshot.skillSettings)
    if (content === null) {
      res.status(404).json({ error: 'skill not found' })
      return
    }
    res.type('text/plain').send(content)
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/skills/:skillId/toggle', (req, res) => {
  const { enabled } = req.body as { enabled?: boolean }
  const skillId = req.params.skillId
  const skill = listLocalSkills(store.snapshot.skillSettings).find((item) => item.id === skillId)
  if (!skill) {
    res.status(404).json({ error: 'skill not found' })
    return
  }

  store.update((state) => {
    state.skillSettings[skillId] = {
      enabled: Boolean(enabled),
      updatedAt: new Date().toISOString()
    }
  })

  res.json({ ok: true, skill: { ...skill, enabled: Boolean(enabled) } })
})

app.post('/api/skills/upload', upload.single('skill'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'skill file is required' })
    return
  }
  if (!req.file.originalname.toLowerCase().endsWith('.md')) {
    fs.unlinkSync(req.file.path)
    res.status(400).json({ error: 'only SKILL.md style markdown files are supported in this MVP' })
    return
  }

  try {
    const uploaded = installUploadedSkill(req.file.path, req.file.originalname)
    fs.unlinkSync(req.file.path)
    store.update((state) => {
      state.skillSettings[uploaded.id] = {
        enabled: true,
        updatedAt: new Date().toISOString()
      }
    })
    res.status(201).json(uploaded)
  } catch (error) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/workspaces', (_req, res) => {
  res.json(store.snapshot.workspaces)
})

app.post('/api/system/pick-directory', async (_req, res) => {
  try {
    const directory = await pickDirectoryWithFinder()
    res.json(directory)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(message.includes('取消') ? 400 : 500).json({ error: message })
  }
})

app.get('/api/workspaces/:workspaceId/files', (req, res) => {
  const workspace = store.snapshot.workspaces.find((item) => item.id === req.params.workspaceId)
  if (!workspace || !fs.existsSync(workspace.path)) {
    res.status(404).json({ error: 'workspace not found' })
    return
  }

  res.json(listWorkspaceFiles(workspace.path))
})

app.get('/api/workspaces/:workspaceId/tree', (req, res) => {
  const workspace = store.snapshot.workspaces.find((item) => item.id === req.params.workspaceId)
  const relativePath = normalizeRelativePath(String(req.query.path ?? ''))
  if (!workspace || !fs.existsSync(workspace.path)) {
    res.status(404).json({ error: 'workspace not found' })
    return
  }

  try {
    const targetPath = ensureInsideWorkspace(path.join(workspace.path, relativePath), workspace.path)
    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
      res.status(404).json({ error: 'directory not found' })
      return
    }

    res.json(listWorkspaceDirectory(workspace.id, workspace.path, relativePath, targetPath))
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/workspaces/:workspaceId/files/preview', (req, res) => {
  const workspace = store.snapshot.workspaces.find((item) => item.id === req.params.workspaceId)
  const relativePath = String(req.query.path ?? '')
  if (!workspace || !relativePath) {
    res.status(404).json({ error: 'workspace or file not found' })
    return
  }

  const targetPath = ensureInsideWorkspace(path.join(workspace.path, relativePath), workspace.path)
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    res.status(404).json({ error: 'file not found' })
    return
  }
  try {
    res.type('text/plain').send(readPreviewBody(targetPath))
  } catch (error) {
    res.status(415).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/workspaces/:workspaceId/files/raw', (req, res) => {
  const workspace = store.snapshot.workspaces.find((item) => item.id === req.params.workspaceId)
  const relativePath = String(req.query.path ?? '')
  if (!workspace || !relativePath) {
    res.status(404).json({ error: 'workspace or file not found' })
    return
  }

  try {
    const targetPath = ensureInsideWorkspace(path.join(workspace.path, relativePath), workspace.path)
    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
      res.status(404).json({ error: 'file not found' })
      return
    }
    sendInlineFile(res, targetPath, path.basename(targetPath))
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/workspaces/:workspaceId/files/quicklook', (req, res) => {
  const workspace = store.snapshot.workspaces.find((item) => item.id === req.params.workspaceId)
  const relativePath = String(req.query.path ?? '')
  if (!workspace || !relativePath) {
    res.status(404).json({ error: 'workspace or file not found' })
    return
  }

  try {
    const targetPath = ensureInsideWorkspace(path.join(workspace.path, relativePath), workspace.path)
    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
      res.status(404).json({ error: 'file not found' })
      return
    }
    sendQuickLookPreview(res, targetPath)
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/workspaces', (req, res) => {
  const { name, path: workspacePath } = req.body as { name?: string; path?: string }
  if (!name || !workspacePath) {
    res.status(400).json({ error: 'name and path are required' })
    return
  }

  const resolved = path.resolve(workspacePath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    res.status(400).json({ error: 'workspace path must be an existing directory' })
    return
  }

  const workspace = {
    id: crypto.randomUUID(),
    name,
    path: resolved,
    createdAt: new Date().toISOString()
  }

  store.update((state) => {
    state.workspaces.push(workspace)
  })
  res.status(201).json(workspace)
})

app.patch('/api/workspaces/:workspaceId', (req, res) => {
  const { name, path: workspacePath } = req.body as { name?: string; path?: string }
  let updated = store.snapshot.workspaces.find((item) => item.id === req.params.workspaceId)
  if (!updated) {
    res.status(404).json({ error: 'workspace not found' })
    return
  }

  const nextPath = typeof workspacePath === 'string' && workspacePath.trim()
    ? path.resolve(workspacePath.trim())
    : undefined
  const nextNameFromRequest = typeof name === 'string' ? name.trim() : undefined
  const nextName = nextNameFromRequest || (nextPath ? path.basename(nextPath) : undefined)

  if (!nextName && !nextPath) {
    res.status(400).json({ error: 'name or path is required' })
    return
  }

  if (nextPath && (!fs.existsSync(nextPath) || !fs.statSync(nextPath).isDirectory())) {
    res.status(400).json({ error: 'workspace path must be an existing directory' })
    return
  }

  store.update((state) => {
    const workspace = state.workspaces.find((item) => item.id === req.params.workspaceId)
    if (!workspace) return
    if (nextName) workspace.name = nextName
    if (nextPath) workspace.path = nextPath
    updated = workspace
  })
  res.json(updated)
})

app.delete('/api/workspaces/:workspaceId', (req, res) => {
  const workspaceId = req.params.workspaceId
  if (workspaceId === 'default') {
    res.status(400).json({ error: 'default workspace cannot be removed' })
    return
  }

  const state = store.snapshot
  const workspace = state.workspaces.find((item) => item.id === workspaceId)
  if (!workspace) {
    res.status(404).json({ error: 'workspace not found' })
    return
  }

  const taskIds = state.tasks.filter((task) => task.workspaceId === workspaceId).map((task) => task.id)
  for (const taskId of taskIds) {
    stopRunningTask(taskId)
  }

  store.update((nextState) => {
    nextState.workspaces = nextState.workspaces.filter((item) => item.id !== workspaceId)
    nextState.tasks = nextState.tasks.filter((task) => task.workspaceId !== workspaceId)
    nextState.messages = nextState.messages.filter((message) => !taskIds.includes(message.taskId))
    nextState.artifacts = nextState.artifacts.filter((artifact) => artifact.workspaceId !== workspaceId)
  })

  res.json({ ok: true, removedTaskCount: taskIds.length })
})

app.get('/api/tasks', (_req, res) => {
  const state = store.snapshot
  res.json(enrichTasks(state))
})

app.get('/api/tasks/export.md', (req, res) => {
  const state = store.snapshot
  const requestedIds = String(req.query.ids ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  const selectedTasks = requestedIds.length
    ? requestedIds
        .map((id) => state.tasks.find((task) => task.id === id))
        .filter((task): task is Task => Boolean(task))
    : enrichTasks(state)

  if (!selectedTasks.length) {
    res.status(404).json({ error: 'no tasks to export' })
    return
  }

  const markdown = buildTaskBatchMarkdown(selectedTasks.map((task) => enrichTask(state, task)), state)
  const date = new Date().toISOString().slice(0, 10)
  const filename = `hermes-cowork-tasks-${date}.md`

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(markdown)
})

app.get('/api/tasks/:taskId', (req, res) => {
  const state = store.snapshot
  const task = state.tasks.find((item) => item.id === req.params.taskId)
  if (!task) {
    res.status(404).json({ error: 'task not found' })
    return
  }

  res.json(enrichTask(state, task))
})

app.get('/api/tasks/:taskId/context', async (req, res) => {
  try {
    const state = store.snapshot
    const task = state.tasks.find((item) => item.id === req.params.taskId)
    if (!task) {
      res.status(404).json({ error: 'task not found' })
      return
    }
    const workspace = state.workspaces.find((item) => item.id === task.workspaceId)
    const context = await readTaskContextSnapshot(task, workspace?.path)
    res.json(context)
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/tasks/:taskId/context/compress', async (req, res) => {
  try {
    const state = store.snapshot
    const task = state.tasks.find((item) => item.id === req.params.taskId)
    if (!task) {
      res.status(404).json({ error: 'task not found' })
      return
    }
    if (task.status === 'running') {
      res.status(409).json({ error: 'task is running' })
      return
    }
    if (!task.hermesSessionId) {
      res.status(400).json({ error: 'task has no Hermes session' })
      return
    }
    const workspace = state.workspaces.find((item) => item.id === task.workspaceId)
    if (!workspace) {
      res.status(404).json({ error: 'workspace not found' })
      return
    }

    const model = resolveRequestedModel(task.modelId, task.modelConfigKey, task.provider)
    const result = await runHermesContextCommand({
      taskId: task.id,
      cwd: workspace.path,
      mode: 'compress',
      sessionId: task.hermesSessionId,
      model: model.id === 'auto' ? undefined : model.id,
      provider: model.id === 'auto' ? undefined : model.provider
    })

    if (result.exitCode !== 0) {
      res.status(500).json({
        error: result.error || sanitizeHermesRuntimeMessage(result.stderr) || `Hermes compression exited with ${result.exitCode}`
      })
      return
    }

    const compressedEvent = result.compressed ?? result.events.find((event) => event.type === 'context.compressed')
    const context = normalizeContextSnapshot(
      result.context ?? (isPlainObject(compressedEvent?.context) ? compressedEvent.context : undefined),
      task
    )
    const newSessionId =
      (typeof compressedEvent?.sessionId === 'string' ? compressedEvent.sessionId : undefined) ??
      result.sessionId ??
      task.hermesSessionId

    store.update((mutable) => {
      const mutableTask = mutable.tasks.find((item) => item.id === task.id)
      if (!mutableTask) return
      mutableTask.hermesSessionId = newSessionId
      mutableTask.updatedAt = new Date().toISOString()
      mutableTask.events = dedupeExecutionEvents([
        ...(mutableTask.events ?? []),
        ...result.events.map(normalizeBridgeEvent)
      ])
    })
    broadcastTaskUpdate(task.id, true)

    res.json({
      ok: true,
      oldSessionId: typeof compressedEvent?.oldSessionId === 'string' ? compressedEvent.oldSessionId : task.hermesSessionId,
      newSessionId,
      removed: typeof compressedEvent?.removed === 'number' ? compressedEvent.removed : 0,
      skipped: Boolean(compressedEvent?.skipped),
      reason: typeof compressedEvent?.reason === 'string' ? compressedEvent.reason : undefined,
      context
    })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/tasks/:taskId/stream', (req, res) => {
  const taskId = req.params.taskId
  const task = store.snapshot.tasks.find((item) => item.id === taskId)
  if (!task) {
    res.status(404).json({ error: 'task not found' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  addTaskStreamClient(taskId, res)
  sendTaskStreamSnapshot(taskId, res)
  const heartbeat = setInterval(() => {
    writeSse(res, 'heartbeat', { taskId, updatedAt: new Date().toISOString() })
  }, 15000)

  req.on('close', () => {
    clearInterval(heartbeat)
    removeTaskStreamClient(taskId, res)
  })
})

app.get('/api/tasks/:taskId/export.md', (req, res) => {
  const state = store.snapshot
  const task = state.tasks.find((item) => item.id === req.params.taskId)
  if (!task) {
    res.status(404).json({ error: 'task not found' })
    return
  }

  const workspace = state.workspaces.find((item) => item.id === task.workspaceId)
  const enriched = enrichTask(state, task)
  const markdown = buildTaskMarkdown(enriched, workspace?.name ?? task.workspaceId)
  const filename = `${sanitizeFilename(task.title || task.id)}-${task.id.slice(0, 8)}.md`
  const asciiFilename = asciiFallbackFilename(filename)

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  )
  res.send(markdown)
})

app.post('/api/tasks', (req, res) => {
  const { prompt, workspaceId, modelId, skillNames, attachments } = req.body as {
    prompt?: string
    workspaceId?: string
    modelId?: string
    skillNames?: unknown
    attachments?: unknown
  }
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' })
    return
  }

  const state = store.snapshot
  const workspace = state.workspaces.find((item) => item.id === workspaceId)
  if (!workspace) {
    res.status(404).json({ error: 'workspace not found' })
    return
  }

  const now = new Date().toISOString()
  const normalizedAttachments = normalizeTaskAttachments(attachments, workspace, now)
  const userPrompt = prompt?.trim() || (normalizedAttachments.length ? '请查看这些附件。' : '')
  if (!userPrompt) {
    res.status(400).json({ error: 'prompt or attachments are required' })
    return
  }
  const model = resolveRequestedModel(modelId)
  const modelConfigKey = modelSessionKey(model)
  const normalizedSkillNames = normalizeSkillNames(skillNames)
  const task: Task = {
    id: crypto.randomUUID(),
    workspaceId,
    modelId: model.id,
    provider: model.provider,
    modelConfigKey,
    skillNames: normalizedSkillNames,
    title: userPrompt.slice(0, 42),
    status: 'running',
    prompt: userPrompt,
    createdAt: now,
    updatedAt: now,
    startedAt: now
  }

  store.update((mutable) => {
    mutable.tasks.unshift(task)
    mutable.messages.push({
      id: crypto.randomUUID(),
      taskId: task.id,
      role: 'user',
      content: userPrompt,
      createdAt: now,
      attachments: normalizedAttachments
    })
  })

  void executeTask(task.id, workspace.path, promptWithAttachments(userPrompt, normalizedAttachments), undefined, model, normalizedSkillNames)
  const createdState = store.snapshot
  const createdTask = createdState.tasks.find((item) => item.id === task.id)
  res.status(201).json(createdTask ? enrichTask(createdState, createdTask) : task)
})

app.post('/api/tasks/:taskId/messages', (req, res) => {
  const { prompt, modelId, skillNames, attachments } = req.body as { prompt?: string; modelId?: string; skillNames?: unknown; attachments?: unknown }

  const state = store.snapshot
  const task = state.tasks.find((item) => item.id === req.params.taskId)
  if (!task) {
    res.status(404).json({ error: 'task not found' })
    return
  }
  if (task.status === 'running') {
    res.status(409).json({ error: 'task is already running' })
    return
  }

  const workspace = state.workspaces.find((item) => item.id === task.workspaceId)
  if (!workspace) {
    res.status(404).json({ error: 'workspace not found' })
    return
  }

  const now = new Date().toISOString()
  const normalizedAttachments = normalizeTaskAttachments(attachments, workspace, now)
  const userPrompt = prompt?.trim() || (normalizedAttachments.length ? '请查看这些附件。' : '')
  if (!userPrompt) {
    res.status(400).json({ error: 'prompt or attachments are required' })
    return
  }
  const requestedModelId = typeof modelId === 'string' && modelId.trim() ? modelId.trim() : undefined
  const model = resolveRequestedModel(
    requestedModelId || task.modelId,
    requestedModelId ? undefined : task.modelConfigKey,
    requestedModelId ? undefined : task.provider
  )
  const modelConfigKey = modelSessionKey(model)
  const resumeSessionId = shouldResumeHermesSession(task, model, modelConfigKey) ? task.hermesSessionId : undefined
  const normalizedSkillNames = normalizeSkillNames(skillNames, task.skillNames ?? [])
  store.update((mutable) => {
    const mutableTask = mutable.tasks.find((item) => item.id === task.id)
    if (!mutableTask) return
    mutableTask.status = 'running'
    mutableTask.modelId = model.id
    mutableTask.provider = model.provider
    mutableTask.modelConfigKey = modelConfigKey
    mutableTask.skillNames = normalizedSkillNames
    mutableTask.error = undefined
    mutableTask.stdout = undefined
    mutableTask.stderr = undefined
    mutableTask.startedAt = now
    mutableTask.completedAt = undefined
    mutableTask.updatedAt = now
    mutable.messages.push({
      id: crypto.randomUUID(),
      taskId: task.id,
      role: 'user',
      content: userPrompt,
      createdAt: now,
      attachments: normalizedAttachments
    })
  })
  broadcastTaskUpdate(task.id, true)

  void executeTask(task.id, workspace.path, promptWithAttachments(userPrompt, normalizedAttachments), resumeSessionId, model, normalizedSkillNames)
  const updatedState = store.snapshot
  const updatedTask = updatedState.tasks.find((item) => item.id === task.id)
  if (!updatedTask) {
    res.status(404).json({ error: 'task disappeared' })
    return
  }
  res.status(202).json({ ok: true, task: enrichTask(updatedState, updatedTask) })
})

app.post('/api/tasks/:taskId/stop', (req, res) => {
  const taskId = req.params.taskId
  const stopped = stopRunningTask(taskId)
  const stoppedAt = new Date().toISOString()

  store.update((state) => {
    const task = state.tasks.find((item) => item.id === taskId)
    if (task && task.status === 'running') {
      task.status = 'stopped'
      task.updatedAt = stoppedAt
      task.completedAt = stoppedAt
      task.events = [
        ...(task.events ?? []),
        enrichExecutionEvent({
          id: crypto.randomUUID(),
          type: 'task.stopped',
          createdAt: stoppedAt,
          reason: stopped ? 'user_requested' : 'not_running',
          summary: '用户已停止当前 Hermes 任务'
        })
      ]
      state.messages.push({
        id: crypto.randomUUID(),
        taskId,
        role: 'assistant',
        content: '任务已停止。Hermes Cowork 已向当前进程发送停止信号，后续不会继续写入这个任务。',
        createdAt: stoppedAt
      })
    }
  })
  broadcastTaskUpdate(taskId, true)
  res.json({ ok: true })
})

app.post('/api/tasks/:taskId/approval', async (req, res) => {
  const taskId = req.params.taskId
  const choice = String((req.body as { choice?: unknown }).choice ?? '').trim()
  if (!approvalChoices.has(choice)) {
    res.status(400).json({ error: 'approval choice must be one of once, session, always, deny' })
    return
  }

  const task = store.snapshot.tasks.find((item) => item.id === taskId)
  if (!task) {
    res.status(404).json({ error: 'task not found' })
    return
  }
  if (task.status !== 'running') {
    res.status(409).json({ error: 'task is not running' })
    return
  }

  const handle = runningTasks.get(taskId)
  if (!handle?.approve) {
    res.status(409).json({ error: '当前 Hermes runtime 不支持 Cowork 内审批，请重新运行普通任务或切换到 gateway runtime。' })
    return
  }

  try {
    await handle.approve(choice as 'once' | 'session' | 'always' | 'deny')
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/tasks/:taskId/clarify', async (req, res) => {
  const taskId = req.params.taskId
  const answer = String((req.body as { answer?: unknown }).answer ?? '').trim()
  if (!answer) {
    res.status(400).json({ error: 'clarify answer is required' })
    return
  }
  if (answer.length > 4000) {
    res.status(400).json({ error: 'clarify answer must be 4000 characters or fewer' })
    return
  }

  const task = store.snapshot.tasks.find((item) => item.id === taskId)
  if (!task) {
    res.status(404).json({ error: 'task not found' })
    return
  }
  if (task.status !== 'running') {
    res.status(409).json({ error: 'task is not running' })
    return
  }

  const handle = runningTasks.get(taskId)
  if (!handle?.clarify) {
    res.status(409).json({ error: '当前 Hermes runtime 不支持 Cowork 内澄清反问，请重新运行普通任务或切换到 gateway runtime。' })
    return
  }

  try {
    await handle.clarify(answer)
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/tasks/:taskId/pin', (req, res) => {
  const { pinned } = req.body as { pinned?: boolean }
  let updated: Task | undefined

  store.update((state) => {
    const task = state.tasks.find((item) => item.id === req.params.taskId)
    if (!task) return
    task.pinned = Boolean(pinned)
    task.updatedAt = new Date().toISOString()
    updated = task
  })

  if (!updated) {
    res.status(404).json({ error: 'task not found' })
    return
  }
  res.json({ ok: true, task: updated })
})

app.post('/api/tasks/:taskId/archive', (req, res) => {
  const { archived } = req.body as { archived?: boolean }
  let updated: Task | undefined

  store.update((state) => {
    const task = state.tasks.find((item) => item.id === req.params.taskId)
    if (!task) return
    task.archivedAt = archived ? new Date().toISOString() : undefined
    task.updatedAt = new Date().toISOString()
    updated = task
  })

  if (!updated) {
    res.status(404).json({ error: 'task not found' })
    return
  }
  res.json({ ok: true, task: updated })
})

app.post('/api/tasks/:taskId/tags', (req, res) => {
  const { tags } = req.body as { tags?: unknown }
  if (!Array.isArray(tags)) {
    res.status(400).json({ error: 'tags must be an array' })
    return
  }

  const normalizedTags = normalizeTags(tags)
  let updated: Task | undefined

  store.update((state) => {
    const task = state.tasks.find((item) => item.id === req.params.taskId)
    if (!task) return
    task.tags = normalizedTags
    task.updatedAt = new Date().toISOString()
    updated = task
  })

  if (!updated) {
    res.status(404).json({ error: 'task not found' })
    return
  }
  res.json({ ok: true, task: updated })
})

app.delete('/api/tasks/:taskId', (req, res) => {
  const taskId = req.params.taskId
  stopRunningTask(taskId)

  store.update((state) => {
    state.tasks = state.tasks.filter((task) => task.id !== taskId)
    state.messages = state.messages.filter((message) => message.taskId !== taskId)
    state.artifacts = state.artifacts.filter((artifact) => artifact.taskId !== taskId)
  })

  res.json({ ok: true })
})

app.post('/api/workspaces/:workspaceId/files', upload.single('file'), (req, res) => {
  const workspace = store.snapshot.workspaces.find((item) => item.id === req.params.workspaceId)
  if (!workspace || !req.file) {
    res.status(404).json({ error: 'workspace or file not found' })
    return
  }

  try {
    const targetPath = uniqueUploadTargetPath(workspace.path, req.file.originalname)
    fs.copyFileSync(req.file.path, targetPath)
    fs.unlinkSync(req.file.path)
    res.status(201).json(workspaceFileFromPath(targetPath, workspace.path))
  } catch (error) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/artifacts/:artifactId/download', (req, res) => {
  const artifact = store.snapshot.artifacts.find((item) => item.id === req.params.artifactId)
  if (!artifact || !fs.existsSync(artifact.path)) {
    res.status(404).json({ error: 'artifact not found' })
    return
  }
  res.download(artifact.path, artifact.name)
})

app.get('/api/artifacts/:artifactId/raw', (req, res) => {
  const artifact = store.snapshot.artifacts.find((item) => item.id === req.params.artifactId)
  if (!artifact || !fs.existsSync(artifact.path)) {
    res.status(404).json({ error: 'artifact not found' })
    return
  }
  sendInlineFile(res, artifact.path, artifact.name)
})

app.get('/api/artifacts/:artifactId/quicklook', (req, res) => {
  const artifact = store.snapshot.artifacts.find((item) => item.id === req.params.artifactId)
  if (!artifact || !fs.existsSync(artifact.path)) {
    res.status(404).json({ error: 'artifact not found' })
    return
  }
  sendQuickLookPreview(res, artifact.path)
})

app.post('/api/workspaces/:workspaceId/reveal', (req, res) => {
  const workspace = store.snapshot.workspaces.find((item) => item.id === req.params.workspaceId)
  if (!workspace || !fs.existsSync(workspace.path)) {
    res.status(404).json({ error: 'workspace not found' })
    return
  }
  revealPath(workspace.path)
  res.json({ ok: true })
})

app.post('/api/workspaces/:workspaceId/files/reveal', (req, res) => {
  const workspace = store.snapshot.workspaces.find((item) => item.id === req.params.workspaceId)
  const { path: relativePath } = req.body as { path?: string }
  if (!workspace || !relativePath) {
    res.status(404).json({ error: 'workspace or file not found' })
    return
  }
  const targetPath = ensureInsideWorkspace(path.join(workspace.path, relativePath), workspace.path)
  if (!fs.existsSync(targetPath)) {
    res.status(404).json({ error: 'file not found' })
    return
  }
  revealPath(targetPath)
  res.json({ ok: true })
})

app.post('/api/workspaces/:workspaceId/files/open', (req, res) => {
  const workspace = store.snapshot.workspaces.find((item) => item.id === req.params.workspaceId)
  const { path: relativePath } = req.body as { path?: string }
  if (!workspace || !relativePath) {
    res.status(404).json({ error: 'workspace or file not found' })
    return
  }
  const targetPath = ensureInsideWorkspace(path.join(workspace.path, relativePath), workspace.path)
  if (!fs.existsSync(targetPath)) {
    res.status(404).json({ error: 'file not found' })
    return
  }
  openPath(targetPath)
  res.json({ ok: true })
})

app.post('/api/artifacts/:artifactId/reveal', (req, res) => {
  const artifact = store.snapshot.artifacts.find((item) => item.id === req.params.artifactId)
  if (!artifact || !fs.existsSync(artifact.path)) {
    res.status(404).json({ error: 'artifact not found' })
    return
  }
  revealPath(artifact.path)
  res.json({ ok: true })
})

app.post('/api/artifacts/:artifactId/open', (req, res) => {
  const artifact = store.snapshot.artifacts.find((item) => item.id === req.params.artifactId)
  if (!artifact || !fs.existsSync(artifact.path)) {
    res.status(404).json({ error: 'artifact not found' })
    return
  }
  openPath(artifact.path)
  res.json({ ok: true })
})

app.get('/api/artifacts/:artifactId/preview', (req, res) => {
  const artifact = store.snapshot.artifacts.find((item) => item.id === req.params.artifactId)
  if (!artifact || !fs.existsSync(artifact.path)) {
    res.status(404).json({ error: 'artifact not found' })
    return
  }

  try {
    res.type('text/plain').send(readPreviewBody(artifact.path))
  } catch (error) {
    res.status(415).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

async function executeTask(
  taskId: string,
  workspacePath: string,
  prompt: string,
  resumeSessionId?: string,
  model?: ModelOption,
  skillNames: string[] = []
) {
  const before = takeSnapshot(workspacePath)
  const startedAt = new Date().toISOString()

  try {
    const result = await runHermesRuntimeTask({
      taskId,
      prompt,
      cwd: workspacePath,
      resumeSessionId,
      onEvent: (event) => updateRunningEvent(taskId, event),
      onStdout: (_chunk, accumulated) => updateRunningOutput(taskId, { stdout: accumulated }),
      onStderr: (_chunk, accumulated) => updateRunningOutput(taskId, { stderr: accumulated }),
      onHandle: (handle) => runningTasks.set(taskId, handle),
      model: model?.id === 'auto' ? undefined : model?.id,
      provider: model?.id === 'auto' ? undefined : model?.provider,
      skills: skillNames,
      enabledSkills: enabledSkillNames()
    })

    runningTasks.delete(taskId)
    const completedAt = new Date().toISOString()
    const artifacts = findChangedArtifacts(
      store.snapshot.tasks.find((task) => task.id === taskId)?.workspaceId ?? 'default',
      taskId,
      workspacePath,
      before
    )
    const taskBeforeUpdate = store.snapshot.tasks.find((task) => task.id === taskId)
    const alreadyTerminalBeforeFinal =
      taskBeforeUpdate?.status === 'stopped' || taskBeforeUpdate?.status === 'failed'
    const stoppedBeforeFinal = taskBeforeUpdate?.status === 'stopped'
    const finalEvents = buildFinalExecutionEvents(
      taskBeforeUpdate?.events,
      result.events,
      result.stdout,
      alreadyTerminalBeforeFinal ? '' : result.stderr,
      alreadyTerminalBeforeFinal ? [] : artifacts,
      completedAt
    )
    const cleanedStdout = cleanBridgeStdout(result.stdout)
    const cleanedResponse = result.finalResponse || cleanHermesOutput(cleanedStdout)
    const failureMessage = result.exitCode === 0 ? '' : bridgeFailureMessage(result, finalEvents)

    if (alreadyTerminalBeforeFinal) {
      store.update((state) => {
        const task = state.tasks.find((item) => item.id === taskId)
        if (!task || (task.status !== 'stopped' && task.status !== 'failed')) return
        task.stdout = result.finalResponse || cleanedStdout || task.stdout
        task.stderr = result.stderr || task.stderr
        task.hermesSessionId = result.sessionId ?? task.hermesSessionId
        task.events = finalEvents
        task.updatedAt = task.completedAt ?? completedAt
      })
      broadcastTaskUpdate(taskId, true)
      return
    }

    store.update((state) => {
      const task = state.tasks.find((item) => item.id === taskId)
      if (!task) return
      task.status = result.exitCode === 0 ? 'completed' : 'failed'
      task.stdout = result.finalResponse || cleanedStdout
      task.stderr = result.stderr
      task.hermesSessionId = result.sessionId
      task.events = finalEvents
      task.completedAt = completedAt
      task.updatedAt = completedAt
      task.error = result.exitCode === 0 ? undefined : failureMessage || `Hermes exited with ${result.exitCode}`

      state.messages.push({
        id: crypto.randomUUID(),
        taskId,
        role: 'assistant',
        content:
          cleanedResponse ||
          (failureMessage ? `Hermes 调用失败：${failureMessage}` : '') ||
          sanitizeHermesRuntimeMessage(result.stderr) ||
          '(Hermes 没有返回内容)',
        createdAt: completedAt
      })
      state.artifacts.push(...artifacts)
    })
    broadcastTaskUpdate(taskId, true)
  } catch (error) {
    runningTasks.delete(taskId)
    const completedAt = new Date().toISOString()
    store.update((state) => {
      const task = state.tasks.find((item) => item.id === taskId)
      if (!task) return
      task.status = 'failed'
      task.error = error instanceof Error ? error.message : String(error)
      task.startedAt = startedAt
      task.completedAt = completedAt
      task.updatedAt = completedAt
      state.messages.push({
        id: crypto.randomUUID(),
        taskId,
        role: 'assistant',
        content: `Hermes 调用失败：${task.error}`,
        createdAt: completedAt
      })
    })
    broadcastTaskUpdate(taskId, true)
  }
}

function resolveRequestedModel(modelId?: string, modelConfigKey?: string, modelProvider?: string) {
  const settings = store.snapshot.modelSettings
  const models = listModelOptions(settings)
  if (modelConfigKey) {
    const exactByConfig = models.find((model) => (model.selectedModelKey ?? modelSelectionKey(model)) === modelConfigKey)
    if (exactByConfig) return exactByConfig
  }

  const requested = modelId || settings.selectedModelId
  if (!requested) return selectedModelOption(settings)

  const directBySelectionKey = models.find((model) => (model.selectedModelKey ?? modelSelectionKey(model)) === requested)
  if (directBySelectionKey) return directBySelectionKey

  const selectedWithProvider = modelProvider
    ? models.find((model) => model.id === requested && normalizeProviderId(model.provider || '') === normalizeProviderId(modelProvider))
    : undefined
  if (selectedWithProvider) return selectedWithProvider

  return models.find((model) => model.id === requested) ?? selectedModelOption(settings)
}

function shouldResumeHermesSession(task: Task, model: ModelOption, modelConfigKey: string) {
  if (!task.hermesSessionId) return false
  if (task.modelConfigKey) return task.modelConfigKey === modelConfigKey
  if (model.id === 'auto') return false
  return (task.modelId || 'auto') === model.id && (task.provider || '') === (model.provider || '')
}

function modelSessionKey(model: ModelOption) {
  if (model.id === 'auto') {
    const current = readHermesDefaultModel()
    return `auto:${current.provider || ''}:${current.model || ''}`
  }
  return `${model.provider || ''}:${model.id}`
}

function enabledSkillNames() {
  return listLocalSkills(store.snapshot.skillSettings)
    .filter((skill) => skill.enabled)
    .map((skill) => skill.name)
    .slice(0, 80)
}

function bridgeFailureMessage(
  result: { error?: string; stderr?: string; events?: HermesBridgeEvent[] },
  finalEvents: ExecutionEvent[] = []
) {
  const candidates = [
    result.error,
    ...[...(result.events ?? [])].reverse().map((event) => bridgeEventFailureText(event)),
    ...[...finalEvents].reverse().map((event) => bridgeEventFailureText(event)),
    result.stderr
  ]
  return sanitizeHermesRuntimeMessage(candidates.find((message) => message && message.trim()) ?? '')
}

function bridgeEventFailureText(event: HermesBridgeEvent | ExecutionEvent) {
  if (event.type === 'task.failed') {
    return String(event.error ?? event.summary ?? event.message ?? '')
  }
  if (event.type === 'status') {
    const text = String(event.summary ?? event.message ?? '')
    return isErrorLine(text) ? text : ''
  }
  if (event.category === 'error') {
    return String(event.summary ?? event.message ?? event.error ?? event.result ?? '')
  }
  return ''
}

function sanitizeHermesRuntimeMessage(message: string) {
  return message
    .replace(/\r/g, '')
    .replace(/(api[_ -]?key\s*[:=]\s*)['"]?[^'",}\s]+/gi, '$1****')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[A-Za-z0-9._-]+/gi, '$1****')
    .replace(/(sk-|tp-)[A-Za-z0-9._-]{8,}/g, '$1****')
    .trim()
}

function normalizeSkillNames(value: unknown, fallback: string[] = []) {
  const rawItems = Array.isArray(value) ? value : fallback
  return [...new Set(
    rawItems
      .map((item) => String(item).trim())
      .filter(Boolean)
      .map((item) => item.slice(0, 120))
  )].slice(0, 12)
}

function normalizeTaskAttachments(value: unknown, workspace: Workspace, createdAt: string): MessageAttachment[] {
  if (!Array.isArray(value)) return []
  const attachments: MessageAttachment[] = []
  const seen = new Set<string>()

  for (const item of value.slice(0, 12)) {
    const targetPath = resolveAttachmentPath(item, workspace.path)
    if (!targetPath) continue
    try {
      if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) continue
      const stat = fs.statSync(targetPath)
      const relativePath = normalizeRelativePath(path.relative(workspace.path, targetPath))
      if (!relativePath || seen.has(relativePath.toLowerCase())) continue
      seen.add(relativePath.toLowerCase())
      attachments.push({
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        name: path.basename(targetPath),
        relativePath,
        path: targetPath,
        type: path.extname(targetPath).replace('.', '') || 'file',
        size: stat.size,
        createdAt
      })
    } catch {
      // Ignore stale or invalid attachment references. The file must exist in the authorized workspace.
    }
  }

  return attachments
}

function resolveAttachmentPath(item: unknown, workspacePath: string) {
  const reference = attachmentReference(item)
  if (!reference) return null
  try {
    if (path.isAbsolute(reference)) {
      return ensureInsideWorkspace(reference, workspacePath)
    }
    const relativePath = normalizeRelativePath(reference)
    if (!relativePath) return null
    return ensureInsideWorkspace(path.join(workspacePath, relativePath), workspacePath)
  } catch {
    return null
  }
}

function attachmentReference(item: unknown) {
  if (typeof item === 'string') return item.trim()
  if (!item || typeof item !== 'object') return ''
  const record = item as Record<string, unknown>
  return String(record.relativePath ?? record.path ?? '').trim()
}

function promptWithAttachments(prompt: string, attachments: MessageAttachment[]) {
  const cleanPrompt = prompt.trim() || '请查看这些附件。'
  if (!attachments.length) return cleanPrompt
  const attachmentLines = attachments.map((attachment) =>
    `- ${attachment.name}: ${attachment.path} (工作区相对路径：${attachment.relativePath})`
  )
  return [
    cleanPrompt,
    '',
    'Hermes Cowork 已将以下附件放入当前授权工作区。请在需要时读取这些文件作为上下文：',
    ...attachmentLines
  ].join('\n')
}

function buildTaskMarkdown(task: ReturnType<typeof enrichTask>, workspaceName: string) {
  const lines = [
    `# ${task.title || 'Hermes Cowork 任务'}`,
    '',
    '## 任务信息',
    '',
    `- 状态：${task.status}`,
    `- 工作区：${workspaceName}`,
    (task.skillNames ?? []).length ? `- 预载技能：${(task.skillNames ?? []).join('、')}` : '',
    (task.tags ?? []).length ? `- 标签：${(task.tags ?? []).join('、')}` : '',
    `- 创建时间：${formatExportTime(task.createdAt)}`,
    task.startedAt ? `- 开始时间：${formatExportTime(task.startedAt)}` : '',
    task.completedAt ? `- 完成时间：${formatExportTime(task.completedAt)}` : '',
    task.hermesSessionId ? `- Hermes Session：\`${task.hermesSessionId}\`` : '',
    '',
    '## 原始需求',
    '',
    fencedMarkdown(task.prompt),
    ''
  ].filter(Boolean)

  const response = task.executionView.response || task.stdout || ''
  if (response.trim()) {
    lines.push('## 最终结果', '', response.trim(), '')
  }

  if (task.messages.length) {
    lines.push('## 对话记录', '')
    for (const message of task.messages) {
      lines.push(`### ${message.role} · ${formatExportTime(message.createdAt)}`, '', message.content.trim() || '(空)', '')
      if (message.attachments?.length) {
        lines.push('附件：', '')
        for (const attachment of message.attachments) {
          lines.push(`- ${attachment.name}：\`${attachment.relativePath}\` (${formatBytesForExport(attachment.size)})`)
        }
        lines.push('')
      }
    }
  }

  const toolEvents = (task.events ?? []).filter((event) => event.type.startsWith('tool.'))
  if (toolEvents.length) {
    lines.push('## 工具调用', '')
    for (const event of toolEvents) {
      lines.push(
        `### ${exportToolName(event)} · ${exportToolPhase(event)}`,
        '',
        `- 时间：${formatExportTime(event.createdAt)}`,
        event.isError ? '- 状态：异常' : '',
        ''
      )
      const summary = exportToolSummary(event)
      if (summary) lines.push(summary, '')
      lines.push(fencedMarkdown(safeJson(event)), '')
    }
  } else if (task.executionView.tools.length) {
    lines.push('## 工具调用', '', ...task.executionView.tools.map((item) => `- ${item}`), '')
  }

  if (task.artifacts.length) {
    lines.push('## 产物清单', '')
    for (const artifact of task.artifacts) {
      lines.push(`- ${artifact.name}：\`${artifact.relativePath}\` (${formatBytesForExport(artifact.size)})`)
    }
    lines.push('')
  }

  if (task.executionView.errors.length) {
    lines.push('## 错误信息', '', fencedMarkdown(task.executionView.errors.join('\n')), '')
  }

  lines.push('---', '', '由 Hermes Cowork 导出。')
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`
}

function buildTaskBatchMarkdown(tasks: Array<ReturnType<typeof enrichTask>>, state: AppState) {
  const lines = [
    '# Hermes Cowork 任务批量导出',
    '',
    `- 导出时间：${formatExportTime(new Date().toISOString())}`,
    `- 任务数量：${tasks.length}`,
    '',
    '## 目录',
    '',
    ...tasks.map((task, index) => `${index + 1}. ${task.title || task.id} (${task.status})`),
    ''
  ]

  for (const task of tasks) {
    const workspace = state.workspaces.find((item) => item.id === task.workspaceId)
    lines.push('---', '', buildTaskMarkdown(task, workspace?.name ?? task.workspaceId).replace(/\n---\n\n由 Hermes Cowork 导出。\n$/m, '').trim(), '')
  }

  lines.push('---', '', '由 Hermes Cowork 批量导出。')
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`
}

function fencedMarkdown(value: string) {
  const ticks = value.match(/`{3,}/g)?.sort((a, b) => b.length - a.length)[0]
  const fence = '`'.repeat(Math.max(3, (ticks?.length ?? 0) + 1))
  return `${fence}\n${value.trim()}\n${fence}`
}

function exportToolName(event: ExecutionEvent) {
  if (typeof event.name === 'string' && event.name.trim()) return event.name
  if (Array.isArray(event.args)) {
    const [, maybeName] = event.args
    if (typeof maybeName === 'string' && maybeName.trim()) return maybeName
    const [kind] = event.args
    if (typeof kind === 'string' && kind.trim()) return kind
  }
  return event.type
}

function exportToolPhase(event: ExecutionEvent) {
  if (event.type === 'tool.started') return '开始'
  if (event.type === 'tool.completed') return event.isError ? '异常' : '完成'
  if (event.type === 'tool.progress') return '进度'
  return event.type.replace('tool.', '')
}

function exportToolSummary(event: ExecutionEvent) {
  if (typeof event.message === 'string' && event.message.trim()) return event.message.trim()
  if (typeof event.text === 'string' && event.text.trim()) return event.text.trim()
  if (Array.isArray(event.args) && typeof event.args[2] === 'string' && event.args[2].trim()) {
    return event.args[2].trim()
  }
  if (typeof event.result === 'string' && event.result.trim()) return event.result.trim().slice(0, 1000)
  if (typeof event.error === 'string' && event.error.trim()) return event.error.trim()
  return ''
}

function formatExportTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatBytesForExport(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function normalizeTags(tags: unknown[]) {
  return [...new Set(
    tags
      .map((tag) => String(tag).trim())
      .filter(Boolean)
      .map((tag) => tag.slice(0, 32))
  )].slice(0, 8)
}

function sanitizeFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|#%{}$!'@+`=]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'hermes-cowork-task'
}

function asciiFallbackFilename(value: string) {
  const ascii = value
    .replace(/[^\x20-\x7E]/g, '-')
    .replace(/[\\/:*?"<>|#%{}$!'@+`=]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return ascii || 'hermes-cowork-task.md'
}

function runHermesCommand(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    execFile(hermesBin, args, { cwd: hermesAgentDir, timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}\n${stderr}`.trim()))
        return
      }
      resolve(String(stdout).trim())
    })
  })
}

function parseHermesStatus(statusText: string) {
  const sections: Record<string, Record<string, string>> = {}
  let currentSection = 'General'

  for (const rawLine of statusText.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('┌') || line.startsWith('└') || line.startsWith('│') || line.startsWith('─')) {
      continue
    }

    if (line.startsWith('◆ ')) {
      currentSection = line.slice(2).trim()
      sections[currentSection] = sections[currentSection] ?? {}
      continue
    }

    const match = line.match(/^(.+?):\s*(.+)$/)
    if (match) {
      sections[currentSection] = sections[currentSection] ?? {}
      sections[currentSection][match[1].trim()] = match[2].trim()
      continue
    }

    const providerMatch = line.match(/^(.+?)\s{2,}([✓✗].+)$/)
    if (providerMatch) {
      sections[currentSection] = sections[currentSection] ?? {}
      sections[currentSection][providerMatch[1].trim()] = providerMatch[2].trim()
    }
  }

  return sections
}

function updateRunningOutput(taskId: string, output: { stdout?: string; stderr?: string }) {
  let changed = false
  store.update((state) => {
    const task = state.tasks.find((item) => item.id === taskId)
    if (!task || task.status !== 'running') return
    if (output.stdout !== undefined) {
      const value = output.stdout.trimEnd()
      if (task.stdout !== value) {
        task.stdout = value
        changed = true
      }
    }
    if (output.stderr !== undefined) {
      const value = output.stderr.trimEnd()
      if (task.stderr !== value) {
        task.stderr = value
        changed = true
      }
    }
    if (changed) {
      task.updatedAt = new Date().toISOString()
    }
  })
  if (changed) {
    broadcastTaskUpdate(taskId)
  }
}

function recoverInterruptedRunningTasks() {
  const recoveredAt = new Date().toISOString()
  store.update((state) => {
    for (const task of state.tasks) {
      if (task.status !== 'running') continue
      const events = compactExecutionEvents(task.events ?? [])
      const pendingInputEvent = latestPendingBlockingInputEvent(events)
      const terminalMessage = pendingInputEvent
        ? pendingInputEvent.type === 'clarify.request'
          ? clarifyRequestMessage(pendingInputEvent)
          : approvalRequestMessage(pendingInputEvent)
        : 'Cowork 服务已重新启动，旧的运行进程无法继续追踪。本轮已停止，请重新运行或继续追问。'
      const terminalType = pendingInputEvent ? 'task.failed' : 'task.stopped'
      const terminalEvent = enrichExecutionEvent({
        id: crypto.randomUUID(),
        type: terminalType,
        createdAt: recoveredAt,
        error: pendingInputEvent ? terminalMessage : undefined,
        reason: pendingInputEvent?.type === 'clarify.request' ? 'clarify_required' : pendingInputEvent ? 'approval_required' : 'runtime_recovered',
        summary: terminalMessage,
        category: pendingInputEvent ? 'error' : 'result',
        synthetic: true
      })
      task.status = pendingInputEvent ? 'failed' : 'stopped'
      task.error = pendingInputEvent ? terminalMessage : undefined
      task.completedAt = recoveredAt
      task.updatedAt = recoveredAt
      task.events = compactExecutionEvents([...events, terminalEvent])
      state.messages.push({
        id: crypto.randomUUID(),
        taskId: task.id,
        role: 'assistant',
        content: terminalMessage,
        createdAt: recoveredAt
      })
    }
  })
}

function updateRunningEvent(taskId: string, bridgeEvent: HermesBridgeEvent) {
  const event = normalizeBridgeEvent(bridgeEvent)
  let changed = false
  const now = new Date().toISOString()
  const handle = runningTasks.get(taskId)
  const approvalRequiresFallbackStop = event.type === 'approval.request' && !handle?.approve
  const clarifyRequiresFallbackStop = event.type === 'clarify.request' && !handle?.clarify
  const userInputRequiresFallbackStop = approvalRequiresFallbackStop || clarifyRequiresFallbackStop
  if (userInputRequiresFallbackStop) {
    stopRunningTask(taskId)
  }

  store.update((state) => {
    const task = state.tasks.find((item) => item.id === taskId)
    if (!task || task.status !== 'running') return

    if (bridgeEvent.type === 'message.delta' && typeof bridgeEvent.text === 'string') {
      task.stdout = `${task.stdout ?? ''}${bridgeEvent.text}`
      changed = true
    }

    if (userInputRequiresFallbackStop) {
      const requestMessage = clarifyRequiresFallbackStop ? clarifyRequestMessage(event) : approvalRequestMessage(event)
      const actionLabel = clarifyRequiresFallbackStop ? '澄清反问' : '审批'
      const message = `${requestMessage} 当前运行通道不能继续${actionLabel}，本轮已停止；请重新运行普通任务以使用 gateway ${actionLabel}。`
      const failedEvent = enrichExecutionEvent({
        id: crypto.randomUUID(),
        type: 'task.failed',
        createdAt: now,
        error: message,
        summary: message,
        category: 'error'
      })
      task.status = 'failed'
      task.error = message
      task.completedAt = now
      task.events = compactExecutionEvents([...(task.events ?? []), event, failedEvent])
      task.updatedAt = now
      changed = true
      state.messages.push({
        id: crypto.randomUUID(),
        taskId,
        role: 'assistant',
        content: message,
        createdAt: now
      })
      return
    }

    if (shouldStoreExecutionEvent(event)) {
      task.events = compactExecutionEvents([...(task.events ?? []), event])
    } else {
      task.events = compactExecutionEvents(task.events ?? [])
    }
    if (bridgeEvent.type === 'task.failed' && typeof bridgeEvent.finalResponse === 'string') {
      task.stdout = bridgeEvent.finalResponse
      changed = true
    }
    if (bridgeEvent.type === 'task.completed' && typeof bridgeEvent.finalResponse === 'string') {
      task.stdout = bridgeEvent.finalResponse
      task.hermesSessionId =
        typeof bridgeEvent.sessionId === 'string' ? bridgeEvent.sessionId : task.hermesSessionId
      changed = true
    }
    if (bridgeEvent.type === 'task.failed' && typeof bridgeEvent.error === 'string') {
      task.error = sanitizeHermesRuntimeMessage(bridgeEvent.error)
      changed = true
    }
    if (changed || shouldStoreExecutionEvent(event)) {
      task.updatedAt = new Date().toISOString()
      changed = true
    }
  })
  if (changed) {
    broadcastTaskUpdate(taskId)
  }
}

function approvalRequestMessage(event: ExecutionEvent) {
  const command = String(event.command ?? '').replace(/\s+/g, ' ').trim()
  const shortCommand = command ? ` 请求命令：${sanitizeHermesRuntimeMessage(command).slice(0, 120)}` : ''
  return `Hermes 请求执行需要人工审批的命令。${shortCommand}`
}

function clarifyRequestMessage(event: ExecutionEvent) {
  const question = String(event.question ?? event.summary ?? event.message ?? '').replace(/\s+/g, ' ').trim()
  const shortQuestion = question ? ` 问题：${sanitizeHermesRuntimeMessage(question).slice(0, 160)}` : ''
  return `Hermes 需要你补充信息后才能继续。${shortQuestion}`
}

function latestPendingBlockingInputEvent(events: ExecutionEvent[]) {
  let pending: ExecutionEvent | null = null
  for (const event of events) {
    if (event.type === 'approval.request' || event.type === 'clarify.request') pending = event
    if (
      event.type === 'approval.resolved' ||
      event.type === 'clarify.resolved' ||
      event.type === 'task.completed' ||
      event.type === 'task.failed' ||
      event.type === 'task.stopped'
    ) {
      pending = null
    }
  }
  return pending
}

async function readTaskContextSnapshot(task: Task, workspacePath?: string): Promise<HermesContextSnapshot> {
  const latest = latestContextSnapshot(task)
  if (latest) return latest
  if (task.status === 'running' || !task.hermesSessionId || !workspacePath) {
    return emptyContextSnapshot(task)
  }

  const model = resolveRequestedModel(task.modelId, task.modelConfigKey, task.provider)
  const result = await runHermesContextCommand({
    taskId: task.id,
    cwd: workspacePath,
    mode: 'context',
    sessionId: task.hermesSessionId,
    model: model.id === 'auto' ? undefined : model.id,
    provider: model.id === 'auto' ? undefined : model.provider
  })

  if (result.exitCode !== 0) {
    return {
      ...emptyContextSnapshot(task),
      status: 'unknown',
      statusLabel: sanitizeHermesRuntimeMessage(result.error || result.stderr) || '暂时无法读取上下文'
    }
  }

  const context = normalizeContextSnapshot(result.context, task)
  store.update((mutable) => {
    const mutableTask = mutable.tasks.find((item) => item.id === task.id)
    if (!mutableTask) return
    mutableTask.events = dedupeExecutionEvents([
      ...(mutableTask.events ?? []),
      ...result.events.map(normalizeBridgeEvent)
    ])
    mutableTask.updatedAt = new Date().toISOString()
  })
  return context
}

function latestContextSnapshot(task: Task): HermesContextSnapshot | null {
  const event = [...(task.events ?? [])]
    .reverse()
    .find((item) => item.type === 'context.updated' || item.type === 'context.compressed')
  if (!event) return null
  const payload = event.type === 'context.compressed' && isPlainObject(event.context) ? event.context : event
  return normalizeContextSnapshot(payload, task)
}

function normalizeContextSnapshot(value: unknown, task: Task): HermesContextSnapshot {
  const payload = isPlainObject(value) ? value : {}
  const rawStatus = stringValue(payload.status, 'unknown')
  const rawSource = stringValue(payload.contextSource, 'unknown')
  const usage = isPlainObject(payload.usage) ? payload.usage : {}
  return {
    sessionId: stringValue(payload.sessionId, task.hermesSessionId),
    model: stringValue(payload.model, task.modelId === 'auto' ? 'Hermes 默认模型' : task.modelId),
    contextUsed: numberValue(payload.contextUsed),
    contextMax: numberValue(payload.contextMax),
    contextPercent: numberValue(payload.contextPercent),
    contextSource: rawSource === 'api' || rawSource === 'estimated' ? rawSource : 'unknown',
    thresholdPercent: numberValue(payload.thresholdPercent),
    targetRatio: numberValue(payload.targetRatio),
    protectLast: numberValue(payload.protectLast),
    compressionCount: numberValue(payload.compressionCount),
    compressionEnabled: booleanValue(payload.compressionEnabled, false),
    canCompress: booleanValue(payload.canCompress, false),
    messageCount: numberValue(payload.messageCount, taskMessageCount(task.id)),
    status:
      rawStatus === 'empty' || rawStatus === 'ok' || rawStatus === 'warn' || rawStatus === 'danger'
        ? rawStatus
        : 'unknown',
    statusLabel: stringValue(payload.statusLabel, '等待 Hermes 回传') ?? '等待 Hermes 回传',
    usage: {
      inputTokens: numberValue(usage.inputTokens),
      outputTokens: numberValue(usage.outputTokens),
      cacheReadTokens: numberValue(usage.cacheReadTokens),
      cacheWriteTokens: numberValue(usage.cacheWriteTokens),
      reasoningTokens: numberValue(usage.reasoningTokens),
      apiCalls: numberValue(usage.apiCalls)
    },
    updatedAt: stringValue(payload.updatedAt, new Date().toISOString()) ?? new Date().toISOString()
  }
}

function emptyContextSnapshot(task: Task): HermesContextSnapshot {
  return {
    sessionId: task.hermesSessionId,
    model: task.modelId === 'auto' ? 'Hermes 默认模型' : task.modelId,
    contextUsed: 0,
    contextMax: 0,
    contextPercent: 0,
    contextSource: 'unknown',
    thresholdPercent: 0,
    targetRatio: 0,
    protectLast: 0,
    compressionCount: 0,
    compressionEnabled: false,
    canCompress: false,
    messageCount: taskMessageCount(task.id),
    status: task.hermesSessionId ? 'unknown' : 'empty',
    statusLabel: task.hermesSessionId ? '等待 Hermes 回传' : '任务完成后显示',
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      apiCalls: 0
    },
    updatedAt: new Date().toISOString()
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringValue(value: unknown, fallback?: string) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function taskMessageCount(taskId: string) {
  return store.snapshot.messages.filter((message) => message.taskId === taskId).length
}

function cleanBridgeStdout(output: string) {
  return output
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => !line.startsWith('HC_EVENT\t'))
    .join('\n')
    .trim()
}

function normalizeBridgeEvent(event: HermesBridgeEvent): ExecutionEvent {
  const normalized: ExecutionEvent = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...event,
    type: event.type
  }
  return enrichExecutionEvent(normalized)
}

function mergeEvents(existing: ExecutionEvent[] | undefined, bridgeEvents: HermesBridgeEvent[]) {
  const current = existing ?? []
  if (current.length > 0) return current
  const merged = [...current]
  for (const bridgeEvent of bridgeEvents) {
    const normalized = normalizeBridgeEvent(bridgeEvent)
    merged.push(normalized)
  }
  return merged
}

function buildFinalExecutionEvents(
  existing: ExecutionEvent[] | undefined,
  bridgeEvents: HermesBridgeEvent[],
  stdout: string,
  stderr: string,
  artifacts: Artifact[],
  completedAt: string
) {
  const events = (existing?.length ? existing : mergeEvents(existing, bridgeEvents)).map(enrichExecutionEvent)
  const synthetic = [
    ...inferEventsFromOutput(stdout, 'stdout'),
    ...inferEventsFromOutput(stderr, 'stderr'),
    ...artifacts.map((artifact) => artifactEvent(artifact, completedAt))
  ]
  return dedupeExecutionEvents([...events, ...synthetic.map(enrichExecutionEvent)])
}

function enrichExecutionEvent(event: ExecutionEvent): ExecutionEvent {
  if (event.type.startsWith('tool.')) {
    const name = event.name ?? inferredToolName(event)
    const primary = eventPrimaryText(event)
    return {
      ...event,
      name,
      category: inferEventCategory(String(name), primary, event),
      summary: primary || toolEventDefaultSummary(event)
    }
  }

  if (event.type === 'artifact.created') {
    return {
      ...event,
      category: 'file',
      summary: event.summary ?? `${event.name ?? '文件'} 已加入任务产物`
    }
  }

  if (event.type === 'task.failed') {
    return {
      ...event,
      category: 'error',
      summary: eventPrimaryText(event) || 'Hermes 执行失败'
    }
  }

  if (event.type === 'task.completed') {
    return {
      ...event,
      category: 'result',
      summary: 'Hermes 已返回最终结果'
    }
  }

  if (event.type === 'task.stopped') {
    return {
      ...event,
      category: 'result',
      summary: eventPrimaryText(event) || '用户已停止当前 Hermes 任务'
    }
  }

  if (event.type === 'approval.request') {
    return {
      ...event,
      category: 'approval',
      summary: eventPrimaryText(event) || 'Hermes 请求人工确认命令'
    }
  }

  if (event.type === 'approval.resolved') {
    return {
      ...event,
      category: 'approval',
      summary: eventPrimaryText(event) || '命令审批已处理'
    }
  }

  if (event.type === 'clarify.request') {
    return {
      ...event,
      category: 'approval',
      summary: eventPrimaryText(event) || 'Hermes 需要你补充信息'
    }
  }

  if (event.type === 'clarify.resolved') {
    return {
      ...event,
      category: 'approval',
      summary: eventPrimaryText(event) || '澄清问题已回复'
    }
  }

  if (event.type === 'thinking' || event.type === 'step') {
    return {
      ...event,
      category: 'thinking',
      summary: eventPrimaryText(event) || event.type
    }
  }

  return {
    ...event,
    summary: event.summary ?? eventPrimaryText(event)
  }
}

function inferEventsFromOutput(output: string, stream: 'stdout' | 'stderr') {
  const events: ExecutionEvent[] = []
  const lines = splitUsefulLines(cleanBridgeStdout(output))
  const seen = new Set<string>()

  for (const line of lines) {
    if (isDecorativeLine(line) || /^session_id:/i.test(line)) continue
    const event = inferEventFromLine(line, stream)
    if (!event) continue
    const key = `${event.type}:${event.name ?? ''}:${event.summary ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    events.push(event)
  }

  return events.slice(-40)
}

function inferEventFromLine(line: string, stream: 'stdout' | 'stderr'): ExecutionEvent | null {
  const lower = line.toLowerCase()
  const pathMatch = line.match(/(?:\/Users\/[^\s"'<>，。；：、]+|\.{0,2}\/[^\s"'<>，。；：、]+|[\w.-]+\/[\w./-]+\.[A-Za-z0-9]+)/)
  const urlMatch = line.match(/https?:\/\/[^\s"'<>）)]+/)
  const now = new Date().toISOString()

  if (isErrorLine(line) || stream === 'stderr') {
    return {
      id: crypto.randomUUID(),
      type: 'tool.completed',
      createdAt: now,
      name: '运行异常',
      result: line,
      summary: line,
      category: 'error',
      synthetic: true,
      isError: true
    }
  }

  if (urlMatch || /(search|browser|web|crawl|fetch|http|联网|搜索|网页|浏览器|访问|打开链接)/i.test(line)) {
    return {
      id: crypto.randomUUID(),
      type: 'tool.completed',
      createdAt: now,
      name: urlMatch ? '网页读取' : '网页调研',
      result: line,
      summary: urlMatch ? `读取或引用网页：${urlMatch[0]}` : line,
      category: 'search',
      synthetic: true
    }
  }

  if (pathMatch || /(read|write|save|create|generated|export|file|folder|读取|写入|保存|创建|生成|导出|文件|目录|工作区)/i.test(line)) {
    const writeLike = /(write|save|create|generated|export|写入|保存|创建|生成|导出)/i.test(line)
    return {
      id: crypto.randomUUID(),
      type: 'tool.completed',
      createdAt: now,
      name: writeLike ? '文件写入' : '文件读取',
      result: line,
      summary: pathMatch ? `${writeLike ? '处理输出文件' : '处理工作区文件'}：${pathMatch[0]}` : line,
      category: 'file',
      synthetic: true
    }
  }

  if (/(bash|shell|command|python|node|npm|npx|curl|执行|命令|脚本)/i.test(line)) {
    return {
      id: crypto.randomUUID(),
      type: 'tool.completed',
      createdAt: now,
      name: '命令执行',
      result: line,
      summary: line,
      category: 'command',
      synthetic: true
    }
  }

  if (lower.includes('mcp') || /(tool|skill|调用|工具|技能)/i.test(line)) {
    return {
      id: crypto.randomUUID(),
      type: 'tool.completed',
      createdAt: now,
      name: lower.includes('mcp') ? 'MCP 调用' : '工具调用',
      result: line,
      summary: line,
      category: 'tool',
      synthetic: true
    }
  }

  return null
}

function artifactEvent(artifact: Artifact, createdAt: string): ExecutionEvent {
  return {
    id: crypto.randomUUID(),
    type: 'artifact.created',
    createdAt,
    name: artifact.name,
    path: artifact.path,
    relativePath: artifact.relativePath,
    artifactId: artifact.id,
    size: artifact.size,
    summary: `生成产物：${artifact.relativePath}`,
    category: 'file',
    synthetic: true
  }
}

function dedupeExecutionEvents(events: ExecutionEvent[]) {
  const seen = new Set<string>()
  const deduped: ExecutionEvent[] = []
  for (const event of events.filter(shouldStoreExecutionEvent)) {
    const key = [
      event.type,
      event.toolCallId,
      event.name,
      event.category,
      event.summary,
      typeof event.result === 'string' ? event.result.slice(0, 120) : ''
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(event)
  }
  return deduped.slice(-maxStoredExecutionEvents)
}

function compactExecutionEvents(events: ExecutionEvent[]) {
  return dedupeExecutionEvents(events)
}

function shouldStoreExecutionEvent(event: ExecutionEvent) {
  if (event.type === 'message.delta' || event.type === 'message.complete') return false
  if (event.type === 'reasoning.delta' || event.type === 'thinking.delta') return false
  if (event.type === 'tool.generating') return false
  if (event.ephemeral && event.type !== 'status') return false
  if (event.type === 'tool.progress' && isInternalProgressEvent(event)) return false
  if (event.type === 'status' && isEphemeralStatusEvent(event)) return false
  if (event.type === 'thinking' && !isDisplayableThinkingText(eventPrimaryText(event))) return false
  return true
}

function isEphemeralStatusEvent(event: ExecutionEvent) {
  const text = eventPrimaryText(event)
  if (String(event.kind ?? '').toLowerCase() === 'reasoning') return true
  return /^(Hermes 正在思考|Hermes 正在处理|thinking|reasoning)$/i.test(text.trim())
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

function inferredToolName(event: ExecutionEvent) {
  if (Array.isArray(event.args)) {
    const maybeName = event.args.find((item) => typeof item === 'string' && item.trim())
    if (maybeName) return maybeName
  }
  return event.type
}

function eventPrimaryText(event: ExecutionEvent) {
  if (typeof event.summary === 'string' && event.summary.trim()) return sanitizeHermesRuntimeMessage(event.summary.trim())
  if (typeof event.message === 'string' && event.message.trim()) return sanitizeHermesRuntimeMessage(event.message.trim())
  if (typeof event.text === 'string' && event.text.trim()) return sanitizeHermesRuntimeMessage(event.text.trim())
  if (typeof event.result === 'string' && event.result.trim()) return sanitizeHermesRuntimeMessage(event.result.trim().slice(0, 1000))
  if (typeof event.error === 'string' && event.error.trim()) return sanitizeHermesRuntimeMessage(event.error.trim())
  if (Array.isArray(event.args) && typeof event.args[2] === 'string' && event.args[2].trim()) return sanitizeHermesRuntimeMessage(event.args[2].trim())
  return ''
}

function toolEventDefaultSummary(event: ExecutionEvent) {
  if (event.type === 'tool.started') return '工具开始执行'
  if (event.type === 'tool.completed') return event.isError ? '工具返回错误' : '工具执行完成'
  if (event.type === 'tool.progress') return '工具运行中'
  return event.type
}

function inferEventCategory(name: string, text: string, event: ExecutionEvent) {
  const haystack = `${name} ${text} ${safeJson(event.args)} ${safeJson(event.kwargs)}`.toLowerCase()
  if (event.isError || isErrorLine(haystack)) return 'error'
  if (/(search|browser|web|url|http|crawl|fetch|联网|搜索|网页|浏览器)/i.test(haystack)) return 'search'
  if (/(file|folder|path|workspace|read|write|save|create|export|\.md|\.csv|\.xlsx|\.pdf|文件|目录|读取|写入|保存|生成|导出)/i.test(haystack)) return 'file'
  if (/(bash|shell|command|python|node|npm|npx|curl|命令|脚本)/i.test(haystack)) return 'command'
  if (/mcp/i.test(haystack)) return 'mcp'
  return 'tool'
}

function enrichTasks(state: AppState) {
  return state.tasks
    .slice()
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
      return b.createdAt.localeCompare(a.createdAt)
    })
    .map((task) => enrichTask(state, task))
}

function enrichTask(state: AppState, task: Task) {
  const executionView = buildExecutionView(task)
  return {
    ...task,
    liveResponse: task.status === 'running' ? executionView.response : undefined,
    executionView,
    messages: state.messages.filter((message) => message.taskId === task.id),
    artifacts: state.artifacts.filter((artifact) => artifact.taskId === task.id)
  }
}

function addTaskStreamClient(taskId: string, res: Response) {
  const clients = taskStreamClients.get(taskId) ?? new Set<Response>()
  clients.add(res)
  taskStreamClients.set(taskId, clients)
}

function removeTaskStreamClient(taskId: string, res: Response) {
  const clients = taskStreamClients.get(taskId)
  if (!clients) return
  clients.delete(res)
  if (!clients.size) {
    taskStreamClients.delete(taskId)

    const timer = taskStreamBroadcastTimers.get(taskId)
    if (timer) {
      clearTimeout(timer)
      taskStreamBroadcastTimers.delete(taskId)
    }
  }
}

function sendTaskStreamSnapshot(taskId: string, res: Response) {
  const state = store.snapshot
  const task = state.tasks.find((item) => item.id === taskId)
  if (!task) {
    writeSse(res, 'task.deleted', { taskId })
    return
  }
  writeSse(res, 'task', { task: enrichTask(state, task) })
}

function sendTaskStreamSnapshotToClients(taskId: string) {
  const clients = taskStreamClients.get(taskId)
  if (!clients?.size) return

  for (const res of [...clients]) {
    if (res.destroyed) {
      removeTaskStreamClient(taskId, res)
      continue
    }
    sendTaskStreamSnapshot(taskId, res)
  }
}

function broadcastTaskUpdate(taskId: string, force = false) {
  const clients = taskStreamClients.get(taskId)
  if (!clients?.size) {
    const timer = taskStreamBroadcastTimers.get(taskId)
    if (timer) {
      clearTimeout(timer)
      taskStreamBroadcastTimers.delete(taskId)
    }
    return
  }

  if (force) {
    const timer = taskStreamBroadcastTimers.get(taskId)
    if (timer) {
      clearTimeout(timer)
      taskStreamBroadcastTimers.delete(taskId)
    }
    sendTaskStreamSnapshotToClients(taskId)
    return
  }

  if (taskStreamBroadcastTimers.has(taskId)) return

  taskStreamBroadcastTimers.set(
    taskId,
    setTimeout(() => {
      taskStreamBroadcastTimers.delete(taskId)
      sendTaskStreamSnapshotToClients(taskId)
    }, TASK_STREAM_BROADCAST_MS)
  )
}

function writeSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function buildExecutionView(task: Task): ExecutionView {
  const stdout = cleanBridgeStdout(task.stdout ?? '')
  const stderr = task.stderr ?? ''
  const response = cleanHermesOutput(stdout)
  const activity = buildExecutionActivity(task)
  const stdoutLines = splitUsefulLines(stdout)
  const stderrLines = splitUsefulLines(stderr)
  const toolLines = new Set<string>()
  const logLines = new Set<string>()
  const errorLines = new Set<string>()

  for (const event of task.events ?? []) {
    if (!shouldStoreExecutionEvent(event)) continue
    if (event.type === 'tool.started') {
      toolLines.add(`started: ${String(event.name ?? 'tool')} ${String(event.summary ?? safeJson(event.args))}`)
    }
    if (event.type === 'tool.completed') {
      const status = event.isError ? 'failed' : 'completed'
      toolLines.add(`${status}: ${String(event.name ?? 'tool')} ${String(event.summary ?? event.result ?? '').slice(0, 500)}`)
    }
    if (event.type === 'tool.progress') {
      toolLines.add(`progress: ${safeJson(event.args ?? event.kwargs)}`)
    }
    if (event.type === 'artifact.created') {
      toolLines.add(`artifact: ${String(event.relativePath ?? event.name ?? 'file')}`)
    }
    if (
      event.type === 'status' ||
      event.type === 'thinking' ||
      event.type === 'step' ||
      event.type === 'bridge.started' ||
      event.type === 'task.stopped'
    ) {
      logLines.add(`${event.type}: ${String(event.summary ?? event.message ?? event.kind ?? safeJson(event))}`)
    }
    if (event.type === 'task.failed') {
      errorLines.add(sanitizeHermesRuntimeMessage(String(event.error ?? safeJson(event))))
    }
  }

  for (const line of [...stdoutLines, ...stderrLines]) {
    if (isDecorativeLine(line) || /^session_id:/i.test(line)) continue
    if (isErrorLine(line)) {
      errorLines.add(sanitizeHermesRuntimeMessage(line))
      continue
    }
    if (isToolLine(line)) {
      toolLines.add(line)
      continue
    }
    if (stderrLines.includes(line)) {
      logLines.add(line)
    }
  }

  if (task.error) errorLines.add(sanitizeHermesRuntimeMessage(task.error))

  return {
    response,
    activity,
    tools: [...toolLines],
    logs: [...logLines],
    errors: [...errorLines],
    rawOutput: stdout.trim(),
    rawLog: stderr.trim()
  }
}

function buildExecutionActivity(task: Task): ExecutionActivity[] {
  const events = taskRunEvents(task)
    .filter(shouldStoreExecutionEvent)
    .filter((event) =>
      ['bridge.started', 'step', 'thinking', 'status', 'tool.started', 'tool.completed', 'tool.progress', 'artifact.created', 'clarify.request', 'clarify.resolved', 'approval.request', 'approval.resolved', 'task.completed', 'task.stopped', 'task.failed'].includes(
        event.type
      )
    )
    .map(eventToActivity)
    .filter((event): event is ExecutionActivity => Boolean(event))

  if (task.status === 'completed' && !events.some((event) => event.kind === 'done')) {
    events.push({
      id: `${task.id}-completed`,
      kind: 'done',
      title: '任务完成',
      detail: 'Hermes 已返回最终结果',
      createdAt: task.completedAt ?? task.updatedAt,
      source: 'synthetic'
    })
  }

  if (task.status === 'stopped' && !events.some((event) => event.kind === 'stopped')) {
    events.push({
      id: `${task.id}-stopped`,
      kind: 'stopped',
      title: '任务已停止',
      detail: '用户已停止这次执行',
      createdAt: task.completedAt ?? task.updatedAt,
      source: 'synthetic'
    })
  }

  if (task.status === 'failed' && !events.some((event) => event.kind === 'error')) {
    events.push({
      id: `${task.id}-failed`,
      kind: 'error',
      title: '任务失败',
      detail: sanitizeHermesRuntimeMessage(task.error || 'Hermes 返回失败状态'),
      createdAt: task.completedAt ?? task.updatedAt,
      source: 'synthetic'
    })
  }

  if (task.status === 'running' && !events.some((event) => event.kind === 'done' || event.kind === 'error')) {
    events.push({
      id: `${task.id}-running`,
      kind: 'status',
      title: '持续运行中',
      detail: 'Hermes 正在执行任务，新的思考和操作会继续出现在这里。',
      createdAt: task.updatedAt,
      source: 'synthetic'
    })
  }

  return events.slice(-24)
}

function taskRunEvents(task: Task) {
  const runStartedAt = new Date(task.startedAt ?? task.createdAt).getTime()
  if (!Number.isFinite(runStartedAt)) return task.events ?? []

  let events = (task.events ?? []).filter((event) => {
    const eventTime = new Date(event.createdAt).getTime()
    return !Number.isFinite(eventTime) || eventTime >= runStartedAt - 1000
  })

  if (task.status === 'completed') {
    events = events.filter((event) => event.category !== 'error')
  }

  if (task.status === 'completed' || task.status === 'failed' || task.status === 'stopped') {
    const terminalIndex = events.findIndex((event) => ['task.completed', 'task.failed', 'task.stopped'].includes(event.type))
    if (terminalIndex >= 0) return events.slice(0, terminalIndex + 1)
  }

  return events
}

function eventToActivity(event: ExecutionEvent): ExecutionActivity | null {
  if (event.type === 'thinking') {
    if (!isDisplayableThinkingText(eventPrimaryText(event))) return null
    return {
      id: event.id,
      kind: 'thinking',
      title: '思考',
      detail: normalizeThinkingDetail(eventPrimaryText(event)),
      createdAt: event.createdAt,
      source: event.synthetic ? 'synthetic' : 'hermes'
    }
  }
  if (event.type === 'step') {
    return {
      id: event.id,
      kind: 'thinking',
      title: `第 ${event.iteration ?? '?'} 轮推理`,
      detail: `${Array.isArray(event.previousTools) ? event.previousTools.length : 0} 个上一轮工具结果`,
      createdAt: event.createdAt,
      source: event.synthetic ? 'synthetic' : 'hermes'
    }
  }
  if (event.type.startsWith('tool.')) {
    if (isInternalProgressEvent(event)) return null
    if (isTodoToolEvent(event)) {
      return {
        id: event.id,
        kind: 'thinking',
        title: '执行清单更新',
        detail: todoActivityDetail(event),
        createdAt: event.createdAt,
        source: event.synthetic ? 'synthetic' : 'hermes'
      }
    }
    const name = humanToolName(String(event.name ?? inferredToolName(event)))
    return {
      id: event.id,
      kind: activityToolKind(event),
      title: `${activityToolPhase(event)}：${name}`,
      detail: activityToolDetail(event),
      createdAt: event.createdAt,
      source: event.synthetic ? 'synthetic' : 'hermes'
    }
  }
  if (event.type === 'artifact.created') {
    return {
      id: event.id,
      kind: 'file',
      title: `生成产物：${String(event.name ?? '文件')}`,
      detail: eventPrimaryText(event) || String(event.relativePath ?? '文件已加入产物区'),
      createdAt: event.createdAt,
      source: event.synthetic ? 'synthetic' : 'hermes'
    }
  }
  if (event.type === 'task.completed') {
    return {
      id: event.id,
      kind: 'done',
      title: '任务完成',
      detail: 'Hermes 已返回最终结果',
      createdAt: event.createdAt,
      source: event.synthetic ? 'synthetic' : 'hermes'
    }
  }
  if (event.type === 'task.stopped') {
    return {
      id: event.id,
      kind: 'stopped',
      title: '任务已停止',
      detail: eventPrimaryText(event) || '用户已停止当前 Hermes 任务',
      createdAt: event.createdAt,
      source: event.synthetic ? 'synthetic' : 'hermes'
    }
  }
  if (event.type === 'task.failed') {
    return {
      id: event.id,
      kind: 'error',
      title: '任务失败',
      detail: eventPrimaryText(event) || 'Hermes 执行失败',
      createdAt: event.createdAt,
      source: event.synthetic ? 'synthetic' : 'hermes'
    }
  }
  if (event.type === 'approval.request') {
    return {
      id: event.id,
      kind: 'status',
      title: '需要人工确认',
      detail: approvalRequestMessage(event),
      createdAt: event.createdAt,
      source: event.synthetic ? 'synthetic' : 'hermes'
    }
  }
  if (event.type === 'clarify.request') {
    return {
      id: event.id,
      kind: 'status',
      title: '需要补充信息',
      detail: clarifyRequestMessage(event),
      createdAt: event.createdAt,
      source: event.synthetic ? 'synthetic' : 'hermes'
    }
  }
  if (event.type === 'clarify.resolved') {
    return {
      id: event.id,
      kind: 'status',
      title: '已回复澄清',
      detail: eventPrimaryText(event) || 'Hermes 将继续执行',
      createdAt: event.createdAt,
      source: event.synthetic ? 'synthetic' : 'hermes'
    }
  }
  if (event.type === 'approval.resolved') {
    return {
      id: event.id,
      kind: event.choice === 'deny' ? 'stopped' : 'status',
      title: event.choice === 'deny' ? '已拒绝命令' : '已确认命令',
      detail: eventPrimaryText(event) || '命令审批已处理',
      createdAt: event.createdAt,
      source: event.synthetic ? 'synthetic' : 'hermes'
    }
  }
  return {
    id: event.id,
    kind: 'status',
    title: activityStatusTitle(event),
    detail: event.type === 'bridge.started' ? String(event.cwd ?? '授权工作区') : eventPrimaryText(event),
    createdAt: event.createdAt,
    source: event.synthetic ? 'synthetic' : 'hermes'
  }
}

function activityStatusTitle(event: ExecutionEvent) {
  if (event.type === 'bridge.started') return '已连接 Hermes'
  const kind = String(event.kind ?? '').toLowerCase()
  if (kind === 'submitted') return '任务已提交'
  if (kind === 'idle-wait') return '等待后端进展'
  if (kind === 'reasoning') return 'Hermes 正在思考'
  return '状态更新'
}

function normalizeThinkingDetail(value: string) {
  const text = value.trim()
  if (!text) return 'Hermes 正在思考'
  if (/^(thinking|reasoning|computing|analyzing|deliberating|reflecting)(\.\.\.)?$/i.test(text)) return 'Hermes 正在思考'
  if (/(thinking|reasoning|computing|analyzing|deliberating|reflecting)\.\.\./i.test(text)) return 'Hermes 正在思考'
  return text
}

function isInternalProgressEvent(event: ExecutionEvent) {
  const name = String(event.name ?? inferredToolName(event)).toLowerCase()
  if (name.startsWith('reasoning.')) return true
  if (Array.isArray(event.args) && String(event.args[0] ?? '').toLowerCase().startsWith('reasoning.')) return true
  return false
}

function activityToolKind(event: ExecutionEvent): ExecutionActivity['kind'] {
  if (event.category === 'search') return 'search'
  if (event.category === 'file') return 'file'
  if (event.category === 'error') return 'error'
  if (event.category === 'result') return 'done'
  const text = `${String(event.name ?? '')} ${event.type} ${eventPrimaryText(event)} ${safeJson(event.args)} ${safeJson(event.kwargs)}`.toLowerCase()
  if (event.isError) return 'error'
  if (text.includes('search') || text.includes('browser') || text.includes('web') || text.includes('url') || text.includes('http')) return 'search'
  if (text.includes('file') || text.includes('read') || text.includes('write') || text.includes('workspace') || text.includes('path')) return 'file'
  return 'tool'
}

function activityToolPhase(event: ExecutionEvent) {
  if (event.type === 'tool.started') return '开始'
  if (event.type === 'tool.completed') return event.isError ? '异常' : '完成'
  if (event.type === 'tool.progress') return '进度'
  return '工具'
}

function activityToolDetail(event: ExecutionEvent) {
  const primary = eventPrimaryText(event)
  if (primary) return primary.slice(0, 180)
  if (event.type === 'tool.started') return safeJson(event.args ?? event.kwargs ?? '工具开始执行').slice(0, 180)
  if (event.type === 'tool.completed') return event.isError ? '工具返回错误' : safeJson(event.result ?? '工具执行完成').slice(0, 180)
  return safeJson(event).slice(0, 180)
}

function isTodoToolEvent(event: ExecutionEvent) {
  return String(event.name ?? '').toLowerCase() === 'todo' && Array.isArray(event.todos)
}

function todoActivityDetail(event: ExecutionEvent) {
  const todos = Array.isArray(event.todos) ? event.todos : []
  const labels = todos
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const record = item as Record<string, unknown>
      const content = String(record.content ?? record.title ?? record.label ?? '').replace(/\s+/g, ' ').trim()
      const status = String(record.status ?? '').replace(/_/g, ' ')
      return content ? `${status ? `${status}: ` : ''}${content}` : ''
    })
    .filter(Boolean)
    .slice(0, 6)
  return labels.length ? labels.join(' / ') : eventPrimaryText(event) || 'Hermes 更新了执行清单'
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

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function splitUsefulLines(value: string) {
  return value
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function isDecorativeLine(line: string) {
  return /^[╭╰╮╯│─\s⚕Hermes]+$/.test(line)
}

function isErrorLine(line: string) {
  return /(error|failed|failure|traceback|exception|permission denied|denied|unauthorized|forbidden|错误|失败|异常|拒绝|权限不足)/i.test(
    line
  )
}

function isToolLine(line: string) {
  return /(mcp|tool|skill|command|shell|bash|python|node|npm|npx|curl|执行|调用|命令|工具|技能)/i.test(line)
}

function revealPath(targetPath: string) {
  const args = fs.statSync(targetPath).isDirectory() ? [targetPath] : ['-R', targetPath]
  const child = spawn('open', args, { stdio: 'ignore', detached: true })
  child.unref()
}

function openPath(targetPath: string) {
  const child = spawn('open', [targetPath], { stdio: 'ignore', detached: true })
  child.unref()
}

function readHermesSessions(state: AppState) {
  const sessionsDir = path.join(os.homedir(), '.hermes', 'sessions')
  const linkedTasks = new Map<string, Task[]>()
  for (const task of state.tasks) {
    if (!task.hermesSessionId) continue
    linkedTasks.set(task.hermesSessionId, [...(linkedTasks.get(task.hermesSessionId) ?? []), task])
  }

  if (!fs.existsSync(sessionsDir)) {
    return {
      sessionsDir,
      sessions: [],
      updatedAt: new Date().toISOString()
    }
  }

  const sessions = fs
    .readdirSync(sessionsDir)
    .filter((file) => /^session_.+\.json$/.test(file))
    .flatMap((file) => {
      const fullPath = path.join(sessionsDir, file)
      try {
        const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as Record<string, unknown>
        const sessionId = String(raw.session_id ?? file.replace(/^session_/, '').replace(/\.json$/, ''))
        const tasks = linkedTasks.get(sessionId) ?? []
        const stat = fs.statSync(fullPath)
        return [{
          id: sessionId,
          file,
          model: String(raw.model ?? '') || undefined,
          platform: String(raw.platform ?? '') || undefined,
          messageCount: Number(raw.message_count ?? (Array.isArray(raw.messages) ? raw.messages.length : 0)) || 0,
          startedAt: normalizeHermesDate(raw.session_start) ?? stat.birthtime.toISOString(),
          updatedAt: normalizeHermesDate(raw.last_updated) ?? stat.mtime.toISOString(),
          linkedTaskIds: tasks.map((task) => task.id),
          linkedTaskTitle: tasks[0]?.title,
          linkedWorkspaceIds: [...new Set(tasks.map((task) => task.workspaceId))]
        }]
      } catch {
        return []
      }
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 80)

  return {
    sessionsDir,
    sessions,
    updatedAt: new Date().toISOString()
  }
}

function normalizeHermesDate(value: unknown) {
  if (!value) return undefined
  const text = String(value)
  const parsed = new Date(text.endsWith('Z') || /[+-]\d\d:\d\d$/.test(text) ? text : `${text}Z`)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined
}

function normalizeRelativePath(value: string) {
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '').trim()
  if (!normalized || normalized === '.') return ''
  return normalized
}

function listWorkspaceDirectory(workspaceId: string, rootPath: string, relativePath: string, targetPath: string) {
  const ignored = new Set(['node_modules', '.git', '.venv', '__pycache__', '.DS_Store', '.gitkeep'])
  const entries = fs
    .readdirSync(targetPath, { withFileTypes: true })
    .filter((entry) => !ignored.has(entry.name) && !entry.isSymbolicLink())
    .map((entry) => {
      const fullPath = path.join(targetPath, entry.name)
      const stat = fs.statSync(fullPath)
      const entryRelativePath = path.relative(rootPath, fullPath)
      const isDirectory = entry.isDirectory()
      return {
        name: entry.name,
        relativePath: entryRelativePath,
        path: fullPath,
        kind: isDirectory ? 'directory' : 'file',
        type: isDirectory ? 'folder' : path.extname(entry.name).replace('.', '') || 'file',
        size: isDirectory ? 0 : stat.size,
        modifiedAt: stat.mtime.toISOString()
      }
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-Hans-CN')
    })

  const parts = relativePath ? relativePath.split('/').filter(Boolean) : []
  const breadcrumbs = [{ name: '根目录', path: '' }]
  for (let index = 0; index < parts.length; index += 1) {
    breadcrumbs.push({
      name: parts[index],
      path: parts.slice(0, index + 1).join('/')
    })
  }

  return {
    workspaceId,
    path: relativePath,
    parentPath: parts.length > 0 ? parts.slice(0, -1).join('/') : '',
    breadcrumbs,
    entries
  }
}

function pickDirectoryWithFinder(): Promise<{ name: string; path: string }> {
  if (process.platform !== 'darwin') {
    return Promise.reject(new Error('当前只支持在 macOS 上通过 Finder 选择工作区。'))
  }

  return new Promise((resolve, reject) => {
    execFile(
      'osascript',
      ['-e', 'POSIX path of (choose folder with prompt "选择 Hermes Cowork 工作区")'],
      { timeout: 5 * 60 * 1000 },
      (error, stdout, stderr) => {
        if (error) {
          const text = `${stderr || ''}\n${error.message || ''}`
          reject(new Error(/cancel/i.test(text) ? '已取消选择文件夹。' : `无法打开 Finder 目录选择器：${text.trim()}`))
          return
        }

        const selectedPath = stdout.trim()
        if (!selectedPath) {
          reject(new Error('没有选择文件夹。'))
          return
        }

        const resolved = path.resolve(selectedPath)
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
          reject(new Error('选择的路径不是可用文件夹。'))
          return
        }

        resolve({
          name: path.basename(resolved) || resolved,
          path: resolved
        })
      }
    )
  })
}

function listWorkspaceFiles(rootPath: string) {
  const files: Array<{
    name: string
    relativePath: string
    path: string
    type: string
    size: number
    modifiedAt: string
  }> = []
  const ignored = new Set(['node_modules', '.git', '.venv', '__pycache__'])

  walk(rootPath, '')
  return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 80)

  function walk(currentPath: string, relativeDir: string) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue
      const fullPath = path.join(currentPath, entry.name)
      const relativePath = path.join(relativeDir, entry.name)
      if (entry.isDirectory()) {
        if (relativePath.split(path.sep).length < 4) walk(fullPath, relativePath)
        continue
      }
      if (!entry.isFile()) continue
      const stat = fs.statSync(fullPath)
      files.push(workspaceFileFromPath(fullPath, rootPath, relativePath, stat))
    }
  }
}

function workspaceFileFromPath(filePath: string, rootPath: string, relativePath = path.relative(rootPath, filePath), stat = fs.statSync(filePath)) {
  return {
    name: path.basename(filePath),
    relativePath: normalizeRelativePath(relativePath),
    path: filePath,
    type: path.extname(filePath).replace('.', '') || 'file',
    size: stat.size,
    modifiedAt: stat.mtime.toISOString()
  }
}

function uniqueUploadTargetPath(rootPath: string, originalName: string) {
  const safeName = sanitizeUploadedFilename(originalName)
  const parsed = path.parse(safeName)
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : ` ${index + 1}`
    const candidateName = `${parsed.name}${suffix}${parsed.ext}`
    const candidatePath = ensureInsideWorkspace(path.join(rootPath, candidateName), rootPath)
    if (!fs.existsSync(candidatePath)) return candidatePath
  }
  throw new Error('无法生成可用的上传文件名。')
}

function sanitizeUploadedFilename(value: string) {
  const baseName = path.basename(decodeUploadedFilename(value || '')).replace(/[\r\n\t]/g, ' ').trim()
  return baseName || `upload-${Date.now()}`
}

function decodeUploadedFilename(value: string) {
  if (!/[\u0080-\u009f]/.test(value)) return value
  const decoded = Buffer.from(value, 'latin1').toString('utf8')
  return decoded.includes('\uFFFD') ? value : decoded
}

recoverInterruptedRunningTasks()

app.listen(port, '127.0.0.1', () => {
  console.log(`Hermes Cowork API listening on http://127.0.0.1:${port}`)
})

startMcpRecommendationScheduler(() => store.snapshot.tasks)
