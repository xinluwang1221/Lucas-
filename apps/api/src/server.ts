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
import { cleanHermesOutput } from './hermes.js'
import { HermesBridgeEvent, runHermesPythonBridge } from './hermes_python.js'
import { hermesAgentDir, hermesBin, hermesPythonBin } from './paths.js'
import { configureHermesMcpServer, getHermesMcpServeStatus, installHermesMcpServer, readHermesMcpConfig, readHermesMcpRecommendations, refreshHermesMcpRecommendations, refreshHermesMcpRecommendationsWithHermes, removeHermesMcpServer, searchHermesMcpMarketplace, setHermesMcpServerEnabled, setHermesMcpServerTools, startHermesMcpServe, startMcpRecommendationScheduler, stopHermesMcpServe, testHermesMcpServer, updateHermesMcpServer } from './mcp.js'
import { configureHermesModel, listModelOptions, normalizeModelId, readHermesDefaultModel, readHermesModelCatalog, readHermesModelOverview, refreshHermesModelCatalog, removeHermesModelProvider, selectedModelOption, setHermesDefaultModel, setHermesFallbackProviders } from './models.js'
import { installUploadedSkill, listLocalSkills, listSkillFiles, readSkillFile } from './skills.js'
import { ensureInsideWorkspace, store } from './store.js'
import { AppState, Artifact, ExecutionActivity, ExecutionEvent, ExecutionView, ModelOption, Task } from './types.js'

const app = express()
const port = Number(process.env.PORT || 8787)
const upload = multer({ dest: path.join(process.cwd(), 'data', 'uploads') })
const runningTasks = new Map<string, ReturnType<typeof import('node:child_process').spawn>>()
const taskStreamClients = new Map<string, Set<Response>>()

app.use(cors({ origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] }))
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'Hermes Cowork API' })
})

app.get('/api/hermes/runtime', async (_req, res) => {
  try {
    const [versionText, statusText] = await Promise.all([
      runHermesCommand(['version']),
      runHermesCommand(['status'])
    ])

    res.json({
      bridgeMode: 'python-bridge',
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
  res.json({
    selectedModelId: settings.selectedModelId,
    models: listModelOptions(settings),
    hermes: readHermesModelOverview(settings),
    catalog: readHermesModelCatalog()
  })
})

app.post('/api/models/catalog/refresh', async (_req, res) => {
  try {
    const refreshResult = await refreshHermesModelCatalog()
    const settings = store.snapshot.modelSettings
    res.json({
      selectedModelId: settings.selectedModelId,
      models: listModelOptions(settings),
      hermes: readHermesModelOverview(settings),
      catalog: refreshResult.catalog,
      catalogRefresh: {
        sources: refreshResult.sources,
        updatedAt: refreshResult.updatedAt
      }
    })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/models/select', (req, res) => {
  const { modelId } = req.body as { modelId?: string }
  const model = listModelOptions(store.snapshot.modelSettings).find((item) => item.id === modelId)
  if (!model) {
    res.status(404).json({ error: 'model not found' })
    return
  }
  if (model.source === 'catalog') {
    res.status(400).json({ error: '请先在“配置模型服务”中保存该模型，再作为本次任务模型使用。' })
    return
  }

  store.update((state) => {
    state.modelSettings.selectedModelId = model.id
  })
  res.json({ ok: true, selectedModelId: model.id })
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
    state.modelSettings.selectedModelId = model.id
  })

  res.status(201).json(model)
})

app.delete('/api/models/:modelId', (req, res) => {
  const modelId = normalizeModelId(req.params.modelId)
  if (!modelId || modelId === 'auto') {
    res.status(400).json({ error: '只能删除用户添加的本次任务模型选项' })
    return
  }

  let removed = false
  store.update((state) => {
    const nextModels = state.modelSettings.customModels.filter((model) => model.id !== modelId)
    removed = nextModels.length !== state.modelSettings.customModels.length
    state.modelSettings.customModels = nextModels
    if (state.modelSettings.selectedModelId === modelId) {
      state.modelSettings.selectedModelId = 'auto'
    }
  })

  if (!removed) {
    res.status(404).json({ error: 'model not found' })
    return
  }

  const settings = store.snapshot.modelSettings
  res.json({
    selectedModelId: settings.selectedModelId,
    models: listModelOptions(settings),
    hermes: readHermesModelOverview(settings),
    catalog: readHermesModelCatalog()
  })
})

app.post('/api/models/hermes-default', (req, res) => {
  try {
    const { modelId, provider } = req.body as { modelId?: unknown; provider?: unknown }
    if (typeof modelId !== 'string') {
      res.status(400).json({ error: 'modelId is required' })
      return
    }
    setHermesDefaultModel(modelId, typeof provider === 'string' ? provider : undefined)
    store.update((state) => {
      state.modelSettings.selectedModelId = 'auto'
      state.modelSettings.customModels = state.modelSettings.customModels.filter((model) => model.id !== modelId)
    })
    const settings = store.snapshot.modelSettings
    res.json({
      selectedModelId: settings.selectedModelId,
      models: listModelOptions(settings),
      hermes: readHermesModelOverview(settings),
      catalog: readHermesModelCatalog()
    })
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
    configureHermesModel({
      provider,
      modelId,
      baseUrl: typeof baseUrl === 'string' ? baseUrl : undefined,
      apiKey: typeof apiKey === 'string' ? apiKey : undefined,
      apiMode: typeof apiMode === 'string' ? apiMode : undefined
    })
    store.update((state) => {
      state.modelSettings.selectedModelId = 'auto'
      state.modelSettings.customModels = state.modelSettings.customModels.filter((model) => model.id !== modelId)
    })
    const settings = store.snapshot.modelSettings
    res.json({
      selectedModelId: settings.selectedModelId,
      models: listModelOptions(settings),
      hermes: readHermesModelOverview(settings),
      catalog: readHermesModelCatalog()
    })
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
    res.json({
      selectedModelId: settings.selectedModelId,
      models: listModelOptions(settings),
      hermes: readHermesModelOverview(settings),
      catalog: readHermesModelCatalog()
    })
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
    res.json({
      selectedModelId: settings.selectedModelId,
      models: listModelOptions(settings),
      hermes: readHermesModelOverview(settings),
      catalog: readHermesModelCatalog()
    })
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

app.get('/api/workspaces/:workspaceId/files', (req, res) => {
  const workspace = store.snapshot.workspaces.find((item) => item.id === req.params.workspaceId)
  if (!workspace || !fs.existsSync(workspace.path)) {
    res.status(404).json({ error: 'workspace not found' })
    return
  }

  res.json(listWorkspaceFiles(workspace.path))
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
  if (!isTextPreviewable(targetPath)) {
    res.status(415).json({ error: 'preview is only available for text-like files in this MVP' })
    return
  }
  res.type('text/plain').send(fs.readFileSync(targetPath, 'utf8'))
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
  const { prompt, workspaceId, modelId, skillNames } = req.body as {
    prompt?: string
    workspaceId?: string
    modelId?: string
    skillNames?: unknown
  }
  if (!prompt?.trim() || !workspaceId) {
    res.status(400).json({ error: 'prompt and workspaceId are required' })
    return
  }

  const state = store.snapshot
  const workspace = state.workspaces.find((item) => item.id === workspaceId)
  if (!workspace) {
    res.status(404).json({ error: 'workspace not found' })
    return
  }

  const now = new Date().toISOString()
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
    title: prompt.trim().slice(0, 42),
    status: 'running',
    prompt: prompt.trim(),
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
      content: prompt.trim(),
      createdAt: now
    })
  })

  void executeTask(task.id, workspace.path, prompt.trim(), undefined, model, normalizedSkillNames)
  const createdState = store.snapshot
  const createdTask = createdState.tasks.find((item) => item.id === task.id)
  res.status(201).json(createdTask ? enrichTask(createdState, createdTask) : task)
})

app.post('/api/tasks/:taskId/messages', (req, res) => {
  const { prompt, modelId, skillNames } = req.body as { prompt?: string; modelId?: string; skillNames?: unknown }
  if (!prompt?.trim()) {
    res.status(400).json({ error: 'prompt is required' })
    return
  }

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
  const model = resolveRequestedModel(modelId || task.modelId)
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
    mutableTask.startedAt = now
    mutableTask.completedAt = undefined
    mutableTask.updatedAt = now
    mutable.messages.push({
      id: crypto.randomUUID(),
      taskId: task.id,
      role: 'user',
      content: prompt.trim(),
      createdAt: now
    })
  })
  broadcastTaskUpdate(task.id)

  void executeTask(task.id, workspace.path, prompt.trim(), resumeSessionId, model, normalizedSkillNames)
  res.status(202).json({ ok: true })
})

app.post('/api/tasks/:taskId/stop', (req, res) => {
  const taskId = req.params.taskId
  const child = runningTasks.get(taskId)
  const stoppedAt = new Date().toISOString()
  if (child) {
    child.kill('SIGTERM')
    runningTasks.delete(taskId)
  }

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
          reason: child ? 'user_requested' : 'not_running',
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
  broadcastTaskUpdate(taskId)
  res.json({ ok: true })
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
  const child = runningTasks.get(taskId)
  if (child) {
    child.kill('SIGTERM')
    runningTasks.delete(taskId)
  }

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

  const targetPath = ensureInsideWorkspace(path.join(workspace.path, req.file.originalname), workspace.path)
  fs.copyFileSync(req.file.path, targetPath)
  fs.unlinkSync(req.file.path)
  res.status(201).json({ name: req.file.originalname, path: targetPath })
})

app.get('/api/artifacts/:artifactId/download', (req, res) => {
  const artifact = store.snapshot.artifacts.find((item) => item.id === req.params.artifactId)
  if (!artifact || !fs.existsSync(artifact.path)) {
    res.status(404).json({ error: 'artifact not found' })
    return
  }
  res.download(artifact.path, artifact.name)
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

app.post('/api/artifacts/:artifactId/reveal', (req, res) => {
  const artifact = store.snapshot.artifacts.find((item) => item.id === req.params.artifactId)
  if (!artifact || !fs.existsSync(artifact.path)) {
    res.status(404).json({ error: 'artifact not found' })
    return
  }
  revealPath(artifact.path)
  res.json({ ok: true })
})

app.get('/api/artifacts/:artifactId/preview', (req, res) => {
  const artifact = store.snapshot.artifacts.find((item) => item.id === req.params.artifactId)
  if (!artifact || !fs.existsSync(artifact.path)) {
    res.status(404).json({ error: 'artifact not found' })
    return
  }

  if (!isTextPreviewable(artifact.path)) {
    res.status(415).json({ error: 'preview is only available for text-like artifacts in this MVP' })
    return
  }
  res.type('text/plain').send(fs.readFileSync(artifact.path, 'utf8'))
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
    const result = await runHermesPythonBridge({
      taskId,
      prompt,
      cwd: workspacePath,
      resumeSessionId,
      onEvent: (event) => updateRunningEvent(taskId, event),
      onStdout: (_chunk, accumulated) => updateRunningOutput(taskId, { stdout: accumulated }),
      onStderr: (_chunk, accumulated) => updateRunningOutput(taskId, { stderr: accumulated }),
      onProcess: (child) => runningTasks.set(taskId, child),
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
    const stoppedBeforeFinal = taskBeforeUpdate?.status === 'stopped'
    const finalEvents = buildFinalExecutionEvents(
      taskBeforeUpdate?.events,
      result.events,
      result.stdout,
      stoppedBeforeFinal ? '' : result.stderr,
      stoppedBeforeFinal ? [] : artifacts,
      completedAt
    )

    if (stoppedBeforeFinal) {
      store.update((state) => {
        const task = state.tasks.find((item) => item.id === taskId)
        if (!task || task.status !== 'stopped') return
        task.stdout = result.finalResponse || cleanBridgeStdout(result.stdout) || task.stdout
        task.stderr = result.stderr || task.stderr
        task.hermesSessionId = result.sessionId ?? task.hermesSessionId
        task.events = finalEvents
        task.updatedAt = task.completedAt ?? completedAt
      })
      broadcastTaskUpdate(taskId)
      return
    }

    store.update((state) => {
      const task = state.tasks.find((item) => item.id === taskId)
      if (!task) return
      task.status = result.exitCode === 0 ? 'completed' : 'failed'
      task.stdout = result.finalResponse || cleanBridgeStdout(result.stdout)
      task.stderr = result.stderr
      task.hermesSessionId = result.sessionId
      task.events = finalEvents
      task.completedAt = completedAt
      task.updatedAt = completedAt
      task.error = result.exitCode === 0 ? undefined : result.stderr || `Hermes exited with ${result.exitCode}`

      state.messages.push({
        id: crypto.randomUUID(),
        taskId,
        role: 'assistant',
        content:
          result.finalResponse ||
          cleanHermesOutput(cleanBridgeStdout(result.stdout)) ||
          result.stderr ||
          '(Hermes 没有返回内容)',
        createdAt: completedAt
      })
      state.artifacts.push(...artifacts)
    })
    broadcastTaskUpdate(taskId)
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
    broadcastTaskUpdate(taskId)
  }
}

function resolveRequestedModel(modelId?: string) {
  const settings = store.snapshot.modelSettings
  const models = listModelOptions(settings)
  const requested = modelId || settings.selectedModelId
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

function normalizeSkillNames(value: unknown, fallback: string[] = []) {
  const rawItems = Array.isArray(value) ? value : fallback
  return [...new Set(
    rawItems
      .map((item) => String(item).trim())
      .filter(Boolean)
      .map((item) => item.slice(0, 120))
  )].slice(0, 12)
}

function isTextPreviewable(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  if (['.txt', '.md', '.json', '.csv', '.html', '.htm', '.log', '.xml', '.yaml', '.yml'].includes(ext)) {
    return true
  }
  return !ext && fs.statSync(filePath).size < 1024 * 1024
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
  store.update((state) => {
    const task = state.tasks.find((item) => item.id === taskId)
    if (!task || task.status !== 'running') return
    if (output.stdout !== undefined) task.stdout = output.stdout.trimEnd()
    if (output.stderr !== undefined) task.stderr = output.stderr.trimEnd()
    task.updatedAt = new Date().toISOString()
  })
  broadcastTaskUpdate(taskId)
}

function updateRunningEvent(taskId: string, bridgeEvent: HermesBridgeEvent) {
  const event = normalizeBridgeEvent(bridgeEvent)
  store.update((state) => {
    const task = state.tasks.find((item) => item.id === taskId)
    if (!task || task.status !== 'running') return
    task.events = [...(task.events ?? []), event]
    if (bridgeEvent.type === 'message.delta' && typeof bridgeEvent.text === 'string') {
      task.stdout = `${task.stdout ?? ''}${bridgeEvent.text}`
    }
    if (bridgeEvent.type === 'task.failed' && typeof bridgeEvent.finalResponse === 'string') {
      task.stdout = bridgeEvent.finalResponse
    }
    if (bridgeEvent.type === 'task.completed' && typeof bridgeEvent.finalResponse === 'string') {
      task.stdout = bridgeEvent.finalResponse
      task.hermesSessionId =
        typeof bridgeEvent.sessionId === 'string' ? bridgeEvent.sessionId : task.hermesSessionId
    }
    if (bridgeEvent.type === 'task.failed' && typeof bridgeEvent.error === 'string') {
      task.error = bridgeEvent.error
    }
    task.updatedAt = new Date().toISOString()
  })
  broadcastTaskUpdate(taskId)
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
  for (const event of events) {
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
  return deduped.slice(-160)
}

function inferredToolName(event: ExecutionEvent) {
  if (Array.isArray(event.args)) {
    const maybeName = event.args.find((item) => typeof item === 'string' && item.trim())
    if (maybeName) return maybeName
  }
  return event.type
}

function eventPrimaryText(event: ExecutionEvent) {
  if (typeof event.summary === 'string' && event.summary.trim()) return event.summary.trim()
  if (typeof event.message === 'string' && event.message.trim()) return event.message.trim()
  if (typeof event.text === 'string' && event.text.trim()) return event.text.trim()
  if (typeof event.result === 'string' && event.result.trim()) return event.result.trim().slice(0, 1000)
  if (typeof event.error === 'string' && event.error.trim()) return event.error.trim()
  if (Array.isArray(event.args) && typeof event.args[2] === 'string' && event.args[2].trim()) return event.args[2].trim()
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
  if (!clients.size) taskStreamClients.delete(taskId)
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

function broadcastTaskUpdate(taskId: string) {
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
      errorLines.add(String(event.error ?? safeJson(event)))
    }
  }

  for (const line of [...stdoutLines, ...stderrLines]) {
    if (isDecorativeLine(line) || /^session_id:/i.test(line)) continue
    if (isErrorLine(line)) {
      errorLines.add(line)
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

  if (task.error) errorLines.add(task.error)

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
    .filter((event) =>
      ['bridge.started', 'step', 'thinking', 'status', 'tool.started', 'tool.completed', 'tool.progress', 'artifact.created', 'task.completed', 'task.stopped', 'task.failed'].includes(
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
      detail: task.error || 'Hermes 返回失败状态',
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
  return {
    id: event.id,
    kind: 'status',
    title: event.type === 'bridge.started' ? '桥接已启动' : `状态：${String(event.kind ?? '运行')}`,
    detail: event.type === 'bridge.started' ? String(event.cwd ?? '授权工作区') : eventPrimaryText(event),
    createdAt: event.createdAt,
    source: event.synthetic ? 'synthetic' : 'hermes'
  }
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
      files.push({
        name: entry.name,
        relativePath,
        path: fullPath,
        type: path.extname(entry.name).replace('.', '') || 'file',
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      })
    }
  }
}

app.listen(port, '127.0.0.1', () => {
  console.log(`Hermes Cowork API listening on http://127.0.0.1:${port}`)
})

startMcpRecommendationScheduler(() => store.snapshot.tasks)
