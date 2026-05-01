import { apiUrl, jsonHeaders, parseError, request } from './http'

export type Workspace = {
  id: string
  name: string
  path: string
  createdAt: string
}

export type PickedWorkspaceDirectory = {
  name: string
  path: string
}

export type Message = {
  id: string
  taskId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
}

export type Artifact = {
  id: string
  taskId: string
  workspaceId: string
  name: string
  path: string
  relativePath: string
  type: string
  size: number
  createdAt: string
}

export type WorkspaceFile = {
  name: string
  relativePath: string
  path: string
  type: string
  size: number
  modifiedAt: string
}

export type WorkspaceTreeEntry = WorkspaceFile & {
  kind: 'directory' | 'file'
}

export type WorkspaceTree = {
  workspaceId: string
  path: string
  parentPath: string
  breadcrumbs: Array<{ name: string; path: string }>
  entries: WorkspaceTreeEntry[]
}

export type ExecutionView = {
  response: string
  activity: ExecutionActivity[]
  tools: string[]
  logs: string[]
  errors: string[]
  rawOutput: string
  rawLog: string
}

export type ExecutionActivity = {
  id: string
  kind: 'thinking' | 'search' | 'tool' | 'file' | 'status' | 'done' | 'stopped' | 'error'
  title: string
  detail: string
  createdAt: string
  source: 'hermes' | 'synthetic'
}

export type ExecutionEvent = {
  id: string
  type: string
  createdAt: string
  name?: string
  message?: string
  kind?: string
  iteration?: number
  args?: unknown
  kwargs?: unknown
  result?: string
  isError?: boolean
  error?: string
  text?: string
  [key: string]: unknown
}

export type Task = {
  id: string
  workspaceId: string
  modelId?: string
  provider?: string
  modelConfigKey?: string
  skillNames?: string[]
  title: string
  status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped'
  prompt: string
  hermesSessionId?: string
  error?: string
  stdout?: string
  stderr?: string
  liveResponse?: string
  executionView?: ExecutionView
  events?: ExecutionEvent[]
  tags?: string[]
  pinned?: boolean
  archivedAt?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
  messages: Message[]
  artifacts: Artifact[]
}

export type AppState = {
  workspaces: Workspace[]
  tasks: Task[]
  messages: Message[]
  artifacts: Artifact[]
  skillSettings: Record<string, { enabled: boolean; updatedAt: string }>
  modelSettings: ModelSettings
}

export type ModelOption = {
  id: string
  label: string
  provider?: string
  builtIn?: boolean
  description?: string
  source?: 'auto' | 'current' | 'custom' | 'catalog'
  selectedModelKey?: string
  runtimeModelId?: string
}

export type ModelSettings = {
  selectedModelId: string
  customModels: ModelOption[]
}

export type HermesModelCredential = {
  id: string
  label: string
  kind: 'api_key' | 'oauth' | 'pool' | 'custom'
  configured: boolean
  detail: string
}

export type HermesModelProvider = {
  id: string
  label: string
  source: 'hermes' | 'config' | 'auth' | 'custom'
  configured: boolean
  isCurrent: boolean
  baseUrl?: string
  apiMode?: string
  models: string[]
  credentialSummary: string
}

export type HermesModelCatalogProvider = {
  id: string
  label: string
  description: string
  models: string[]
  source: 'hermes'
}

export type HermesModelCatalogRefreshSource = {
  provider: string
  label: string
  url: string
  ok: boolean
  addedModels: string[]
  message: string
}

export type HermesReasoningEffort = '' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export type HermesReasoningSettings = {
  effort: HermesReasoningEffort
  effectiveEffort: Exclude<HermesReasoningEffort, ''>
  showReasoning: boolean
  delegationEffort: HermesReasoningEffort
}

export type HermesModelOverview = {
  configPath: string
  envPath: string
  defaultModel: string
  provider: string
  providerLabel: string
  baseUrl?: string
  apiMode?: string
  fallbackProviders: string[]
  credentials: HermesModelCredential[]
  providers: HermesModelProvider[]
  reasoning: HermesReasoningSettings
  updatedAt: string
}

export type ModelListResponse = {
  selectedModelId: string
  models: ModelOption[]
  hermes: HermesModelOverview
  catalog: HermesModelCatalogProvider[]
  catalogRefresh?: {
    sources: HermesModelCatalogRefreshSource[]
    updatedAt: string
  }
}

export type HermesModelConfigureRequest = {
  provider: string
  modelId: string
  baseUrl?: string
  apiKey?: string
  apiMode?: string
}

export type HermesReasoningConfigureRequest = {
  effort?: HermesReasoningEffort
  showReasoning?: boolean
  delegationEffort?: HermesReasoningEffort
}

export type Skill = {
  id: string
  name: string
  description: string
  path: string
  source: 'user' | 'system' | 'plugin' | 'uploaded'
  enabled: boolean
  installed: true
  updatedAt: string
}

export type SkillFile = {
  name: string
  relativePath: string
  path: string
  type: 'file' | 'directory'
  size: number
  modifiedAt: string
  previewable: boolean
}

export type HermesRuntime = {
  bridgeMode: string
  paths: {
    hermesBin: string
    hermesAgentDir: string
    hermesPythonBin: string
  }
  versionText: string
  statusText: string
  parsed: Record<string, Record<string, string>>
  updatedAt: string
}

export type HermesSessionSummary = {
  id: string
  file: string
  model?: string
  platform?: string
  messageCount: number
  startedAt: string
  updatedAt: string
  linkedTaskIds: string[]
  linkedTaskTitle?: string
  linkedWorkspaceIds: string[]
}

export type HermesSessionsResponse = {
  sessionsDir: string
  sessions: HermesSessionSummary[]
  updatedAt: string
}

export type HermesContextSnapshot = {
  sessionId?: string
  model?: string
  contextUsed: number
  contextMax: number
  contextPercent: number
  contextSource: 'api' | 'estimated' | 'unknown'
  thresholdPercent: number
  targetRatio: number
  protectLast: number
  compressionCount: number
  compressionEnabled: boolean
  canCompress: boolean
  messageCount: number
  status: 'empty' | 'unknown' | 'ok' | 'warn' | 'danger'
  statusLabel: string
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    reasoningTokens: number
    apiCalls: number
  }
  updatedAt: string
}

export type HermesContextCompressResult = {
  ok: boolean
  oldSessionId?: string
  newSessionId?: string
  removed: number
  skipped?: boolean
  reason?: string
  context: HermesContextSnapshot
}

export type HermesMcpServer = {
  id: string
  name: string
  description?: string
  iconUrl?: string
  transport: 'stdio' | 'http' | 'sse' | 'unknown'
  command?: string
  args: string[]
  url?: string
  auth: 'none' | 'oauth' | 'header' | 'unknown'
  headerKeys: string[]
  envKeys: string[]
  hasSecrets: boolean
  enabled: boolean
  toolMode: string
  includeTools: string[]
  excludeTools: string[]
  status: 'configured' | 'incomplete'
  issues: string[]
}

export type HermesMcpConfig = {
  configPath: string
  servers: HermesMcpServer[]
  updatedAt: string
}

export type HermesMcpTestResult = {
  serverId: string
  ok: boolean
  elapsedMs: number
  toolCount?: number
  tools?: Array<{
    name: string
    description: string
  }>
  output: string
  error?: string
  testedAt: string
}

export type HermesMcpManualConfigRequest = {
  name: string
  transport: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  url?: string
  env?: string[]
  auth?: 'none' | 'oauth' | 'header'
  authHeaderName?: string
  authHeaderValue?: string
  preset?: string
}

export type HermesMcpMarketplaceCandidate = {
  id: string
  name: string
  repo: string
  url: string
  description: string
  sourceDescription: string
  iconUrl: string
  category: HermesMcpCategoryId
  categoryLabel: string
  stars: number
  language: string
  updatedAt: string
  installName: string
  suggestedCommand: string
  suggestedArgs: string[]
  confidence: 'high' | 'medium' | 'low'
}

export type HermesMcpMarketplaceResponse = {
  query: string
  source: 'github'
  candidates: HermesMcpMarketplaceCandidate[]
  updatedAt: string
}

export type HermesMcpInstallResult = {
  ok: boolean
  installName: string
  command: string
  args: string[]
  output: string
  error?: string
  backupPath?: string
  config: HermesMcpConfig
  testResult?: HermesMcpTestResult
  installedAt: string
}

export type HermesMcpUpdateResult = {
  ok: boolean
  serverId: string
  config: HermesMcpConfig
  testResult?: HermesMcpTestResult
  backupPath?: string
  updatedAt: string
}

export type HermesMcpToolSelectionRequest = {
  mode: 'all' | 'include' | 'exclude'
  tools: string[]
}

export type HermesMcpToolSelectionResult = {
  ok: boolean
  serverId: string
  mode: 'all' | 'include' | 'exclude'
  tools: string[]
  config: HermesMcpConfig
  backupPath?: string
  updatedAt: string
}

export type HermesMcpServeLogEntry = {
  createdAt: string
  stream: 'stdout' | 'stderr' | 'system'
  text: string
}

export type HermesMcpServeStatus = {
  running: boolean
  pid?: number
  command: string[]
  cwd: string
  startedAt?: string
  stoppedAt?: string
  exitCode?: number | null
  signal?: string | null
  logs: HermesMcpServeLogEntry[]
  updatedAt: string
}

export type HermesMcpCategoryId =
  | 'file'
  | 'browser'
  | 'data'
  | 'office'
  | 'research'
  | 'vision'
  | 'memory'
  | 'dev'
  | 'automation'
  | 'other'

export type HermesMcpRecommendationGroup = {
  id: HermesMcpCategoryId
  label: string
  description: string
  candidates: HermesMcpMarketplaceCandidate[]
}

export type HermesMcpRecommendations = {
  generatedAt: string
  nextRunAt: string
  sourceSummary: string
  keywords: string[]
  blockers: string[]
  categories: HermesMcpRecommendationGroup[]
  aiUsed?: boolean
  aiSummary?: string
}

export type BackgroundServiceStatus = {
  api: {
    installed: boolean
    loaded: boolean
    plistPath: string
  }
  dailyMcp: {
    installed: boolean
    loaded: boolean
    plistPath: string
  }
  logsDir: string
}

export type HermesUpdateStatus = {
  repoPath: string
  repoUrl: string
  remoteUrl: string
  branch: string
  currentVersion: string
  currentTag: string
  currentCommit: string
  latestTag?: string
  latestCommit?: string
  commitsBehind?: number
  updateAvailable: boolean
  workingTreeDirty: boolean
  verifiedCoworkTag: string
  compatibility: {
    status: 'verified' | 'needs-review' | 'blocked' | 'unknown'
    title: string
    detail: string
    notes: string[]
  }
  checks: Array<{
    id: string
    label: string
    ok: boolean
    detail: string
  }>
  commands: {
    check: string
    update: string
    rollback: string
  }
  updatedAt: string
}

export type HermesCompatibilityTestResult = {
  id: string
  status: 'passed' | 'failed'
  title: string
  detail: string
  version: {
    currentTag: string
    latestTag?: string
    verifiedCoworkTag: string
  }
  steps: Array<{
    id: string
    label: string
    status: 'passed' | 'failed'
    detail: string
    elapsedMs: number
  }>
  smokeTask?: {
    sessionId?: string
    responsePreview: string
    eventCount: number
  }
  startedAt: string
  completedAt: string
}

export type HermesAutoUpdateResult = {
  id: string
  status: 'passed' | 'failed'
  title: string
  detail: string
  stage: 'precheck' | 'backup' | 'update' | 'postcheck' | 'completed'
  backupDir?: string
  backupFiles: string[]
  command: string
  stdout: string
  stderr: string
  exitCode: number | null
  before: HermesUpdateStatus
  after?: HermesUpdateStatus
  preTest: HermesCompatibilityTestResult
  postTest?: HermesCompatibilityTestResult
  startedAt: string
  completedAt: string
}

export async function getState(): Promise<AppState> {
  return request('/api/state')
}

export async function getHermesRuntime(): Promise<HermesRuntime> {
  return request('/api/hermes/runtime')
}

export async function getHermesUpdateStatus(): Promise<HermesUpdateStatus> {
  return request('/api/hermes/update-status')
}

export async function runHermesCompatibilityTest(): Promise<HermesCompatibilityTestResult> {
  return request('/api/hermes/compatibility-test', {
    method: 'POST'
  })
}

export async function runHermesAutoUpdate(): Promise<HermesAutoUpdateResult> {
  return request('/api/hermes/update', {
    method: 'POST'
  })
}

export async function getHermesSessions(): Promise<HermesSessionsResponse> {
  return request('/api/hermes/sessions')
}

export async function getTaskContext(taskId: string): Promise<HermesContextSnapshot> {
  return request(`/api/tasks/${encodeURIComponent(taskId)}/context`)
}

export async function compressTaskContext(taskId: string): Promise<HermesContextCompressResult> {
  return request(`/api/tasks/${encodeURIComponent(taskId)}/context/compress`, {
    method: 'POST'
  })
}

export async function getHermesMcpConfig(): Promise<HermesMcpConfig> {
  return request('/api/hermes/mcp')
}

export async function searchHermesMcpMarketplace(query: string): Promise<HermesMcpMarketplaceResponse> {
  return request(`/api/hermes/mcp/marketplace?q=${encodeURIComponent(query)}`)
}

export async function getHermesMcpRecommendations(): Promise<HermesMcpRecommendations> {
  return request('/api/hermes/mcp/recommendations')
}

export async function refreshHermesMcpRecommendations(): Promise<HermesMcpRecommendations> {
  return request('/api/hermes/mcp/recommendations/refresh', {
    method: 'POST'
  })
}

export async function refreshHermesMcpRecommendationsWithAi(): Promise<HermesMcpRecommendations> {
  return request('/api/hermes/mcp/recommendations/refresh-ai', {
    method: 'POST'
  })
}

export async function getBackgroundStatus(): Promise<BackgroundServiceStatus> {
  return request('/api/background/status')
}

export async function installBackgroundServices(): Promise<BackgroundServiceStatus> {
  return request('/api/background/install', { method: 'POST' })
}

export async function uninstallBackgroundServices(): Promise<BackgroundServiceStatus> {
  return request('/api/background/uninstall', { method: 'POST' })
}

export async function installHermesMcpServer(candidate: HermesMcpMarketplaceCandidate): Promise<HermesMcpInstallResult> {
  return request('/api/hermes/mcp/install', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      installName: candidate.installName,
      suggestedCommand: candidate.suggestedCommand,
      suggestedArgs: candidate.suggestedArgs
    })
  })
}

export async function configureHermesMcpServer(config: HermesMcpManualConfigRequest): Promise<HermesMcpInstallResult> {
  return request('/api/hermes/mcp/manual', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(config)
  })
}

export async function updateHermesMcpServer(serverId: string, config: HermesMcpManualConfigRequest): Promise<HermesMcpUpdateResult> {
  return request(`/api/hermes/mcp/${encodeURIComponent(serverId)}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify(config)
  })
}

export async function setHermesMcpServerTools(serverId: string, selection: HermesMcpToolSelectionRequest): Promise<HermesMcpToolSelectionResult> {
  return request(`/api/hermes/mcp/${encodeURIComponent(serverId)}/tools`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify(selection)
  })
}

export async function getHermesMcpServeStatus(): Promise<HermesMcpServeStatus> {
  return request('/api/hermes/mcp/serve')
}

export async function startHermesMcpServe(): Promise<HermesMcpServeStatus> {
  return request('/api/hermes/mcp/serve/start', { method: 'POST' })
}

export async function stopHermesMcpServe(): Promise<HermesMcpServeStatus> {
  return request('/api/hermes/mcp/serve/stop', { method: 'POST' })
}

export async function testHermesMcpServer(serverId: string): Promise<HermesMcpTestResult> {
  return request(`/api/hermes/mcp/${encodeURIComponent(serverId)}/test`, {
    method: 'POST'
  })
}

export async function removeHermesMcpServer(serverId: string): Promise<HermesMcpConfig> {
  return request(`/api/hermes/mcp/${encodeURIComponent(serverId)}`, {
    method: 'DELETE'
  })
}

export async function setHermesMcpServerEnabled(serverId: string, enabled: boolean): Promise<HermesMcpConfig> {
  return request(`/api/hermes/mcp/${encodeURIComponent(serverId)}/enabled`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ enabled })
  })
}

export async function listSkills(): Promise<Skill[]> {
  return request('/api/skills')
}

export async function toggleSkill(skillId: string, enabled: boolean) {
  return request(`/api/skills/${encodeURIComponent(skillId)}/toggle`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ enabled })
  })
}

export async function uploadSkill(file: File) {
  const form = new FormData()
  form.append('skill', file)
  return request('/api/skills/upload', {
    method: 'POST',
    body: form
  })
}

export async function listSkillFiles(skillId: string): Promise<SkillFile[]> {
  return request(`/api/skills/${encodeURIComponent(skillId)}/files`)
}

export async function readSkillFile(skillId: string, relativePath: string): Promise<string> {
  const response = await fetch(
    apiUrl(`/api/skills/${encodeURIComponent(skillId)}/files/content?path=${encodeURIComponent(relativePath)}`)
  )
  if (!response.ok) {
    const error = await parseError(response)
    throw new Error(error)
  }
  return response.text()
}

export function artifactDownloadUrl(artifactId: string) {
  return apiUrl(`/api/artifacts/${artifactId}/download`)
}

export function artifactRawUrl(artifactId: string) {
  return apiUrl(`/api/artifacts/${artifactId}/raw`)
}

export async function revealArtifact(artifactId: string) {
  return request(`/api/artifacts/${artifactId}/reveal`, { method: 'POST' })
}

export async function previewArtifact(artifactId: string): Promise<string> {
  const response = await fetch(apiUrl(`/api/artifacts/${artifactId}/preview`))
  if (!response.ok) {
    const error = await parseError(response)
    throw new Error(error)
  }
  return response.text()
}
