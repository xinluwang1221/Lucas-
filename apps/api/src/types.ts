export type TaskStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stopped'

export type Workspace = {
  id: string
  name: string
  path: string
  createdAt: string
}

export type Message = {
  id: string
  taskId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  attachments?: MessageAttachment[]
  annotations?: MessageAnnotation[]
}

export type MessageAttachment = {
  id: string
  workspaceId: string
  name: string
  relativePath: string
  path: string
  type: string
  size: number
  createdAt: string
}

export type MessageAnnotation = {
  id: string
  workspaceId: string
  source: 'workspace' | 'artifact'
  label: string
  fileName: string
  relativePath: string
  path: string
  type: string
  previewKind: string
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
  page?: number
  selectedText?: string
  contextExcerpt?: string
  note?: string
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

export type Task = {
  id: string
  workspaceId: string
  modelId?: string
  provider?: string
  modelConfigKey?: string
  skillNames?: string[]
  title: string
  status: TaskStatus
  prompt: string
  hermesSessionId?: string
  hermesSessionResumeMode?: 'explicit'
  error?: string
  stdout?: string
  stderr?: string
  events?: ExecutionEvent[]
  tags?: string[]
  pinned?: boolean
  archivedAt?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export type ExecutionEvent = {
  id: string
  type: string
  createdAt: string
  [key: string]: unknown
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

export type AppState = {
  workspaces: Workspace[]
  tasks: Task[]
  messages: Message[]
  artifacts: Artifact[]
  skillSettings: Record<string, SkillSetting>
  modelSettings: ModelSettings
}

export type SkillSetting = {
  enabled: boolean
  updatedAt: string
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

export type HermesMcpServer = {
  id: string
  name: string
  description: string
  iconUrl: string
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

export type HermesMcpInstallRequest = {
  installName: string
  suggestedCommand: string
  suggestedArgs: string[]
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
