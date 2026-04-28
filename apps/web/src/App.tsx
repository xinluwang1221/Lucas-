import {
  Archive,
  ArchiveRestore,
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  Circle,
  Code2,
  Copy,
  Clock3,
  Database,
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe2,
  Hammer,
  Info,
  Languages,
  Loader2,
  LogOut,
  MessageSquarePlus,
  PanelRight,
  Palette,
  Plug,
  Play,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Square,
  Star,
  Tags,
  Terminal,
  Trash2,
  Upload,
  User,
  Wrench,
  XCircle
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  addWorkspace,
  addModel,
  AppState,
  archiveTask,
  Artifact,
  BackgroundServiceStatus,
  configureHermesMcpServer,
  createTask,
  deleteTask,
  ExecutionEvent,
  getBackgroundStatus,
  getHermesMcpConfig,
  getHermesMcpRecommendations,
  getHermesRuntime,
  getHermesMcpServeStatus,
  HermesMcpConfig,
  HermesMcpInstallResult,
  HermesMcpManualConfigRequest,
  HermesMcpMarketplaceCandidate,
  HermesMcpRecommendations,
  HermesMcpServeStatus,
  HermesMcpTestResult,
  HermesModelOverview,
  getState,
  HermesRuntime,
  installBackgroundServices,
  installHermesMcpServer,
  listSkillFiles,
  listModels,
  listWorkspaceFiles,
  listSkills,
  Message,
  ModelOption,
  previewArtifact,
  previewWorkspaceFile,
  readSkillFile,
  refreshHermesMcpRecommendationsWithAi,
  removeHermesMcpServer,
  revealArtifact,
  revealWorkspace,
  revealWorkspaceFile,
  pinTask,
  sendTaskMessage,
  searchHermesMcpMarketplace,
  setHermesMcpServerEnabled,
  setHermesMcpServerTools,
  setHermesDefaultModel,
  setHermesFallbackProviders,
  setTaskTags,
  selectModel,
  startHermesMcpServe,
  stopTask,
  stopHermesMcpServe,
  Task,
  testHermesMcpServer,
  taskExportUrl,
  taskStreamUrl,
  tasksExportUrl,
  Skill,
  SkillFile,
  uploadFile,
  toggleSkill,
  uninstallBackgroundServices,
  updateHermesMcpServer,
  uploadSkill,
  Workspace,
  WorkspaceFile
} from './lib/api'
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'

const emptyState: AppState = {
  workspaces: [],
  tasks: [],
  messages: [],
  artifacts: [],
  skillSettings: {},
  modelSettings: {
    selectedModelId: 'auto',
    customModels: []
  }
}

type Preview = {
  title: string
  body: string
  kind: 'markdown' | 'csv' | 'text'
}

type SettingsTab =
  | 'account'
  | 'general'
  | 'mcp'
  | 'models'
  | 'conversation'
  | 'external'
  | 'cloud'
  | 'commands'
  | 'rules'
  | 'about'

type ViewMode = 'tasks' | 'search' | 'scheduled' | 'projects' | 'dispatch' | 'ideas' | 'skills'

const examples = [
  {
    title: '网页读取',
    detail: '读取网页、论文或资料链接，生成结构化文档',
    prompt: '请读取我提供的网页或资料链接，整理成结构化摘要，并标注关键来源。',
    icon: 'web',
    category: '网页调研'
  },
  {
    title: '调研分析',
    detail: '调研多个来源，输出汇报或 PPT 大纲',
    prompt: '请围绕这个主题做调研分析，输出一份可用于汇报的结构化大纲。',
    icon: 'research',
    category: '网页调研'
  },
  {
    title: '数据挖掘',
    detail: '分析表格数据，发现问题和趋势',
    prompt: '请分析当前工作区里的数据文件，找出关键趋势、异常点和下一步建议。',
    icon: 'data',
    category: '数据分析'
  },
  {
    title: '文件管理',
    detail: '整理本地文件夹，列出清单和移动建议',
    prompt: '请整理这个工作区里的文件，并说明你移动或建议处理了哪些内容。',
    icon: 'files',
    category: '文件整理'
  },
  {
    title: '生成工作周报',
    detail: '汇总本周任务、产物和卡点，输出可发飞书的周报',
    prompt: '请根据当前工作区和最近任务，整理一份本周工作周报，包含完成事项、关键产物、风险卡点和下周计划。',
    icon: 'research',
    category: '文档生成'
  },
  {
    title: '飞书文档草稿',
    detail: '把材料整理成飞书文档结构，适合会议纪要和项目说明',
    prompt: '请把当前材料整理成一份飞书文档草稿，包含标题、背景、结论、行动项和可复制的正文。',
    icon: 'research',
    category: '飞书办公'
  },
  {
    title: 'Excel 分析报告',
    detail: '读取表格，输出洞察、异常、建议和报告正文',
    prompt: '请分析当前工作区里的 Excel/CSV 数据，输出关键指标、异常解释、业务洞察和下一步建议。',
    icon: 'data',
    category: '数据分析'
  },
  {
    title: '桌面文件清理',
    detail: '扫描文件夹，给出分类、移动和删除前确认清单',
    prompt: '请扫描当前授权文件夹，按文件类型和用途整理清单，先给我移动/归档建议，不要直接删除文件。',
    icon: 'files',
    category: '文件整理'
  }
]

type Example = (typeof examples)[number]

const taskTagOptions = ['文件整理', '文档生成', '飞书', '数据分析', '网页调研']

type McpScope = 'local' | 'serve' | 'recommendations' | 'cloud'
type RulesScope = 'local' | 'cloud'

type McpServer = {
  id: string
  name: string
  logo: string
  status: 'ready' | 'offline'
  enabled: boolean
}

type SettingsPrefs = {
  linkOpenMode: string
  mcpScope: McpScope
  mcpServers: McpServer[]
  autoRunMcp: boolean
  commandRunMode: string
  commandWhitelist: string[]
  sandboxMode: string
  editExternalFilesMode: string
  externalPathRules: string[]
  browserAutomation: string
  terminalAutoOpen: string
  notifyBanner: boolean
  notifySound: boolean
  notifyMenu: boolean
  soundVolume: number
  multiThreadDownload: boolean
  maxDownloadRetries: number
  rulesScope: RulesScope
  includeAgentsMd: boolean
  includeClaudeMd: boolean
  rules: string[]
}

const defaultSettingsPrefs: SettingsPrefs = {
  linkOpenMode: '始终询问',
  mcpScope: 'local',
  mcpServers: [
    { id: 'playwright', name: 'Playwright', logo: 'P', status: 'ready', enabled: true },
    { id: 'chrome-devtools', name: 'Chrome DevTools MCP', logo: 'C', status: 'ready', enabled: true },
    { id: 'apple-shortcuts', name: 'apple shortcuts', logo: '', status: 'ready', enabled: true },
    { id: 'lark-mcp', name: 'lark-mcp', logo: 'L', status: 'ready', enabled: true }
  ],
  autoRunMcp: true,
  commandRunMode: '沙箱运行（支持白名单）',
  commandWhitelist: [],
  sandboxMode: '打开配置',
  editExternalFilesMode: '使用白名单',
  externalPathRules: [],
  browserAutomation: '内置浏览器',
  terminalAutoOpen: '不打开',
  notifyBanner: true,
  notifySound: true,
  notifyMenu: true,
  soundVolume: 100,
  multiThreadDownload: false,
  maxDownloadRetries: 3,
  rulesScope: 'local',
  includeAgentsMd: true,
  includeClaudeMd: false,
  rules: []
}

const modelProviders = ['Hermes 当前 Provider', 'Custom endpoint', 'Anthropic', 'OpenAI Codex', 'MiniMax', 'Xiaomi MiMo', 'OpenRouter', 'Kimi / Moonshot', 'Z.AI / GLM']

const providerModelPresets: Record<string, string[]> = {
  'Hermes 当前 Provider': ['mimo-v2.5-pro'],
  'Custom endpoint': ['mimo-v2.5-pro', 'mimo-v2-pro'],
  Anthropic: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-sonnet-4-5-20250929'],
  'OpenAI Codex': ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex'],
  MiniMax: ['MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2'],
  'Xiaomi MiMo': ['mimo-v2-pro', 'mimo-v2-omni', 'mimo-v2-flash'],
  OpenRouter: ['anthropic/claude-opus-4.6', 'anthropic/claude-sonnet-4.6', 'openai/gpt-5.4'],
  'Kimi / Moonshot': ['kimi-k2.5', 'kimi-k2-thinking', 'kimi-k2-turbo-preview'],
  'Z.AI / GLM': ['glm-5.1', 'glm-5', 'glm-5-turbo']
}

function App() {
  const [state, setState] = useState<AppState>(emptyState)
  const [viewMode, setViewMode] = useState<ViewMode>('tasks')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('default')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null | undefined>(undefined)
  const [prompt, setPrompt] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [stoppingTaskId, setStoppingTaskId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [newWorkspacePath, setNewWorkspacePath] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [detailTab, setDetailTab] = useState<'response' | 'tools' | 'logs' | 'errors'>('response')
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([])
  const [taskSearch, setTaskSearch] = useState('')
  const [taskScope, setTaskScope] = useState<'active' | 'archived' | 'all'>('active')
  const [taskWorkspaceScope, setTaskWorkspaceScope] = useState<'current' | 'all'>('current')
  const [selectedTaskTag, setSelectedTaskTag] = useState('all')
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [runtime, setRuntime] = useState<HermesRuntime | null>(null)
  const [hermesMcp, setHermesMcp] = useState<HermesMcpConfig | null>(null)
  const [mcpError, setMcpError] = useState<string | null>(null)
  const [mcpTestResults, setMcpTestResults] = useState<Record<string, HermesMcpTestResult>>({})
  const [mcpTestingId, setMcpTestingId] = useState<string | null>(null)
  const [mcpUpdatingId, setMcpUpdatingId] = useState<string | null>(null)
  const [mcpDeletingId, setMcpDeletingId] = useState<string | null>(null)
  const [mcpToolUpdatingId, setMcpToolUpdatingId] = useState<string | null>(null)
  const [mcpServeStatus, setMcpServeStatus] = useState<HermesMcpServeStatus | null>(null)
  const [mcpServeUpdating, setMcpServeUpdating] = useState(false)
  const [mcpServeError, setMcpServeError] = useState<string | null>(null)
  const [mcpMarketplaceOpen, setMcpMarketplaceOpen] = useState(false)
  const [manualMcpOpen, setManualMcpOpen] = useState(false)
  const [editingMcp, setEditingMcp] = useState<HermesMcpConfig['servers'][number] | null>(null)
  const [mcpRecommendations, setMcpRecommendations] = useState<HermesMcpRecommendations | null>(null)
  const [mcpRecommendationsLoading, setMcpRecommendationsLoading] = useState(false)
  const [mcpRecommendationsError, setMcpRecommendationsError] = useState<string | null>(null)
  const [backgroundStatus, setBackgroundStatus] = useState<BackgroundServiceStatus | null>(null)
  const [backgroundUpdating, setBackgroundUpdating] = useState(false)
  const [backgroundError, setBackgroundError] = useState<string | null>(null)
  const [skills, setSkills] = useState<Skill[]>([])
  const [customizeTab, setCustomizeTab] = useState<'skills' | 'connectors'>('skills')
  const [skillTab, setSkillTab] = useState<'market' | 'installed'>('installed')
  const [skillQuery, setSkillQuery] = useState('')
  const [skillNotice, setSkillNotice] = useState<string | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [skillFiles, setSkillFiles] = useState<SkillFile[]>([])
  const [selectedSkillFile, setSelectedSkillFile] = useState<SkillFile | null>(null)
  const [skillFileContent, setSkillFileContent] = useState('')
  const [skillFileError, setSkillFileError] = useState<string | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [selectedModelId, setSelectedModelId] = useState('auto')
  const [hermesModel, setHermesModel] = useState<HermesModelOverview | null>(null)
  const [hermesModelUpdating, setHermesModelUpdating] = useState<string | null>(null)
  const [hermesModelError, setHermesModelError] = useState<string | null>(null)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [modelPanelOpen, setModelPanelOpen] = useState(false)
  const [newModelId, setNewModelId] = useState('')
  const [newModelLabel, setNewModelLabel] = useState('')
  const [newModelProvider, setNewModelProvider] = useState('')
  const [modelNotice, setModelNotice] = useState<string | null>(null)
  const [composerSkillNames, setComposerSkillNames] = useState<string[]>([])
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('account')
  const [language, setLanguage] = useState('简体中文')
  const [theme, setTheme] = useState('亮色')
  const [privacyMode, setPrivacyMode] = useState(false)
  const [settingsPrefs, setSettingsPrefs] = useState<SettingsPrefs>(defaultSettingsPrefs)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const skillFileInputRef = useRef<HTMLInputElement | null>(null)
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null)
  const dragDepthRef = useRef(0)

  const refresh = async () => {
    const next = await getState()
    setState(next)
    if (selectedTaskId === undefined && next.tasks.length > 0) {
      setSelectedTaskId(next.tasks[0].id)
    }
    if (!next.workspaces.some((workspace) => workspace.id === selectedWorkspaceId)) {
      setSelectedWorkspaceId(next.workspaces[0]?.id ?? 'default')
    }
  }

  const refreshSkills = async () => {
    const nextSkills = await listSkills()
    setSkills(nextSkills)
  }

  const refreshModels = async () => {
    const nextModels = await listModels()
    setModels(nextModels.models)
    setSelectedModelId(nextModels.selectedModelId)
    setHermesModel(nextModels.hermes)
  }

  const refreshHermesMcp = async () => {
    setMcpError(null)
    try {
      setHermesMcp(await getHermesMcpConfig())
    } catch (cause) {
      setMcpError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const refreshMcpRecommendationsState = async () => {
    setMcpRecommendationsError(null)
    try {
      setMcpRecommendations(await getHermesMcpRecommendations())
    } catch (cause) {
      setMcpRecommendationsError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function handleRefreshMcpRecommendationsWithAi() {
    setMcpRecommendationsLoading(true)
    setMcpRecommendationsError(null)
    try {
      setMcpRecommendations(await refreshHermesMcpRecommendationsWithAi())
    } catch (cause) {
      setMcpRecommendationsError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setMcpRecommendationsLoading(false)
    }
  }

  async function refreshBackgroundStatus() {
    setBackgroundError(null)
    try {
      setBackgroundStatus(await getBackgroundStatus())
    } catch (cause) {
      setBackgroundError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function refreshMcpServeStatus() {
    setMcpServeError(null)
    try {
      setMcpServeStatus(await getHermesMcpServeStatus())
    } catch (cause) {
      setMcpServeError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function handleToggleMcpServe(shouldRun: boolean) {
    setMcpServeUpdating(true)
    setMcpServeError(null)
    try {
      setMcpServeStatus(shouldRun ? await startHermesMcpServe() : await stopHermesMcpServe())
      window.setTimeout(() => void refreshMcpServeStatus(), 600)
    } catch (cause) {
      setMcpServeError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setMcpServeUpdating(false)
    }
  }

  async function handleToggleBackgroundServices(enabled: boolean) {
    setBackgroundUpdating(true)
    setBackgroundError(null)
    try {
      setBackgroundStatus(enabled ? await installBackgroundServices() : await uninstallBackgroundServices())
    } catch (cause) {
      setBackgroundError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBackgroundUpdating(false)
    }
  }

  async function handleTestMcpServer(serverId: string) {
    setMcpTestingId(serverId)
    try {
      const result = await testHermesMcpServer(serverId)
      setMcpTestResults((current) => ({ ...current, [serverId]: result }))
    } catch (cause) {
      const result: HermesMcpTestResult = {
        serverId,
        ok: false,
        elapsedMs: 0,
        output: '',
        error: cause instanceof Error ? cause.message : String(cause),
        testedAt: new Date().toISOString()
      }
      setMcpTestResults((current) => ({ ...current, [serverId]: result }))
    } finally {
      setMcpTestingId(null)
    }
  }

  function handleMcpInstalled(result: HermesMcpInstallResult) {
    setHermesMcp(result.config)
    if (result.testResult) {
      setMcpTestResults((current) => ({ ...current, [result.installName]: result.testResult! }))
    }
  }

  const selectedWorkspace = useMemo(
    () => state.workspaces.find((workspace) => workspace.id === selectedWorkspaceId),
    [selectedWorkspaceId, state.workspaces]
  )

  const selectedTask = useMemo(
    () => (selectedTaskId ? state.tasks.find((task) => task.id === selectedTaskId) : undefined),
    [selectedTaskId, state.tasks]
  )

  const runningTask = state.tasks.find((task) => task.status === 'running')
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? models[0] ?? {
    id: 'auto',
    label: 'Hermes 默认模型',
    builtIn: true
  }

  const filteredTasks = useMemo(() => {
    const keyword = taskSearch.trim().toLowerCase()
    return state.tasks.filter((task) => {
      if (taskWorkspaceScope === 'current' && task.workspaceId !== selectedWorkspaceId) return false
      if (taskScope === 'active' && task.archivedAt) return false
      if (taskScope === 'archived' && !task.archivedAt) return false
      if (selectedTaskTag !== 'all' && !(task.tags ?? []).includes(selectedTaskTag)) return false
      if (!keyword) return true
      return `${task.title} ${task.prompt} ${task.status} ${task.hermesSessionId ?? ''} ${(task.tags ?? []).join(' ')}`.toLowerCase().includes(keyword)
    })
  }, [state.tasks, taskSearch, taskScope, taskWorkspaceScope, selectedWorkspaceId, selectedTaskTag])

  const sidebarRecentTasks = useMemo(() => {
    return state.tasks
      .filter((task) => !task.archivedAt)
      .slice()
      .sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
        return b.updatedAt.localeCompare(a.updatedAt)
      })
      .slice(0, 12)
  }, [state.tasks])

  const taskGroups = useMemo(() => {
    return state.workspaces
      .map((workspace) => ({
        workspace,
        tasks: filteredTasks.filter((task) => task.workspaceId === workspace.id)
      }))
      .filter((group) => group.tasks.length > 0 || (taskWorkspaceScope === 'current' && group.workspace.id === selectedWorkspaceId))
  }, [filteredTasks, state.workspaces, taskWorkspaceScope, selectedWorkspaceId])

  const scopedTasks = state.tasks.filter((task) =>
    taskWorkspaceScope === 'current' ? task.workspaceId === selectedWorkspaceId : true
  )
  const scopeFilteredTasks = scopedTasks.filter((task) => {
    if (taskScope === 'active' && task.archivedAt) return false
    if (taskScope === 'archived' && !task.archivedAt) return false
    return true
  })
  const activeTaskCount = scopedTasks.filter((task) => !task.archivedAt).length
  const archivedTaskCount = scopedTasks.filter((task) => task.archivedAt).length

  useEffect(() => {
    void refresh().catch((cause) => setError(cause.message))
    const interval = window.setInterval(() => {
      void refresh().catch(() => undefined)
    }, runningTask ? 900 : 1800)
    return () => window.clearInterval(interval)
  }, [Boolean(runningTask)])

  useEffect(() => {
    if (!selectedTaskId || selectedTask?.status !== 'running') return

    const source = new EventSource(taskStreamUrl(selectedTaskId))
    source.addEventListener('task', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { task?: Task }
        if (!payload.task) return
        setState((current) => mergeStreamedTask(current, payload.task!))
      } catch {
        // Ignore malformed SSE payloads; the polling fallback will refresh state.
      }
    })
    source.addEventListener('task.deleted', () => {
      void refresh().catch(() => undefined)
    })

    return () => source.close()
  }, [selectedTaskId, selectedTask?.status])

  useEffect(() => {
    if (!selectedWorkspaceId) return
    void listWorkspaceFiles(selectedWorkspaceId)
      .then(setWorkspaceFiles)
      .catch(() => setWorkspaceFiles([]))
  }, [selectedWorkspaceId, state.artifacts.length])

  useEffect(() => {
    void refreshRuntime()
    void refreshHermesMcp()
    void refreshMcpServeStatus()
    void refreshMcpRecommendationsState()
    void refreshBackgroundStatus()
    void refreshSkills().catch(() => undefined)
    void refreshModels().catch(() => undefined)
  }, [])

  function focusComposer() {
    window.requestAnimationFrame(() => {
      const input = promptInputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    })
  }

  async function submitPrompt() {
    const nextPrompt = prompt.trim()
    if (!nextPrompt || !selectedWorkspace || isSubmitting || runningTask) return
    setIsSubmitting(true)
    setError(null)
    try {
      const activeTask = selectedTask?.status === 'running' ? null : selectedTask
      const taskSkillNames = activeTask?.skillNames?.length ? activeTask.skillNames : composerSkillNames
      const task = activeTask
        ? await sendTaskMessage(activeTask.id, nextPrompt, selectedModelId, taskSkillNames).then(() => activeTask)
        : await createTask(selectedWorkspace.id, nextPrompt, selectedModelId, taskSkillNames)
      setPrompt('')
      setComposerSkillNames([])
      setSelectedTaskId(task.id)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    await submitPrompt()
  }

  function handlePromptKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void submitPrompt()
  }

  async function handleStop(task: Task) {
    if (stoppingTaskId) return
    try {
      setStoppingTaskId(task.id)
      await stopTask(task.id)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setStoppingTaskId(null)
    }
  }

  async function handleDeleteTask(task: Task) {
    const confirmed = window.confirm('只删除 Hermes Cowork 中的任务记录，不删除工作区文件。确定删除吗？')
    if (!confirmed) return
    await deleteTask(task.id)
    setSelectedTaskId(null)
    await refresh()
  }

  async function handleToggleSkill(skill: Skill) {
    setSkillNotice(null)
    const nextEnabled = !skill.enabled
    await toggleSkill(skill.id, nextEnabled)
    await refreshSkills()
    setSelectedSkill((current) => current?.id === skill.id ? { ...current, enabled: nextEnabled } : current)
  }

  async function handleSkillUpload(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setSkillNotice(null)
    try {
      await uploadSkill(file)
      await refreshSkills()
      setSkillTab('installed')
      setSkillNotice(`已上传 ${file.name}`)
    } catch (cause) {
      setSkillNotice(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function handleOpenSkill(skill: Skill) {
    setSelectedSkill(skill)
    setSkillFiles([])
    setSelectedSkillFile(null)
    setSkillFileContent('')
    setSkillFileError(null)
    try {
      const files = await listSkillFiles(skill.id)
      setSkillFiles(files)
      const firstFile = files.find((file) => file.relativePath === 'SKILL.md') ?? files.find((file) => file.type === 'file')
      if (firstFile) {
        await handleSelectSkillFile(skill.id, firstFile)
      }
    } catch (cause) {
      setSkillFileError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function handleSelectSkillFile(skillId: string, file: SkillFile) {
    setSelectedSkillFile(file)
    setSkillFileContent('')
    setSkillFileError(null)
    if (file.type === 'directory') return
    if (!file.previewable) {
      setSkillFileError('这个文件暂不支持文本预览。')
      return
    }
    try {
      setSkillFileContent(await readSkillFile(skillId, file.relativePath))
    } catch (cause) {
      setSkillFileError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function handleSelectModel(model: ModelOption) {
    setModelNotice(null)
    await selectModel(model.id)
    setSelectedModelId(model.id)
    setModelMenuOpen(false)
    await refreshModels()
  }

  async function handleSetHermesDefaultModel(modelId: string, provider?: string) {
    setHermesModelUpdating(`${provider ?? 'current'}:${modelId}`)
    setHermesModelError(null)
    try {
      const response = await setHermesDefaultModel(modelId, provider)
      setModels(response.models)
      setSelectedModelId(response.selectedModelId)
      setHermesModel(response.hermes)
      setModelNotice(`Hermes 默认模型已更新为 ${modelId}`)
    } catch (cause) {
      setHermesModelError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setHermesModelUpdating(null)
    }
  }

  async function handleSetHermesFallbackProviders(providers: string[]) {
    setHermesModelUpdating('fallbacks')
    setHermesModelError(null)
    try {
      const response = await setHermesFallbackProviders(providers)
      setModels(response.models)
      setSelectedModelId(response.selectedModelId)
      setHermesModel(response.hermes)
      setModelNotice(providers.length ? '备用模型列表已更新' : '已关闭备用模型')
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error))
      setHermesModelError(cause.message)
    } finally {
      setHermesModelUpdating(null)
    }
  }

  function handleUseSkill(skill: Skill) {
    setComposerSkillNames((current) => current.includes(skill.name) ? current : [...current, skill.name])
    setPrompt((current) => {
      const instruction = `请使用 ${skill.name} skill 完成这个任务：`
      return current.trim() ? current : instruction
    })
    setSelectedTaskId(null)
    setViewMode('tasks')
    setSelectedSkill(null)
    focusComposer()
  }

  async function handleAddModel(event: FormEvent) {
    event.preventDefault()
    const id = newModelId.trim() || newModelLabel.trim()
    if (!id) return
    setModelNotice(null)
    try {
      const model = await addModel({
        id,
        label: newModelLabel.trim() || id,
        provider: hermesProviderId(newModelProvider) || undefined,
        description: '用户添加的模型选项'
      })
      setNewModelId('')
      setNewModelLabel('')
      setNewModelProvider('')
      setModelPanelOpen(false)
      setModelMenuOpen(false)
      setModelNotice(`已切换到 ${model.label}`)
      await refreshModels()
    } catch (cause) {
      setModelNotice(cause instanceof Error ? cause.message : String(cause))
    }
  }

  function updateSettingsPref<K extends keyof SettingsPrefs>(key: K, value: SettingsPrefs[K]) {
    setSettingsPrefs((current) => ({ ...current, [key]: value }))
  }

  async function handleToggleMcpServer(serverId: string, enabled: boolean) {
    setMcpUpdatingId(serverId)
    setMcpError(null)
    try {
      setHermesMcp(await setHermesMcpServerEnabled(serverId, enabled))
    } catch (cause) {
      setMcpError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setMcpUpdatingId(null)
    }
  }

  async function handleDeleteMcpServer(serverId: string) {
    if (!window.confirm(`确定删除 MCP 服务「${serverId}」吗？删除前会自动备份 Hermes 配置。`)) return
    setMcpDeletingId(serverId)
    setMcpError(null)
    try {
      setHermesMcp(await removeHermesMcpServer(serverId))
      setMcpTestResults((current) => {
        const next = { ...current }
        delete next[serverId]
        return next
      })
    } catch (cause) {
      setMcpError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setMcpDeletingId(null)
    }
  }

  async function handleManualMcpSubmit(config: HermesMcpManualConfigRequest) {
    setMcpUpdatingId(config.name)
    setMcpError(null)
    try {
      const result = await configureHermesMcpServer(config)
      handleMcpInstalled(result)
      setManualMcpOpen(false)
    } catch (cause) {
      setMcpError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setMcpUpdatingId(null)
    }
  }

  async function handleEditMcpSubmit(config: HermesMcpManualConfigRequest) {
    if (!editingMcp) return
    setMcpUpdatingId(editingMcp.id)
    setMcpError(null)
    try {
      const result = await updateHermesMcpServer(editingMcp.id, config)
      setHermesMcp(result.config)
      if (result.testResult) {
        setMcpTestResults((current) => ({ ...current, [result.serverId]: result.testResult! }))
      }
      setEditingMcp(null)
    } catch (cause) {
      setMcpError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setMcpUpdatingId(null)
    }
  }

  async function handleSetMcpToolSelection(serverId: string, mode: 'all' | 'include' | 'exclude', tools: string[]) {
    setMcpToolUpdatingId(serverId)
    setMcpError(null)
    try {
      const result = await setHermesMcpServerTools(serverId, { mode, tools })
      setHermesMcp(result.config)
    } catch (cause) {
      setMcpError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setMcpToolUpdatingId(null)
    }
  }

  function handleAddSettingsRule(rule: string) {
    const nextRule = rule.trim()
    if (!nextRule) return
    setSettingsPrefs((current) => ({
      ...current,
      rules: current.rules.includes(nextRule) ? current.rules : [...current.rules, nextRule]
    }))
  }

  async function handlePinTask(task: Task) {
    setError(null)
    try {
      await pinTask(task.id, !task.pinned)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function handleArchiveTask(task: Task) {
    setError(null)
    try {
      const shouldArchive = !task.archivedAt
      await archiveTask(task.id, shouldArchive)
      if (selectedTaskId === task.id && shouldArchive && taskScope === 'active') {
        setSelectedTaskId(null)
      }
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function handleToggleTag(task: Task, tag: string) {
    setError(null)
    const currentTags = task.tags ?? []
    const nextTags = currentTags.includes(tag)
      ? currentTags.filter((item) => item !== tag)
      : [...currentTags, tag]
    try {
      await setTaskTags(task.id, nextTags)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function handleAddWorkspace(event: FormEvent) {
    event.preventDefault()
    if (!newWorkspaceName.trim() || !newWorkspacePath.trim()) return
    setError(null)
    try {
      const workspace = await addWorkspace(newWorkspaceName.trim(), newWorkspacePath.trim())
      setSelectedWorkspaceId(workspace.id)
      setWorkspacePanelOpen(false)
      setNewWorkspaceName('')
      setNewWorkspacePath('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function handleUploadFiles(files: File[]) {
    if (!selectedWorkspace) {
      setError('请先选择一个授权工作区。')
      return
    }
    const uploadableFiles = files.filter((file) => file.size >= 0)
    if (!uploadableFiles.length) return
    setError(null)
    setUploadNotice(`正在上传 ${uploadableFiles.length} 个文件到 ${selectedWorkspace.name}...`)
    try {
      for (const file of uploadableFiles) {
        await uploadFile(selectedWorkspace.id, file)
      }
      await refresh()
      await refreshWorkspaceFiles()
      setUploadNotice(`已上传 ${uploadableFiles.length} 个文件到 ${selectedWorkspace.name}`)
    } catch (cause) {
      setUploadNotice(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  function handleDragEnter(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDraggingFiles(true)
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = selectedWorkspace ? 'copy' : 'none'
    setIsDraggingFiles(true)
  }

  function handleDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDraggingFiles(false)
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDraggingFiles(false)
    void handleUploadFiles(Array.from(event.dataTransfer.files))
  }

  async function handlePreview(artifact: Artifact) {
    setError(null)
    try {
      const body = await previewArtifact(artifact.id)
      setPreview({ title: artifact.name, body, kind: previewKind(artifact.name) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function handlePreviewWorkspaceFile(file: WorkspaceFile) {
    if (!selectedWorkspace) return
    setError(null)
    try {
      const body = await previewWorkspaceFile(selectedWorkspace.id, file.relativePath)
      setPreview({ title: file.relativePath, body, kind: previewKind(file.relativePath) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function handleRevealWorkspace() {
    if (!selectedWorkspace) return
    setError(null)
    try {
      await revealWorkspace(selectedWorkspace.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function handleRevealArtifact(artifact: Artifact) {
    setError(null)
    try {
      await revealArtifact(artifact.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function handleRevealWorkspaceFile(file: WorkspaceFile) {
    if (!selectedWorkspace) return
    setError(null)
    try {
      await revealWorkspaceFile(selectedWorkspace.id, file.relativePath)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function refreshWorkspaceFiles() {
    if (!selectedWorkspaceId) return
    try {
      setWorkspaceFiles(await listWorkspaceFiles(selectedWorkspaceId))
    } catch {
      setWorkspaceFiles([])
    }
  }

  async function refreshRuntime() {
    try {
      setRuntime(await getHermesRuntime())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  function insertFileContext(file: WorkspaceFile) {
    const snippet = `请读取这个文件并作为上下文：${file.path}`
    setPrompt((current) => (current.trim() ? `${current.trim()}\n\n${snippet}` : snippet))
  }

  return (
    <div
      className={[
        'app-shell',
        isDraggingFiles ? 'dragging-files' : '',
        viewMode !== 'tasks' ? 'skills-mode' : ''
      ].filter(Boolean).join(' ')}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFiles && (
        <div className="drop-overlay">
          <div>
            <Upload size={26} />
            <strong>拖放到当前工作区</strong>
            <span>{selectedWorkspace?.name ?? '请选择一个授权工作区'}</span>
          </div>
        </div>
      )}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Bot size={19} />
          </div>
          <div>
            <strong>Hermes Cowork</strong>
            <span>本机智能体工作台</span>
          </div>
        </div>

        <button
          className="primary-nav"
          onClick={() => {
            setViewMode('tasks')
            setSelectedTaskId(null)
            focusComposer()
          }}
        >
          <MessageSquarePlus size={17} />
          新建任务
        </button>

        <button
          className={viewMode === 'search' ? 'secondary-nav active' : 'secondary-nav'}
          onClick={() => setViewMode('search')}
        >
          <Search size={17} />
          搜索
        </button>

        <button
          className={viewMode === 'scheduled' ? 'secondary-nav active' : 'secondary-nav'}
          onClick={() => setViewMode('scheduled')}
        >
          <Clock3 size={17} />
          定时任务
        </button>

        <button
          className={viewMode === 'projects' ? 'secondary-nav active' : 'secondary-nav'}
          onClick={() => setViewMode('projects')}
        >
          <Folder size={17} />
          项目
        </button>

        <button
          className={viewMode === 'dispatch' ? 'secondary-nav active' : 'secondary-nav'}
          onClick={() => setViewMode('dispatch')}
        >
          <Globe2 size={17} />
          调度
        </button>

        <button
          className={viewMode === 'ideas' ? 'secondary-nav active' : 'secondary-nav'}
          onClick={() => setViewMode('ideas')}
        >
          <BookOpen size={17} />
          任务模板
        </button>

        <button
          className={viewMode === 'skills' ? 'secondary-nav active' : 'secondary-nav'}
          onClick={() => {
            setViewMode('skills')
            void refreshSkills().catch(() => undefined)
            void refreshHermesMcp()
          }}
        >
          <Hammer size={17} />
          自定义
        </button>

        <div className="sidebar-section tasks-section">
          <div className="section-title">
            <span>最近任务</span>
          </div>
          <div className="recent-task-list">
            {state.tasks.length === 0 && <p className="empty-copy">还没有最近任务。</p>}
            {sidebarRecentTasks.map((task) => (
              <SidebarRecentTaskRow
                key={task.id}
                task={task}
                active={task.id === selectedTask?.id}
                onSelect={() => {
                  setViewMode('tasks')
                  setSelectedTaskId(task.id)
                  setSelectedWorkspaceId(task.workspaceId)
                }}
              />
            ))}
          </div>
          <p className="local-task-note">这些任务只在本机运行，不会同步到其他设备。</p>
        </div>

        <div className="sidebar-foot">
          {accountMenuOpen && (
            <div className="account-popover">
              <div className="account-popover-user">
                <div className="account-avatar">
                  <User size={16} />
                </div>
                <strong>Lucas</strong>
              </div>
              <button
                onClick={() => {
                  setSettingsTab('account')
                  setSettingsOpen(true)
                  setAccountMenuOpen(false)
                }}
              >
                管理账号
                <ExternalLink size={13} />
              </button>
              <button>
                <span>语言</span>
                <em>{language}</em>
                <ChevronDown size={13} />
              </button>
              <button>
                <span>主题</span>
                <em>{theme}</em>
                <ChevronDown size={13} />
              </button>
              <button
                onClick={() => {
                  setSettingsOpen(true)
                  setAccountMenuOpen(false)
                }}
              >
                设置
              </button>
              <button className="account-logout" onClick={() => setAccountMenuOpen(false)}>
                退出登录
              </button>
            </div>
          )}
          <button className="sidebar-user-button" onClick={() => setAccountMenuOpen((open) => !open)}>
            <span className="account-avatar">
              <User size={15} />
            </span>
            <strong>Lucas</strong>
            <span className="local-badge">本机</span>
          </button>
          <span>Hermes 命令行</span>
        </div>
      </aside>

      <main className={viewMode === 'tasks' ? 'workspace-main' : 'skills-main'}>
        {viewMode === 'skills' ? (
          <SkillsView
            skills={skills}
            customizeTab={customizeTab}
            tab={skillTab}
            query={skillQuery}
            notice={skillNotice}
            connectors={hermesMcp?.servers ?? []}
            mcpConfigPath={hermesMcp?.configPath}
            mcpError={mcpError}
            onCustomizeTabChange={setCustomizeTab}
            onTabChange={setSkillTab}
            onQueryChange={setSkillQuery}
            onToggleSkill={(skill) => void handleToggleSkill(skill)}
            onOpenSkill={(skill) => void handleOpenSkill(skill)}
            onRefresh={() => void refreshSkills().catch((cause) => setSkillNotice(cause.message))}
            onUploadClick={() => skillFileInputRef.current?.click()}
            onRefreshMcp={() => void refreshHermesMcp()}
            onOpenMcpSettings={() => {
              setSettingsTab('mcp')
              setSettingsOpen(true)
            }}
            onOpenMcpMarketplace={() => setMcpMarketplaceOpen(true)}
          />
        ) : viewMode === 'search' ? (
          <SearchTasksView
            tasks={state.tasks}
            query={taskSearch}
            onQueryChange={setTaskSearch}
            onOpenTask={(task) => {
              setViewMode('tasks')
              setSelectedTaskId(task.id)
            }}
          />
        ) : viewMode === 'scheduled' ? (
          <ScheduledTasksView
            backgroundStatus={backgroundStatus}
            backgroundUpdating={backgroundUpdating}
            backgroundError={backgroundError}
            recommendations={mcpRecommendations}
            recommendationsLoading={mcpRecommendationsLoading}
            recommendationsError={mcpRecommendationsError}
            onToggleBackground={(enabled) => void handleToggleBackgroundServices(enabled)}
            onGenerateReport={() => void handleRefreshMcpRecommendationsWithAi()}
          />
        ) : viewMode === 'projects' ? (
          <ProjectsView
            workspaces={state.workspaces}
            tasks={state.tasks}
            selectedWorkspaceId={selectedWorkspaceId}
            onSelect={(workspace) => {
              setSelectedWorkspaceId(workspace.id)
              setViewMode('tasks')
            }}
            onAdd={() => setWorkspacePanelOpen(true)}
            onReveal={(workspace) => {
              setError(null)
              void revealWorkspace(workspace.id).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
            }}
          />
        ) : viewMode === 'dispatch' ? (
          <DispatchView
            connectors={hermesMcp?.servers ?? []}
            skills={skills}
            onOpenConnectors={() => {
              setCustomizeTab('connectors')
              setViewMode('skills')
              void refreshHermesMcp()
            }}
            onOpenMcpSettings={() => {
              setSettingsTab('mcp')
              setSettingsOpen(true)
            }}
          />
        ) : viewMode === 'ideas' ? (
          <IdeasView
            examples={examples}
            onUsePrompt={(nextPrompt) => {
              setPrompt(nextPrompt)
              setViewMode('tasks')
              setSelectedTaskId(null)
              window.setTimeout(() => focusComposer(), 0)
            }}
          />
        ) : (
          <>
        <header className="topbar">
          <div>
            <h1>{selectedTask ? selectedTask.title : '新建 Hermes 任务'}</h1>
            <p>
              {selectedWorkspace ? selectedWorkspace.path : '选择一个授权工作区'} · 本机运行 · 127.0.0.1
            </p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button" onClick={() => void handleRevealWorkspace()}>
              <FolderOpen size={16} />
              打开目录
            </button>
            <button className="ghost-button" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              上传附件
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? [])
                if (files.length) void handleUploadFiles(files)
                event.currentTarget.value = ''
              }}
            />
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}
        {uploadNotice && !error && <div className="upload-banner">{uploadNotice}</div>}

        <section className="conversation">
          {!selectedTask && (
            <div className="welcome-panel">
              <h2><span>Hermes</span> Cowork</h2>
              <p>多场景办公任务，交给 Hermes 搞定</p>
              <div className="example-grid">
                {examples.map((item) => (
                  <button
                    key={item.title}
                    onClick={() => {
                      setPrompt(item.prompt)
                      focusComposer()
                    }}
                  >
                    <TemplateIcon name={item.icon} />
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(selectedTask?.messages ?? []).map((message) => (
            <FragmentWithTrace
              key={message.id}
              message={message}
              task={selectedTask}
              traceAfterMessageId={latestUserMessageId(selectedTask)}
            />
          ))}

          {selectedTask?.status === 'running' && (
            <article className="message assistant pending">
              <div className="message-meta message-meta-action">
                <div>
                  Hermes
                  <span>运行中</span>
                </div>
                <button
                  className="inline-stop-button"
                  type="button"
                  onClick={() => void handleStop(selectedTask)}
                  disabled={stoppingTaskId === selectedTask.id}
                >
                  <Square size={12} />
                  {stoppingTaskId === selectedTask.id ? '停止中' : '停止任务'}
                </button>
              </div>
              {selectedTask.liveResponse ? (
                <div className="message-body live-output">{selectedTask.liveResponse}</div>
              ) : (
                <div className="pending-line">
                  <Loader2 size={16} className="spin" />
                  Hermes 正在授权工作区内执行任务...
                </div>
              )}
            </article>
          )}
        </section>

        <form className="composer" onSubmit={handleSubmit}>
          {composerSkillNames.length > 0 && (
            <div className="composer-skill-strip">
              <span>本次预载技能</span>
              {composerSkillNames.map((name) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => setComposerSkillNames((current) => current.filter((item) => item !== name))}
                >
                  <BookOpen size={13} />
                  {name}
                  <XCircle size={12} />
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={promptInputRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handlePromptKeyDown}
            placeholder="告诉 Hermes 你要做什么。附件和文件会放在当前授权工作区中。"
            aria-label="任务输入框，按 Enter 发送，按 Shift 加 Enter 换行"
            rows={4}
          />
          <div className="composer-bar">
            <div className="composer-context">
              <Folder size={15} />
              <span>{selectedWorkspace?.name ?? '未选择工作区'}</span>
              <ChevronDown size={14} />
            </div>
            <div className="composer-actions">
              <div className="model-picker">
                {modelMenuOpen && (
                  <div className="model-menu">
                    <div className="model-menu-title">Hermes 模型</div>
                    {models.map((model) => (
                      <button
                        type="button"
                        className={model.id === selectedModelId ? 'active' : ''}
                        key={model.id}
                        onClick={() => void handleSelectModel(model)}
                      >
                        <Bot size={14} />
                        <div>
                          <strong>{model.label}</strong>
                          <span>{model.description ?? model.provider ?? model.id}</span>
                        </div>
                        {model.id === selectedModelId && <CheckCircle2 size={14} />}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="add-model-option"
                      onClick={() => {
                        setModelPanelOpen(true)
                        setModelMenuOpen(false)
                      }}
                    >
                      <Settings size={14} />
                      添加模型
                    </button>
                  </div>
                )}
                <button type="button" className="model-trigger" onClick={() => setModelMenuOpen((open) => !open)}>
                  <span>{selectedModel.label}</span>
                  <ChevronDown size={14} />
                </button>
              </div>
              <button className="send-button" disabled={isSubmitting || !prompt.trim() || Boolean(runningTask)}>
                {isSubmitting ? <Loader2 size={16} className="spin" /> : <Plus size={17} />}
                发送给 Hermes
              </button>
            </div>
          </div>
          {modelNotice && <div className="composer-notice">{modelNotice}</div>}
        </form>
          </>
        )}
      </main>

      {viewMode === 'tasks' && (
      <aside className="inspector">
        <div className="inspector-title">
          <PanelRight size={17} />
          任务上下文
        </div>

        <TaskSummaryCard task={selectedTask} workspace={selectedWorkspace} />

        <section className="inspector-card todo-card">
          <div className="card-heading-row">
            <h3>任务进度</h3>
            {selectedTask && (
              <div className="progress-heading-actions">
                <div className={`status-pill compact ${selectedTask.status}`}>
                  <StatusIcon status={selectedTask.status} />
                  {statusLabel(selectedTask.status)}
                </div>
                {selectedTask.status === 'running' && (
                  <button
                    type="button"
                    className="mini-danger-button"
                    onClick={() => void handleStop(selectedTask)}
                    disabled={stoppingTaskId === selectedTask.id}
                  >
                    <Square size={12} />
                    停止
                  </button>
                )}
              </div>
            )}
          </div>
          {selectedTask ? (
            <TodoSteps task={selectedTask} />
          ) : (
            <EmptyInspectorState title="暂无待办" detail="任务运行后，进度会显示在这里" />
          )}
        </section>

        <section className="inspector-card">
          <h3>最近操作</h3>
          {selectedTask ? (
            <RecentOperations task={selectedTask} />
          ) : (
            <EmptyInspectorState title="暂无操作" detail="Hermes 的搜索、读写文件和工具调用会显示在这里" />
          )}
        </section>

        <section className="inspector-card">
          <h3>任务产物</h3>
          {!(selectedTask?.artifacts ?? []).length && (
            <EmptyInspectorState title="暂无产物" detail="任务完成后，生成的文件会展示在这里" />
          )}
          <div className="artifact-list">
            {(selectedTask?.artifacts ?? []).map((artifact) => (
              <div className="artifact" key={artifact.id}>
                <FileArchive size={17} />
                <div>
                  <strong>{artifact.name}</strong>
                  <span>{artifact.relativePath}</span>
                </div>
                <button title="预览文本产物" onClick={() => void handlePreview(artifact)}>
                  <FileText size={15} />
                </button>
                <button title="在 Finder 中显示" onClick={() => void handleRevealArtifact(artifact)}>
                  <FolderOpen size={15} />
                </button>
                <a title="下载" href={`/api/artifacts/${artifact.id}/download`}>
                  <Upload size={15} />
                </a>
              </div>
            ))}
          </div>
        </section>

        <section className="inspector-card reference-card">
          <h3>参考信息</h3>
          <ReferenceInfo task={selectedTask} workspaceFiles={workspaceFiles} />
          <details className="reference-files">
            <summary>工作区文件</summary>
            <WorkspaceFiles
              files={workspaceFiles}
              onUseFile={insertFileContext}
              onPreviewFile={(file) => void handlePreviewWorkspaceFile(file)}
              onRevealFile={(file) => void handleRevealWorkspaceFile(file)}
            />
          </details>
        </section>

        {selectedTask && (
          <details className="inspector-card inspector-details">
            <summary>任务操作</summary>
            <div className="task-tag-editor">
              <div className="tag-editor-title">
                <Tags size={13} />
                场景标签
              </div>
              <div className="tag-chip-list">
                {taskTagOptions.map((tag) => (
                  <button
                    className={(selectedTask.tags ?? []).includes(tag) ? 'active' : ''}
                    key={tag}
                    onClick={() => void handleToggleTag(selectedTask, tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            {selectedTask.status === 'running' && (
              <button className="danger-button" onClick={() => void handleStop(selectedTask)}>
                <Square size={14} />
                停止任务
              </button>
            )}
            <div className="status-actions">
              <a className="ghost-button export-button" href={taskExportUrl(selectedTask.id)}>
                <Download size={14} />
                导出 Markdown
              </a>
            </div>
            <button className="danger-button subtle" onClick={() => void handleDeleteTask(selectedTask)}>
              <Trash2 size={14} />
              删除任务记录
            </button>
          </details>
        )}

        <details className="inspector-card inspector-details debug-details">
          <summary>调试信息</summary>
          <div className="debug-section">
            <div className="card-heading-row">
              <h3>Hermes 运行时</h3>
              <button className="mini-button" onClick={() => void refreshRuntime()}>
                <RefreshCw size={13} />
                刷新
              </button>
            </div>
            <RuntimePanel runtime={runtime} />
          </div>
          {selectedTask && (
            <>
              <div className="debug-section">
                <h3>运行详情</h3>
                <div className="detail-tabs">
                  <button
                    className={detailTab === 'response' ? 'active' : ''}
                    onClick={() => setDetailTab('response')}
                  >
                    <Info size={14} />
                    正文
                  </button>
                  <button className={detailTab === 'tools' ? 'active' : ''} onClick={() => setDetailTab('tools')}>
                    <Wrench size={14} />
                    工具
                  </button>
                  <button className={detailTab === 'logs' ? 'active' : ''} onClick={() => setDetailTab('logs')}>
                    <Terminal size={14} />
                    日志
                  </button>
                  <button className={detailTab === 'errors' ? 'active' : ''} onClick={() => setDetailTab('errors')}>
                    <XCircle size={14} />
                    错误
                  </button>
                </div>
                <ExecutionPane task={selectedTask} tab={detailTab} />
              </div>
              <div className="debug-section">
                <h3>步骤时间线</h3>
                <EventTimeline events={selectedTask.events ?? []} />
              </div>
              <div className="debug-section">
                <h3>工具调用</h3>
                <ToolCards events={selectedTask.events ?? []} />
              </div>
            </>
          )}
        </details>
      </aside>
      )}

      <input
        ref={skillFileInputRef}
        type="file"
        accept=".md,text/markdown,text/plain"
        hidden
        onChange={(event) => {
          void handleSkillUpload(event.currentTarget.files)
          event.currentTarget.value = ''
        }}
      />

      {workspacePanelOpen && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={handleAddWorkspace}>
            <h2>添加授权文件夹</h2>
            <p>Hermes Cowork 只会把你显式添加的文件夹作为工作区传给 Hermes。</p>
            <label>
              名称
              <input value={newWorkspaceName} onChange={(event) => setNewWorkspaceName(event.target.value)} />
            </label>
            <label>
              本机路径
              <input
                value={newWorkspacePath}
                onChange={(event) => setNewWorkspacePath(event.target.value)}
                placeholder="/Users/lucas/Documents/..."
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setWorkspacePanelOpen(false)}>
                取消
              </button>
              <button className="send-button">
                <FolderPlus size={16} />
                添加
              </button>
            </div>
          </form>
        </div>
      )}

      {modelPanelOpen && (
        <div className="modal-backdrop model-backdrop">
          <form className="modal" onSubmit={handleAddModel}>
            <h2>添加模型</h2>
            <p>这里只保存模型路由名称，不保存 API 密钥；真正的密钥和默认模型仍跟随 Hermes 本机配置。</p>
            <label>
              服务商
              <select
                value={newModelProvider}
                onChange={(event) => {
                  setNewModelProvider(event.target.value)
                  setNewModelId('')
                  setNewModelLabel('')
                }}
              >
                <option value="">选择模型服务商</option>
                {modelProviders.map((provider) => <option key={provider}>{provider}</option>)}
              </select>
            </label>
            <label>
              模型
              <select
                value={newModelLabel}
                onChange={(event) => {
                  const value = event.target.value
                  setNewModelLabel(value)
                  setNewModelId(value)
                }}
                disabled={!newModelProvider}
              >
                <option value="">选择模型</option>
                {(providerModelPresets[newModelProvider] ?? []).map((model) => <option key={model}>{model}</option>)}
                <option value="custom">使用其他模型</option>
              </select>
            </label>
            {(newModelLabel === 'custom' || !newModelLabel) && (
              <label>
                自定义模型 ID
                <input
                  value={newModelId}
                  onChange={(event) => {
                    setNewModelId(event.target.value)
                    setNewModelLabel(event.target.value)
                  }}
                  placeholder="例如 gpt-5.4 或 claude-sonnet-4.5"
                />
              </label>
            )}
            <label>
              显示名称
              <input
                value={newModelLabel === 'custom' ? '' : newModelLabel}
                onChange={(event) => setNewModelLabel(event.target.value)}
                placeholder="留空则使用模型 ID"
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setModelPanelOpen(false)}>
                取消
              </button>
              <button className="send-button">
                <Plus size={16} />
                添加并切换
              </button>
            </div>
          </form>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop settings-backdrop">
          <SettingsModal
            tab={settingsTab}
            language={language}
            theme={theme}
            privacyMode={privacyMode}
            runtime={runtime}
            selectedModel={selectedModel}
            models={models}
            selectedModelId={selectedModelId}
            hermesModel={hermesModel}
            hermesModelUpdating={hermesModelUpdating}
            hermesModelError={hermesModelError}
            prefs={settingsPrefs}
            hermesMcp={hermesMcp}
            mcpError={mcpError}
            mcpTestResults={mcpTestResults}
            mcpTestingId={mcpTestingId}
            mcpUpdatingId={mcpUpdatingId}
            mcpDeletingId={mcpDeletingId}
            mcpToolUpdatingId={mcpToolUpdatingId}
            mcpRecommendations={mcpRecommendations}
            mcpRecommendationsLoading={mcpRecommendationsLoading}
            mcpRecommendationsError={mcpRecommendationsError}
            backgroundStatus={backgroundStatus}
            backgroundUpdating={backgroundUpdating}
            backgroundError={backgroundError}
            mcpServeStatus={mcpServeStatus}
            mcpServeUpdating={mcpServeUpdating}
            mcpServeError={mcpServeError}
            enabledSkillCount={skills.filter((skill) => skill.enabled).length}
            skillCount={skills.length}
            workspaceCount={state.workspaces.length}
            onTabChange={setSettingsTab}
            onClose={() => setSettingsOpen(false)}
            onLanguageChange={setLanguage}
            onThemeChange={setTheme}
            onPrivacyChange={setPrivacyMode}
            onPrefChange={updateSettingsPref}
            onToggleMcpServer={(serverId, enabled) => void handleToggleMcpServer(serverId, enabled)}
            onRefreshMcp={() => void refreshHermesMcp()}
            onTestMcpServer={(serverId) => void handleTestMcpServer(serverId)}
            onEditMcpServer={setEditingMcp}
            onSetMcpToolSelection={(serverId, mode, tools) => void handleSetMcpToolSelection(serverId, mode, tools)}
            onDeleteMcpServer={(serverId) => void handleDeleteMcpServer(serverId)}
            onOpenMcpMarketplace={() => setMcpMarketplaceOpen(true)}
            onOpenManualMcp={() => setManualMcpOpen(true)}
            onRefreshMcpRecommendationsWithAi={() => void handleRefreshMcpRecommendationsWithAi()}
            onToggleBackgroundServices={(enabled) => void handleToggleBackgroundServices(enabled)}
            onToggleMcpServe={(enabled) => void handleToggleMcpServe(enabled)}
            onRefreshMcpServe={() => void refreshMcpServeStatus()}
            onSelectModel={(model) => void handleSelectModel(model)}
            onSetHermesDefaultModel={(modelId, provider) => void handleSetHermesDefaultModel(modelId, provider)}
            onSetHermesFallbackProviders={(providers) => void handleSetHermesFallbackProviders(providers)}
            onRefreshModels={() => void refreshModels()}
            onAddRule={handleAddSettingsRule}
            onOpenAddModel={() => {
              setModelPanelOpen(true)
            }}
          />
        </div>
      )}

      {preview && (
        <div className="modal-backdrop">
          <PreviewModal preview={preview} onClose={() => setPreview(null)} />
        </div>
      )}

      {mcpMarketplaceOpen && (
        <div className="modal-backdrop model-backdrop">
          <McpMarketplaceModal
            onClose={() => setMcpMarketplaceOpen(false)}
            onInstalled={handleMcpInstalled}
            recommendations={mcpRecommendations}
          />
        </div>
      )}

      {editingMcp && (
        <div className="modal-backdrop model-backdrop">
          <ManualMcpModal
            mode="edit"
            initialServer={editingMcp}
            isSaving={mcpUpdatingId === editingMcp.id}
            onClose={() => setEditingMcp(null)}
            onSubmit={(config) => void handleEditMcpSubmit(config)}
          />
        </div>
      )}

      {manualMcpOpen && (
        <div className="modal-backdrop model-backdrop">
          <ManualMcpModal
            mode="create"
            isSaving={Boolean(mcpUpdatingId)}
            onClose={() => setManualMcpOpen(false)}
            onSubmit={(config) => void handleManualMcpSubmit(config)}
          />
        </div>
      )}

      {selectedSkill && (
        <div className="modal-backdrop">
          <SkillDetailModal
            skill={selectedSkill}
            files={skillFiles}
            selectedFile={selectedSkillFile}
            content={skillFileContent}
            error={skillFileError}
            onClose={() => setSelectedSkill(null)}
            onSelectFile={(file) => void handleSelectSkillFile(selectedSkill.id, file)}
            onToggle={() => void handleToggleSkill(selectedSkill)}
            onUseSkill={() => handleUseSkill(selectedSkill)}
          />
        </div>
      )}
    </div>
  )
}

function SkillsView({
  skills,
  customizeTab,
  tab,
  query,
  notice,
  connectors,
  mcpConfigPath,
  mcpError,
  onCustomizeTabChange,
  onTabChange,
  onQueryChange,
  onToggleSkill,
  onOpenSkill,
  onRefresh,
  onUploadClick,
  onRefreshMcp,
  onOpenMcpSettings,
  onOpenMcpMarketplace
}: {
  skills: Skill[]
  customizeTab: 'skills' | 'connectors'
  tab: 'market' | 'installed'
  query: string
  notice: string | null
  connectors: HermesMcpConfig['servers']
  mcpConfigPath?: string
  mcpError: string | null
  onCustomizeTabChange: (tab: 'skills' | 'connectors') => void
  onTabChange: (tab: 'market' | 'installed') => void
  onQueryChange: (value: string) => void
  onToggleSkill: (skill: Skill) => void
  onOpenSkill: (skill: Skill) => void
  onRefresh: () => void
  onUploadClick: () => void
  onRefreshMcp: () => void
  onOpenMcpSettings: () => void
  onOpenMcpMarketplace: () => void
}) {
  const normalizedQuery = query.trim().toLowerCase()
  const installedSkills = skills
  const marketSkills = skills.filter((skill) => skill.source === 'plugin' || skill.source === 'system')
  const activeSkills = (tab === 'installed' ? installedSkills : marketSkills).filter((skill) => {
    if (!normalizedQuery) return true
    return `${skill.name} ${skill.description} ${skill.source} ${skill.path}`.toLowerCase().includes(normalizedQuery)
  })
  const enabledCount = skills.filter((skill) => skill.enabled).length
  const sections = [
    {
      title: tab === 'market' ? '技能市场' : '内置与插件',
      skills: activeSkills.filter((skill) => skill.source === 'plugin' || skill.source === 'system')
    },
    {
      title: '来自用户',
      skills: activeSkills.filter((skill) => skill.source === 'user' || skill.source === 'uploaded')
    }
  ].filter((section) => section.skills.length)

  return (
    <section className="customize-page">
      <aside className="customize-sidebar">
        <button className={customizeTab === 'skills' ? 'active' : ''} onClick={() => onCustomizeTabChange('skills')}>
          <BookOpen size={15} />
          Skills
        </button>
        <button className={customizeTab === 'connectors' ? 'active' : ''} onClick={() => onCustomizeTabChange('connectors')}>
          <Plug size={15} />
          Connectors
        </button>
        <div className="customize-plugin-box">
          <strong>能力来源</strong>
          <span>Skills 负责专业工作方法；Connectors 负责把 Hermes 接到本机工具和外部服务。</span>
        </div>
      </aside>

      <div className="customize-content">
      <div className="skills-actions">
        {customizeTab === 'skills' ? (
          <>
            <button className="ghost-button" onClick={onRefresh}>
              <RefreshCw size={15} />
              刷新
            </button>
            <button className="send-button" onClick={onUploadClick}>
              <Plus size={16} />
              上传技能
            </button>
          </>
        ) : (
          <>
            <button className="ghost-button" onClick={onRefreshMcp}>
              <RefreshCw size={15} />
              刷新
            </button>
            <button className="send-button" onClick={onOpenMcpMarketplace}>
              <Plus size={16} />
              从市场添加
            </button>
          </>
        )}
      </div>

      <header className="skills-hero">
        <h1>{customizeTab === 'skills' ? 'Skills' : 'Connectors'}</h1>
        <p>
          {customizeTab === 'skills'
            ? '安装和管理技能，扩展 Hermes Cowork 的本机工作方法。'
            : '管理 Hermes 可调用的 MCP 服务，把本机文件、浏览器、飞书和数据工具连接进任务。'}
        </p>
      </header>

      {customizeTab === 'skills' ? (
        <>
        <div className="skills-toolbar">
        <div className="skills-tabs" role="tablist" aria-label="技能视图">
          <button className={tab === 'market' ? 'active' : ''} onClick={() => onTabChange('market')}>
            技能市场
          </button>
          <button className={tab === 'installed' ? 'active' : ''} onClick={() => onTabChange('installed')}>
            已安装 <span>{installedSkills.length}</span>
          </button>
        </div>
        <label className="skills-search">
          <Search size={15} />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索技能" />
        </label>
      </div>

      {notice && <div className="skill-notice">{notice}</div>}

      <div className="skills-summary">
        <div>
          <strong>{enabledCount}</strong>
          <span>已启用</span>
        </div>
        <div>
          <strong>{skills.length}</strong>
          <span>本机可用</span>
        </div>
        <div>
          <strong>{skills.filter((skill) => skill.source === 'user' || skill.source === 'uploaded').length}</strong>
          <span>来自用户</span>
        </div>
      </div>

      <div className="skills-content">
        {!activeSkills.length && <p className="muted-copy">没有匹配的技能。</p>}
        {sections.map((section) => (
          <section className="skill-section" key={section.title}>
            <h2>{section.title}</h2>
            <div className="skill-grid">
              {section.skills.map((skill) => (
                <article className="skill-card" key={skill.id}>
                  <button className="skill-open" onClick={() => onOpenSkill(skill)}>
                    <div className="skill-icon">
                      <BookOpen size={23} />
                    </div>
                    <div className="skill-card-body">
                      <div className="skill-card-head">
                        <strong>{skill.name}</strong>
                        <span>{sourceLabel(skill.source)}</span>
                      </div>
                      <p>{skill.description}</p>
                      <small title={skill.path}>{shortenSkillPath(skill.path)}</small>
                    </div>
                  </button>
                  <button
                    className={skill.enabled ? 'skill-switch enabled' : 'skill-switch'}
                    aria-label={`${skill.enabled ? '停用' : '启用'} ${skill.name}`}
                    aria-pressed={skill.enabled}
                    onClick={() => onToggleSkill(skill)}
                  >
                    <span />
                  </button>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
        </>
      ) : (
        <ConnectorsView
          connectors={connectors}
          configPath={mcpConfigPath}
          error={mcpError}
          onOpenSettings={onOpenMcpSettings}
        />
      )}
      </div>
    </section>
  )
}

function ConnectorsView({
  connectors,
  configPath,
  error,
  onOpenSettings
}: {
  connectors: HermesMcpConfig['servers']
  configPath?: string
  error: string | null
  onOpenSettings: () => void
}) {
  const enabledCount = connectors.filter((connector) => connector.enabled).length

  return (
    <div className="connectors-panel">
      <div className="connector-summary">
        <div>
          <strong>{connectors.length}</strong>
          <span>已安装连接器</span>
        </div>
        <div>
          <strong>{enabledCount}</strong>
          <span>已启用</span>
        </div>
        <div>
          <strong>{configPath ? 'Hermes' : '未连接'}</strong>
          <span>{configPath ?? '暂未读取到 MCP 配置'}</span>
        </div>
      </div>

      {error && <div className="settings-error-line">{error}</div>}

      <div className="connector-list">
        {!connectors.length && <p className="muted-copy">暂未读取到 MCP 连接器。可以从市场添加，或在设置里手动配置。</p>}
        {connectors.map((connector) => (
          <article className={connector.enabled ? 'connector-card enabled' : 'connector-card'} key={connector.id}>
            <div className="connector-icon">
              {connector.iconUrl ? <img src={connector.iconUrl} alt="" /> : <Plug size={18} />}
            </div>
            <div className="connector-body">
              <div className="connector-head">
                <strong>{connector.name}</strong>
                <span>{connector.enabled ? '已启用' : '已停用'}</span>
              </div>
              <p>{connector.description || connector.command || connector.url || '这个连接器来自 Hermes MCP 配置。'}</p>
              <div className="connector-meta">
                <em>{connector.transport.toUpperCase()}</em>
                <em>{connector.status === 'configured' ? '配置完整' : '需要补全'}</em>
                {connector.auth !== 'none' && <em>{connector.auth}</em>}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="connector-footer">
        <span>详细测试、工具级开关、编辑和删除仍在 MCP 设置页中完成。</span>
        <button className="settings-link-button" onClick={onOpenSettings}>打开 MCP 管理</button>
      </div>
    </div>
  )
}

function SearchTasksView({
  tasks,
  query,
  onQueryChange,
  onOpenTask
}: {
  tasks: Task[]
  query: string
  onQueryChange: (value: string) => void
  onOpenTask: (task: Task) => void
}) {
  const normalized = query.trim().toLowerCase()
  const results = tasks.filter((task) => {
    if (!normalized) return true
    return [
      task.title,
      task.prompt,
      task.error,
      task.hermesSessionId,
      task.executionView?.response,
      task.executionView?.errors.join(' '),
      (task.skillNames ?? []).join(' '),
      (task.tags ?? []).join(' ')
    ].filter(Boolean).join(' ').toLowerCase().includes(normalized)
  })

  return (
    <section className="product-page">
      <header className="product-page-head">
        <div>
          <h1>搜索</h1>
          <p>从历史任务、技能、标签里快速找回工作现场。</p>
        </div>
      </header>
      <label className="product-search">
        <Search size={16} />
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索任务、技能或场景" />
      </label>
      <div className="product-list">
        {!results.length && <p className="muted-copy">没有找到匹配任务。</p>}
        {results.map((task) => (
          <button className="product-task-result" key={task.id} onClick={() => onOpenTask(task)}>
            <StatusIcon status={task.status} />
            <div>
              <strong>{task.title}</strong>
              <span>{statusLabel(task.status)} · {formatTime(task.createdAt)}{task.skillNames?.length ? ` · ${task.skillNames.join('、')}` : ''}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

function ProjectsView({
  workspaces,
  tasks,
  selectedWorkspaceId,
  onSelect,
  onAdd,
  onReveal
}: {
  workspaces: Workspace[]
  tasks: Task[]
  selectedWorkspaceId: string
  onSelect: (workspace: Workspace) => void
  onAdd: () => void
  onReveal: (workspace: Workspace) => void
}) {
  return (
    <section className="product-page">
      <header className="product-page-head">
        <div>
          <h1>项目</h1>
          <p>这里管理 Hermes 被授权访问的本机文件夹。选择项目后，新任务会在对应目录里执行。</p>
        </div>
        <button className="send-button" onClick={onAdd}>
          <Plus size={16} />
          新建项目
        </button>
      </header>
      <div className="project-directory-list">
        {workspaces.map((workspace) => {
          const workspaceTasks = tasks.filter((task) => task.workspaceId === workspace.id)
          const running = workspaceTasks.filter((task) => task.status === 'running').length
          const completed = workspaceTasks.filter((task) => task.status === 'completed').length
          return (
            <article
              className={workspace.id === selectedWorkspaceId ? 'project-directory-card active' : 'project-directory-card'}
              key={workspace.id}
            >
              <Folder size={18} />
              <div>
                <strong>{workspace.name}</strong>
                <span>{workspace.path}</span>
                <div className="project-card-meta">
                  <em>{workspaceTasks.length} 个任务</em>
                  <em>{completed} 个完成</em>
                  {running > 0 && <em>{running} 个运行中</em>}
                </div>
              </div>
              <div className="project-card-actions">
                <button className="settings-link-button" onClick={() => onSelect(workspace)}>进入</button>
                <button className="icon-button" title="在 Finder 打开" onClick={() => onReveal(workspace)}>
                  <FolderOpen size={14} />
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function ScheduledTasksView({
  backgroundStatus,
  backgroundUpdating,
  backgroundError,
  recommendations,
  recommendationsLoading,
  recommendationsError,
  onToggleBackground,
  onGenerateReport
}: {
  backgroundStatus: BackgroundServiceStatus | null
  backgroundUpdating: boolean
  backgroundError: string | null
  recommendations: HermesMcpRecommendations | null
  recommendationsLoading: boolean
  recommendationsError: string | null
  onToggleBackground: (enabled: boolean) => void
  onGenerateReport: () => void
}) {
  const backgroundEnabled = Boolean(backgroundStatus?.api.loaded && backgroundStatus.dailyMcp.loaded)

  return (
    <section className="product-page">
      <header className="product-page-head">
        <div>
          <h1>定时任务</h1>
          <p>把固定时间要做的工作交给 Hermes。当前先接入每日 MCP 推荐日报和 Cowork 后台保活。</p>
        </div>
        <button className="send-button" onClick={onGenerateReport} disabled={recommendationsLoading}>
          {recommendationsLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          立即生成日报
        </button>
      </header>

      <div className="schedule-grid">
        <article className="schedule-card primary">
          <div className="schedule-card-head">
            <div>
              <strong>每日 MCP 推荐日报</strong>
              <span>每天 00:10 后，由 Hermes 复盘最近任务、卡点和关键词，生成 MCP 推荐。</span>
            </div>
            <Toggle checked={backgroundEnabled} disabled={backgroundUpdating} onChange={onToggleBackground} />
          </div>
          <div className="schedule-report">
            <strong>{recommendations?.generatedAt ? `日报 ${formatMaybeDate(recommendations.generatedAt)}` : '暂无日报'}</strong>
            <p>{recommendations?.aiSummary || recommendations?.sourceSummary || '开启后台服务或点击立即生成后，这里会显示推荐摘要。'}</p>
            <div className="schedule-tags">
              {(recommendations?.keywords ?? ['MCP', '文件整理', '网页调研']).slice(0, 8).map((keyword) => (
                <span key={keyword}>{keyword}</span>
              ))}
            </div>
          </div>
          <div className="schedule-foot">
            <span>下次自动生成：{formatMaybeDate(recommendations?.nextRunAt)}</span>
            <span>{backgroundEnabled ? '后台已启用' : '后台未启用'}</span>
          </div>
        </article>

        <article className="schedule-card">
          <strong>Cowork 后台服务</strong>
          <div className="schedule-status-list">
            <div>
              <span>API 后台</span>
              <em>{backgroundStatus?.api.loaded ? '运行中' : backgroundStatus?.api.installed ? '已安装未运行' : '未安装'}</em>
            </div>
            <div>
              <span>每日推荐</span>
              <em>{backgroundStatus?.dailyMcp.loaded ? '运行中' : backgroundStatus?.dailyMcp.installed ? '已安装未运行' : '未安装'}</em>
            </div>
            <div>
              <span>日志目录</span>
              <em>{backgroundStatus?.logsDir ?? '待读取'}</em>
            </div>
          </div>
        </article>
      </div>

      {(backgroundError || recommendationsError) && (
        <div className="settings-error-line">{backgroundError || recommendationsError}</div>
      )}
    </section>
  )
}

function DispatchView({
  connectors,
  skills,
  onOpenConnectors,
  onOpenMcpSettings
}: {
  connectors: HermesMcpConfig['servers']
  skills: Skill[]
  onOpenConnectors: () => void
  onOpenMcpSettings: () => void
}) {
  const enabledConnectors = connectors.filter((connector) => connector.enabled)
  const larkSkills = skills.filter((skill) => skill.name.startsWith('lark-') && skill.enabled)
  const browserConnectors = connectors.filter((connector) => /browser|chrome|playwright|web/i.test(`${connector.name} ${connector.description ?? ''}`))

  return (
    <section className="product-page">
      <header className="product-page-head">
        <div>
          <h1>调度</h1>
          <p>这里汇总 Hermes 能触达的外部动作：浏览器、飞书、文件系统、数据分析和本机自动化。</p>
        </div>
        <button className="send-button" onClick={onOpenConnectors}>
          <Plug size={16} />
          查看连接器
        </button>
      </header>

      <div className="dispatch-grid">
        <DispatchCapabilityCard
          icon={<Globe2 size={18} />}
          title="网页与浏览器"
          detail="用于网页调研、读取页面、浏览器自动化和网页表单操作。"
          count={browserConnectors.length}
          status={browserConnectors.length ? '已接入' : '待接入'}
        />
        <DispatchCapabilityCard
          icon={<MessageSquarePlus size={18} />}
          title="飞书办公"
          detail="通过 lark skills 处理消息、文档、表格、审批、日历和会议纪要。"
          count={larkSkills.length}
          status={larkSkills.length ? '已接入' : '待启用'}
        />
        <DispatchCapabilityCard
          icon={<Database size={18} />}
          title="数据与文件"
          detail="CSV、SQLite、Excel、PDF、视觉理解等本机工作能力。"
          count={enabledConnectors.length}
          status={enabledConnectors.length ? '可用' : '待配置'}
        />
      </div>

      <div className="dispatch-connector-strip">
        <div>
          <strong>当前可调用连接器</strong>
          <span>{enabledConnectors.length ? enabledConnectors.map((connector) => connector.name).join('、') : '暂无启用连接器'}</span>
        </div>
        <button className="settings-link-button" onClick={onOpenMcpSettings}>打开 MCP 管理</button>
      </div>
    </section>
  )
}

function DispatchCapabilityCard({
  icon,
  title,
  detail,
  count,
  status
}: {
  icon: ReactNode
  title: string
  detail: string
  count: number
  status: string
}) {
  return (
    <article className="dispatch-card">
      <div className="dispatch-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{detail}</p>
      <div>
        <span>{count} 项能力</span>
        <em>{status}</em>
      </div>
    </article>
  )
}

function IdeasView({
  examples,
  onUsePrompt
}: {
  examples: Example[]
  onUsePrompt: (prompt: string) => void
}) {
  const [category, setCategory] = useState('全部')
  const categories = ['全部', ...Array.from(new Set(examples.map((item) => item.category)))]
  const visibleExamples = category === '全部' ? examples : examples.filter((item) => item.category === category)

  return (
    <section className="product-page">
      <header className="product-page-head">
        <div>
          <h1>任务模板</h1>
          <p>把常见工作变成一键开始的任务入口。后续这里会沉淀你的高频工作流。</p>
        </div>
      </header>
      <div className="ideas-tabs">
        {categories.map((item) => (
          <button className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="idea-grid">
        {visibleExamples.map((item) => (
          <button key={item.title} onClick={() => onUsePrompt(item.prompt)}>
            <TemplateIcon name={item.icon} />
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function CoworkUtilityPage({
  icon,
  title,
  detail,
  action,
  status
}: {
  icon: ReactNode
  title: string
  detail: string
  action: string
  status: string
}) {
  return (
    <section className="product-page">
      <header className="product-page-head">
        <div>
          <h1>{title}</h1>
          <p>{detail}</p>
        </div>
        <button className="send-button">
          <Plus size={16} />
          {action}
        </button>
      </header>
      <div className="utility-empty">
        <div className="utility-empty-icon">{icon}</div>
        <strong>{title}正在接入 Hermes</strong>
        <span>{status}</span>
      </div>
    </section>
  )
}

function SettingsModal({
  tab,
  language,
  theme,
  privacyMode,
  runtime,
  selectedModel,
  models,
  selectedModelId,
  hermesModel,
  hermesModelUpdating,
  hermesModelError,
  prefs,
  hermesMcp,
  mcpError,
  mcpTestResults,
  mcpTestingId,
  mcpUpdatingId,
  mcpDeletingId,
  mcpToolUpdatingId,
  mcpRecommendations,
  mcpRecommendationsLoading,
  mcpRecommendationsError,
  backgroundStatus,
  backgroundUpdating,
  backgroundError,
  mcpServeStatus,
  mcpServeUpdating,
  mcpServeError,
  enabledSkillCount,
  skillCount,
  workspaceCount,
  onTabChange,
  onClose,
  onLanguageChange,
  onThemeChange,
  onPrivacyChange,
  onPrefChange,
  onToggleMcpServer,
  onRefreshMcp,
  onTestMcpServer,
  onEditMcpServer,
  onSetMcpToolSelection,
  onDeleteMcpServer,
  onOpenMcpMarketplace,
  onOpenManualMcp,
  onRefreshMcpRecommendationsWithAi,
  onToggleBackgroundServices,
  onToggleMcpServe,
  onRefreshMcpServe,
  onSelectModel,
  onSetHermesDefaultModel,
  onSetHermesFallbackProviders,
  onRefreshModels,
  onAddRule,
  onOpenAddModel
}: {
  tab: SettingsTab
  language: string
  theme: string
  privacyMode: boolean
  runtime: HermesRuntime | null
  selectedModel: ModelOption
  models: ModelOption[]
  selectedModelId: string
  hermesModel: HermesModelOverview | null
  hermesModelUpdating: string | null
  hermesModelError: string | null
  prefs: SettingsPrefs
  hermesMcp: HermesMcpConfig | null
  mcpError: string | null
  mcpTestResults: Record<string, HermesMcpTestResult>
  mcpTestingId: string | null
  mcpUpdatingId: string | null
  mcpDeletingId: string | null
  mcpToolUpdatingId: string | null
  mcpRecommendations: HermesMcpRecommendations | null
  mcpRecommendationsLoading: boolean
  mcpRecommendationsError: string | null
  backgroundStatus: BackgroundServiceStatus | null
  backgroundUpdating: boolean
  backgroundError: string | null
  mcpServeStatus: HermesMcpServeStatus | null
  mcpServeUpdating: boolean
  mcpServeError: string | null
  enabledSkillCount: number
  skillCount: number
  workspaceCount: number
  onTabChange: (tab: SettingsTab) => void
  onClose: () => void
  onLanguageChange: (value: string) => void
  onThemeChange: (value: string) => void
  onPrivacyChange: (value: boolean) => void
  onPrefChange: <K extends keyof SettingsPrefs>(key: K, value: SettingsPrefs[K]) => void
  onToggleMcpServer: (serverId: string, enabled: boolean) => void
  onRefreshMcp: () => void
  onTestMcpServer: (serverId: string) => void
  onEditMcpServer: (server: HermesMcpConfig['servers'][number]) => void
  onSetMcpToolSelection: (serverId: string, mode: 'all' | 'include' | 'exclude', tools: string[]) => void
  onDeleteMcpServer: (serverId: string) => void
  onOpenMcpMarketplace: () => void
  onOpenManualMcp: () => void
  onRefreshMcpRecommendationsWithAi: () => void
  onToggleBackgroundServices: (enabled: boolean) => void
  onToggleMcpServe: (enabled: boolean) => void
  onRefreshMcpServe: () => void
  onSelectModel: (model: ModelOption) => void
  onSetHermesDefaultModel: (modelId: string, provider?: string) => void
  onSetHermesFallbackProviders: (providers: string[]) => void
  onRefreshModels: () => void
  onAddRule: (rule: string) => void
  onOpenAddModel: () => void
}) {
  const [commandDraft, setCommandDraft] = useState('')
  const [pathDraft, setPathDraft] = useState('')
  const [ruleDraft, setRuleDraft] = useState('')
  const [expandedMcpId, setExpandedMcpId] = useState<string | null>(null)
  const [modelScope, setModelScope] = useState<'overview' | 'providers' | 'fallbacks' | 'credentials'>('overview')
  const [modelProviderQuery, setModelProviderQuery] = useState('')
  const customModels = models.filter((model) => !model.builtIn && model.id !== 'auto')
  const mcpServers = hermesMcp?.servers ?? []
  const modelProvidersForView = hermesModel?.providers ?? []
  const modelCredentialsForView = hermesModel?.credentials ?? []
  const fallbackProviderIds = hermesModel?.fallbackProviders ?? []
  const fallbackProviderSet = new Set(fallbackProviderIds)
  const configuredCredentialCount = modelCredentialsForView.filter((credential) => credential.configured).length
  const configuredProviderCount = modelProvidersForView.filter((provider) => provider.configured).length
  const currentHermesProvider = modelProvidersForView.find((provider) => provider.isCurrent)
  const fallbackCandidates = modelProvidersForView.filter((provider) => provider.configured && !provider.isCurrent)
  const filteredModelProviders = modelProvidersForView.filter((provider) => {
    const query = modelProviderQuery.trim().toLowerCase()
    if (!query) return true
    return `${provider.id} ${provider.label} ${provider.models.join(' ')}`.toLowerCase().includes(query)
  })
  const tabs: Array<{ id: SettingsTab; label: string; icon: ReactNode; group?: 'main' | 'tools' | 'about' }> = [
    { id: 'account', label: '账号', icon: <User size={15} />, group: 'main' },
    { id: 'general', label: '通用', icon: <Settings size={15} />, group: 'main' },
    { id: 'mcp', label: 'MCP', icon: <Plug size={15} />, group: 'tools' },
    { id: 'models', label: '模型', icon: <Bot size={15} />, group: 'tools' },
    { id: 'conversation', label: '对话流', icon: <MessageSquarePlus size={15} />, group: 'tools' },
    { id: 'external', label: '外部应用授权', icon: <Shield size={15} />, group: 'tools' },
    { id: 'cloud', label: '云端运行环境', icon: <CloudIcon />, group: 'tools' },
    { id: 'commands', label: '命令', icon: <Terminal size={15} />, group: 'about' },
    { id: 'rules', label: '规则', icon: <FileText size={15} />, group: 'about' },
    { id: 'about', label: '关于 Hermes Cowork', icon: <Info size={15} />, group: 'about' }
  ]

  return (
    <div className="settings-modal">
      <aside className="settings-sidebar">
        <div className="settings-user">
          <span className="account-avatar"><User size={16} /></span>
          <strong>Lucas</strong>
          <span className="local-badge">本机</span>
        </div>
        <div className="settings-nav">
          {tabs.map((item, index) => (
            <button
              className={tab === item.id ? 'active' : ''}
              key={item.id}
              onClick={() => onTabChange(item.id)}
            >
              {item.icon}
              {item.label}
              {(index === 1 || index === 6) && <span className="settings-divider" />}
            </button>
          ))}
        </div>
      </aside>
      <section className="settings-panel">
        <button className="settings-close" onClick={onClose} aria-label="关闭设置">
          <XCircle size={18} />
        </button>
        {tab === 'account' && (
          <SettingsSection title="账号">
            <div className="settings-block">
              <h3>账户信息</h3>
              <div className="account-card">
                <div>
                  <strong>Lucas</strong>
                  <span>Hermes Cowork 本机账户</span>
                </div>
                <button className="ghost-button">管理账号</button>
              </div>
            </div>
            <div className="settings-block">
              <div className="settings-row">
                <div>
                  <strong>隐私模式</strong>
                  <p>开启后，界面会弱化任务内容预览。后续可接入日志脱敏和引用隐藏。</p>
                </div>
                <Toggle checked={privacyMode} onChange={onPrivacyChange} />
              </div>
            </div>
            <button className="settings-logout">
              <LogOut size={14} />
              退出登录
            </button>
          </SettingsSection>
        )}
        {tab === 'general' && (
          <SettingsSection title="通用">
            <SettingsBlock title="基础设置">
              <SettingsControlRow title="主题" detail="选择主题">
                <SelectControl value={theme} options={['亮色', '跟随系统', '暗色']} onChange={onThemeChange} />
              </SettingsControlRow>
              <SettingsControlRow title="语言" detail="选择您喜欢的按钮标签和应用内其他文本的语言">
                <SelectControl value={language} options={['简体中文', '英文']} onChange={onLanguageChange} />
              </SettingsControlRow>
            </SettingsBlock>
            <SettingsBlock title="偏好设置">
              <SettingsControlRow title="本地链接的默认打开方式" detail="点击终端中的本地链接时，是否自动使用内置浏览器打开">
                <SelectControl
                  value={prefs.linkOpenMode}
                  options={['始终询问', '内置浏览器', '系统默认浏览器']}
                  onChange={(value) => onPrefChange('linkOpenMode', value)}
                />
              </SettingsControlRow>
            </SettingsBlock>
            <SettingsBlock title="数据管理">
              <SettingsControlRow title="浏览器数据" detail="浏览器中的站点数据（如 Cookies、本地存储等）">
                <button className="settings-danger-button">清除</button>
              </SettingsControlRow>
            </SettingsBlock>
          </SettingsSection>
        )}
        {tab === 'mcp' && (
          <SettingsSection title="MCP">
            <SettingsSubtabs
              value={prefs.mcpScope}
              options={[['local', '本地服务'], ['serve', 'Hermes Server'], ['recommendations', '每日推荐'], ['cloud', '云端']]}
              onChange={(value) => onPrefChange('mcpScope', value as McpScope)}
            />
            {prefs.mcpScope === 'local' && (
              <SettingsCard>
              <div className="settings-card-header">
                <div>
                  <strong>MCP 服务管理</strong>
                  <span>
                    读取 Hermes 的 MCP 服务配置
                    {hermesMcp?.configPath ? ` · ${hermesMcp.configPath}` : ''}
                  </span>
                </div>
                <div className="settings-card-actions">
                  <button className="icon-button" title="刷新 MCP 状态" onClick={onRefreshMcp}><RefreshCw size={14} /></button>
                  <div className="mcp-add-menu">
                    <button className="dark-mini-button"><Plus size={14} /> 添加 <ChevronDown size={13} /></button>
                    <div className="mcp-add-popover">
                      <button onClick={onOpenMcpMarketplace}>从市场添加</button>
                      <button onClick={onOpenManualMcp}>手动配置</button>
                    </div>
                  </div>
                </div>
              </div>
              {mcpError && <div className="settings-error-line">{mcpError}</div>}
              {!mcpError && (
                <div className="settings-source-line">
                  <span>真实 Hermes 配置</span>
                  <strong>{mcpServers.length} 个服务</strong>
                  <em>只读预览，敏感环境变量已隐藏</em>
                </div>
              )}
              <div className="mcp-server-list">
                {mcpServers.length === 0 && !mcpError && (
                  <div className="mcp-empty-state">Hermes 配置中暂未发现 MCP 服务。</div>
                )}
                {mcpServers.map((server) => (
                  <div className="mcp-server-item" key={server.id}>
                    <div className="mcp-server-row">
                      <button
                        className="mcp-expand-button"
                        onClick={() => setExpandedMcpId((current) => current === server.id ? null : server.id)}
                        title="展开 MCP 配置详情"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <McpIcon name={server.name} iconUrl={server.iconUrl} />
                      <div className="mcp-server-main">
                        <strong>{server.name}</strong>
                        <span>{mcpServerSummary(server)}</span>
                      </div>
                      {server.status === 'configured' ? <CheckCircle2 size={13} className="ready-mark" /> : <XCircle size={13} className="error-mark" />}
                      <button
                        className="settings-test-button"
                        onClick={() => onTestMcpServer(server.id)}
                        disabled={mcpTestingId === server.id}
                      >
                        {mcpTestingId === server.id ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
                        测试
                      </button>
                      <button
                        className="settings-edit-button"
                        onClick={() => onEditMcpServer(server)}
                        disabled={mcpUpdatingId === server.id}
                        title="编辑 MCP 服务"
                      >
                        {mcpUpdatingId === server.id ? <Loader2 size={13} className="spin" /> : <Wrench size={13} />}
                      </button>
                      <button
                        className="settings-delete-button"
                        onClick={() => onDeleteMcpServer(server.id)}
                        disabled={mcpDeletingId === server.id}
                        title="删除 MCP 服务"
                      >
                        {mcpDeletingId === server.id ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                      </button>
                      <div className="mcp-toggle-wrap" title="写回 Hermes config.yaml 的 enabled 字段">
                        {mcpUpdatingId === server.id && <Loader2 size={13} className="spin" />}
                        <Toggle checked={server.enabled} onChange={(value) => onToggleMcpServer(server.id, value)} disabled={mcpUpdatingId === server.id} />
                      </div>
                    </div>
                    {expandedMcpId === server.id && (
                      <McpServerDetails
                        server={server}
                        testResult={mcpTestResults[server.id]}
                        isUpdatingTools={mcpToolUpdatingId === server.id}
                        onSetToolSelection={(mode, tools) => onSetMcpToolSelection(server.id, mode, tools)}
                        onTest={() => onTestMcpServer(server.id)}
                      />
                    )}
                  </div>
                ))}
              </div>
              </SettingsCard>
            )}
            {prefs.mcpScope === 'serve' && (
              <SettingsCard>
              <div className="settings-card-header">
                <div>
                  <strong>Hermes 作为 MCP Server</strong>
                  <span>覆盖 `hermes mcp serve -v`，用于把 Hermes 对话能力通过 stdio 暴露给其他 MCP Client。</span>
                </div>
                <div className="settings-card-actions">
                  <button className="icon-button" title="刷新 serve 状态" onClick={onRefreshMcpServe}><RefreshCw size={14} /></button>
                  <button
                    className={mcpServeStatus?.running ? 'settings-danger-button' : 'dark-mini-button'}
                    onClick={() => onToggleMcpServe(!mcpServeStatus?.running)}
                    disabled={mcpServeUpdating}
                  >
                    {mcpServeUpdating ? <Loader2 size={13} className="spin" /> : mcpServeStatus?.running ? <Square size={13} /> : <Play size={13} />}
                    {mcpServeStatus?.running ? '停止 serve' : '启动 serve'}
                  </button>
                </div>
              </div>
              {mcpServeError && <div className="settings-error-line">{mcpServeError}</div>}
              <McpServePanel status={mcpServeStatus} />
              </SettingsCard>
            )}
            {prefs.mcpScope === 'recommendations' && (
              <SettingsCard>
              <div className="settings-card-header">
                <div>
                  <strong>每日 MCP 推荐日报</strong>
                  <span>每天 00:10 后由 Hermes 复盘当天任务和卡点，推荐内容统一进入 MCP 市场。</span>
                </div>
                <div className="settings-card-actions">
                  <button className="dark-mini-button" onClick={onRefreshMcpRecommendationsWithAi} disabled={mcpRecommendationsLoading}>
                    {mcpRecommendationsLoading ? <Loader2 size={13} className="spin" /> : <Bot size={13} />}
                    生成日报
                  </button>
                </div>
              </div>
              {mcpRecommendationsError && <div className="settings-error-line">{mcpRecommendationsError}</div>}
              <div className="mcp-daily-report">
                <div>
                  <strong>{mcpRecommendations?.generatedAt ? `日报 ${formatMaybeDate(mcpRecommendations.generatedAt)}` : '暂无推荐日报'}</strong>
                  <span>{mcpRecommendations?.aiSummary || mcpRecommendations?.sourceSummary || '生成后会在这里显示 Hermes 的复盘摘要。'}</span>
                </div>
                <button className="settings-link-button" onClick={onOpenMcpMarketplace}>去市场查看推荐</button>
              </div>
              <div className="mcp-daily-permission">
                <div>
                  <strong>允许后台每日生成</strong>
                  <span>开启后，macOS 登录时启动 Hermes Cowork 后台，并在每天 00:10 调用 Hermes 生成推荐日报。</span>
                </div>
                <Toggle checked={Boolean(backgroundStatus?.api.loaded && backgroundStatus.dailyMcp.loaded)} disabled={backgroundUpdating} onChange={onToggleBackgroundServices} />
              </div>
              {backgroundError && <div className="settings-error-line">{backgroundError}</div>}
              </SettingsCard>
            )}
            {prefs.mcpScope === 'cloud' && (
              <SettingsCard>
                <div className="settings-card-header">
                  <div>
                    <strong>云端 MCP</strong>
                    <span>预留给未来远程 Hermes 或云端运行环境。当前版本只管理本机 Hermes。</span>
                  </div>
                </div>
                <div className="mcp-empty-state">云端 MCP 暂未接入。后续可以在这里管理云端服务、远程凭据和团队共享配置。</div>
              </SettingsCard>
            )}
          </SettingsSection>
        )}
        {tab === 'models' && (
          <SettingsSection title="模型">
            <SettingsSubtabs
              value={modelScope}
              options={[['overview', '总览'], ['providers', 'Provider'], ['fallbacks', '备用模型'], ['credentials', '凭据']]}
              onChange={(value) => setModelScope(value as 'overview' | 'providers' | 'fallbacks' | 'credentials')}
            />

            {modelScope === 'overview' && (
              <>
                <SettingsBlock title="Hermes 当前模型">
                  <div className="model-runtime-card">
                    <div>
                      <span>默认模型</span>
                      <strong>{hermesModel?.defaultModel || '未配置'}</strong>
                      <small>{hermesModel?.providerLabel || 'Hermes 自动选择'} · {hermesModel?.apiMode || '自动 API 模式'}</small>
                    </div>
                    <button className="icon-button" title="刷新模型状态" onClick={onRefreshModels}><RefreshCw size={14} /></button>
                  </div>
                  {hermesModelError && <div className="settings-error-line">{hermesModelError}</div>}
                  <div className="model-health-grid">
                    <div>
                      <span>当前 Provider</span>
                      <strong>{currentHermesProvider?.label ?? hermesModel?.providerLabel ?? '自动'}</strong>
                    </div>
                    <div>
                      <span>可用 Provider</span>
                      <strong>{configuredProviderCount}</strong>
                    </div>
                    <div>
                      <span>可用凭据</span>
                      <strong>{configuredCredentialCount}</strong>
                    </div>
                    <div>
                      <span>备用模型</span>
                      <strong>{fallbackProviderIds.length ? `${fallbackProviderIds.length} 个` : '未开启'}</strong>
                    </div>
                  </div>
                  <InfoGrid items={[
                    ['配置文件', hermesModel?.configPath ?? '/Users/lucas/.hermes/config.yaml'],
                    ['环境变量文件', hermesModel?.envPath ?? '/Users/lucas/.hermes/.env'],
                    ['Provider', hermesModel?.provider || 'auto'],
                    ['Base URL', hermesModel?.baseUrl || '跟随 Hermes/provider 默认值'],
                    ['备用模型', fallbackProviderIds.length ? fallbackProviderIds.join(', ') : '未设置：主模型不可用时不会自动切换']
                  ]} />
                  <div className="model-impact-grid">
                    <div>
                      <strong>Cowork 任务模型</strong>
                      <span>只影响从 Hermes Cowork 发起的新任务；选“使用 Hermes 默认”时不会传 model 参数。</span>
                    </div>
                    <div>
                      <strong>Hermes 默认模型</strong>
                      <span>写回 Hermes 配置文件，CLI、新会话和 Cowork 默认模式都会跟随它。</span>
                    </div>
                    <div>
                      <strong>备用模型</strong>
                      <span>主模型不可用时由 Hermes 兜底切换；未设置代表失败时直接暴露错误。</span>
                    </div>
                  </div>
                  <div className="settings-info-banner">
                    <Info size={15} />
                    这里读取 Hermes 的模型路由和凭据状态；API key、token 和 Header 值不会在 Cowork 中显示。
                  </div>
                </SettingsBlock>

                <SettingsBlock title="你想做什么？">
                  <div className="model-scenario-grid">
                    <ModelScenarioCard
                      title="这次任务临时换模型"
                      detail="只影响 Cowork 发起的新任务，不改 Hermes 默认配置。适合临时让某个任务跑更快或更稳。"
                      action="下方选择"
                      onClick={() => document.querySelector('.cowork-model-list')?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                    />
                    <ModelScenarioCard
                      title="以后都使用这个模型"
                      detail="写回 Hermes 的默认模型，新会话会跟随这个选择。适合你已经确定长期使用某个模型。"
                      action="去选择"
                      onClick={() => setModelScope('providers')}
                    />
                    <ModelScenarioCard
                      title="主模型慢或经常失败"
                      detail="给 Hermes 配一个备用 Provider。主模型不可用时，Hermes 可以自动改走备用模型。"
                      action="配置备用"
                      onClick={() => setModelScope('fallbacks')}
                    />
                    <ModelScenarioCard
                      title="模型不可用或缺 key"
                      detail="检查 API key、OAuth 登录和 Hermes 凭据池状态。密钥内容仍然不会在 Cowork 中显示。"
                      action="检查凭据"
                      onClick={() => setModelScope('credentials')}
                    />
                  </div>
                </SettingsBlock>

                <SettingsBlock title="Cowork 任务模型">
                  <p className="settings-section-copy">决定 Cowork 发起任务时是否传 `--model`。选择 Hermes 默认模型时不传模型参数，完全跟随 Hermes 当前配置。</p>
                  <div className="cowork-model-list">
                    {models.map((model) => (
                      <div className={model.id === selectedModelId ? 'cowork-model-row active' : 'cowork-model-row'} key={model.id}>
                        <div>
                          <strong>{model.label}</strong>
                          <span>{model.description ?? model.provider ?? model.id}</span>
                        </div>
                        <button className="settings-link-button" disabled={model.id === selectedModelId} onClick={() => onSelectModel(model)}>
                          {model.id === selectedModelId ? '当前使用' : '用于 Cowork'}
                        </button>
                      </div>
                    ))}
                  </div>
                  <button className="settings-add-button" onClick={onOpenAddModel}>
                    <Plus size={14} />
                    添加 Cowork 模型选项
                  </button>
                </SettingsBlock>
              </>
            )}

            {modelScope === 'providers' && (
              <SettingsBlock title="Hermes Provider 与默认模型">
                <div className="model-filter-bar">
                  <Search size={14} />
                  <input value={modelProviderQuery} onChange={(event) => setModelProviderQuery(event.target.value)} placeholder="搜索 provider 或模型" />
                  <button className="settings-link-button" onClick={onRefreshModels}>刷新</button>
                </div>
                <div className="model-provider-list">
                  {filteredModelProviders.map((provider) => (
                    <div className={provider.isCurrent ? 'model-provider-card current' : 'model-provider-card'} key={provider.id}>
                      <div className="model-provider-head">
                        <div>
                          <strong>{provider.label}</strong>
                          <span>{provider.credentialSummary}</span>
                        </div>
                        <em>{provider.isCurrent ? '当前 Provider' : provider.configured ? '可用' : '未配置'}</em>
                      </div>
                      {(provider.baseUrl || provider.apiMode) && (
                        <div className="model-provider-meta">
                          {provider.baseUrl && <span>{provider.baseUrl}</span>}
                          {provider.apiMode && <span>{provider.apiMode}</span>}
                        </div>
                      )}
                      <div className="model-chip-list">
                        {provider.models.length ? provider.models.slice(0, 12).map((modelId) => (
                          <button
                            key={modelId}
                            disabled={Boolean(hermesModelUpdating) || (provider.isCurrent && hermesModel?.defaultModel === modelId)}
                            onClick={() => onSetHermesDefaultModel(modelId, provider.id.startsWith('custom:') ? 'custom' : provider.id)}
                            title="写回 Hermes config.yaml 的 model.default"
                          >
                            {hermesModelUpdating === `${provider.id}:${modelId}` ? <Loader2 size={12} className="spin" /> : null}
                            {provider.isCurrent && hermesModel?.defaultModel === modelId ? '当前默认 · ' : ''}
                            {modelId}
                          </button>
                        )) : <span className="model-chip-empty">未从 Hermes 配置中发现模型列表</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </SettingsBlock>
            )}

            {modelScope === 'fallbacks' && (
              <SettingsBlock title="Hermes 备用模型">
                <div className="settings-info-banner">
                  <Info size={15} />
                  备用模型对应 Hermes 的 fallback_providers。开启后，主模型失败时 Hermes 可以尝试这些 Provider；Cowork 会写回配置并自动备份。
                </div>
                <div className="fallback-model-panel">
                  <div className="fallback-model-summary">
                    <div>
                      <span>当前备用顺序</span>
                      <strong>{fallbackProviderIds.length ? fallbackProviderIds.join(' → ') : '未设置'}</strong>
                    </div>
                    <button
                      className="settings-link-button"
                      disabled={!fallbackProviderIds.length || hermesModelUpdating === 'fallbacks'}
                      onClick={() => onSetHermesFallbackProviders([])}
                    >
                      清空备用
                    </button>
                  </div>
                  <div className="fallback-provider-list">
                    {fallbackCandidates.length ? fallbackCandidates.map((provider) => {
                      const checked = fallbackProviderSet.has(provider.id)
                      return (
                        <div className={checked ? 'fallback-provider-row active' : 'fallback-provider-row'} key={provider.id}>
                          <div>
                            <strong>{provider.label}</strong>
                            <span>{provider.credentialSummary || provider.id}</span>
                          </div>
                          <Toggle
                            checked={checked}
                            disabled={hermesModelUpdating === 'fallbacks'}
                            onChange={(value) => {
                              const next = value
                                ? [...fallbackProviderIds, provider.id]
                                : fallbackProviderIds.filter((id) => id !== provider.id)
                              onSetHermesFallbackProviders(next)
                            }}
                          />
                        </div>
                      )
                    }) : (
                      <div className="model-table-empty">暂未发现可作为备用的已配置 Provider。先在凭据页确认模型服务是否已经登录或配置。</div>
                    )}
                  </div>
                </div>
              </SettingsBlock>
            )}

            {modelScope === 'credentials' && (
              <SettingsBlock title="Hermes 凭据状态">
                <div className="settings-info-banner">
                  <Shield size={15} />
                  Cowork 只读取 Hermes 返回的配置状态和凭据池条目，不读取 `.env` 或 auth 文件中的密钥值。
                </div>
                <div className="model-credential-grid">
                  {modelCredentialsForView.map((credential) => (
                    <div className={credential.configured ? 'model-credential-pill configured' : 'model-credential-pill'} key={`${credential.id}-${credential.kind}`}>
                      <strong>{credential.label}</strong>
                      <span>{credential.configured ? credential.detail : '未配置'}</span>
                    </div>
                  ))}
                </div>
              </SettingsBlock>
            )}
          </SettingsSection>
        )}
        {tab === 'conversation' && (
          <SettingsSection title="对话流">
            <SettingsBlock title="手动任务">
              <SettingsControlRow title="自动运行 MCP" detail="使用智能体时，自动运行 MCP 工具">
                <Toggle checked={prefs.autoRunMcp} onChange={(value) => onPrefChange('autoRunMcp', value)} />
              </SettingsControlRow>
              <SettingsControlRow title="命令运行方式" detail="命令在沙箱中自动执行，白名单中的命令可绕过沙箱。">
                <SelectControl
                  value={prefs.commandRunMode}
                  options={['沙箱运行（支持白名单）', '每次询问', '直接运行']}
                  onChange={(value) => onPrefChange('commandRunMode', value)}
                />
              </SettingsControlRow>
              <SettingsControlRow title="白名单列表">
                <InlineAddControl
                  value={commandDraft}
                  placeholder="请输入命令"
                  onChange={setCommandDraft}
                  onAdd={() => {
                    const nextCommand = commandDraft.trim()
                    if (!nextCommand) return
                    onPrefChange('commandWhitelist', prefs.commandWhitelist.includes(nextCommand) ? prefs.commandWhitelist : [...prefs.commandWhitelist, nextCommand])
                    setCommandDraft('')
                  }}
                />
              </SettingsControlRow>
              <SettingsControlRow title="沙箱自定义配置" detail="配置沙箱环境的文件系统访问规则。">
                <button className="settings-button">打开配置</button>
              </SettingsControlRow>
              <SettingsControlRow title="编辑工作区外的文件" detail="控制工作区外文件编辑的处理方式，不包含删除操作。">
                <SelectControl
                  value={prefs.editExternalFilesMode}
                  options={['使用白名单', '每次询问', '禁止编辑']}
                  onChange={(value) => onPrefChange('editExternalFilesMode', value)}
                />
              </SettingsControlRow>
              <SettingsControlRow title="白名单路径">
                <InlineAddControl
                  value={pathDraft}
                  placeholder="输入路径规则"
                  onChange={setPathDraft}
                  onAdd={() => {
                    const nextPath = pathDraft.trim()
                    if (!nextPath) return
                    onPrefChange('externalPathRules', prefs.externalPathRules.includes(nextPath) ? prefs.externalPathRules : [...prefs.externalPathRules, nextPath])
                    setPathDraft('')
                  }}
                />
              </SettingsControlRow>
            </SettingsBlock>
            <SettingsBlock title="浏览器">
              <SettingsControlRow title="浏览器自动化" detail="连接到内置浏览器">
                <SelectControl
                  value={prefs.browserAutomation}
                  options={['内置浏览器', '系统 Chrome', '关闭']}
                  onChange={(value) => onPrefChange('browserAutomation', value)}
                />
              </SettingsControlRow>
            </SettingsBlock>
            <SettingsBlock title="终端工具偏好">
              <SettingsControlRow title="执行命令时自动打开终端" detail="智能体执行终端命令时，是否自动显示终端面板">
                <SelectControl
                  value={prefs.terminalAutoOpen}
                  options={['不打开', '仅错误时打开', '总是打开']}
                  onChange={(value) => onPrefChange('terminalAutoOpen', value)}
                />
              </SettingsControlRow>
            </SettingsBlock>
            <SettingsBlock title="任务状态通知">
              <SettingsControlRow title="允许在任务完成或失败时接收通知" detail="允许在任务完成或失败时接收通知，请在 Mac 的系统设置 > 通知中开启通知，以便及时收到提醒">
                <div className="notification-toggles">
                  <label>横幅 <Toggle checked={prefs.notifyBanner} onChange={(value) => onPrefChange('notifyBanner', value)} /></label>
                  <label>声音 <Toggle checked={prefs.notifySound} onChange={(value) => onPrefChange('notifySound', value)} /></label>
                  <label>菜单栏 <Toggle checked={prefs.notifyMenu} onChange={(value) => onPrefChange('notifyMenu', value)} /></label>
                </div>
              </SettingsControlRow>
              <SettingsControlRow title="音量设置">
                <input
                  className="settings-number-input"
                  type="number"
                  min={0}
                  max={100}
                  value={prefs.soundVolume}
                  onChange={(event) => onPrefChange('soundVolume', Number(event.target.value))}
                />
              </SettingsControlRow>
              <div className="sound-list">
                {['任务完成', '等待操作', '异常打断'].map((name) => (
                  <div key={name}>
                    <span className="sound-icon"><MusicIcon /></span>
                    <strong>{name}</strong>
                    <small>默认</small>
                    <button><Play size={13} /></button>
                    <button><FileText size={13} /></button>
                  </div>
                ))}
              </div>
            </SettingsBlock>
            <SettingsBlock title="工作空间下载（需重启）">
              <SettingsControlRow title="禁用多线程下载" detail="禁用工作空间下载的多连接并行下载器，并切换为单线程下载">
                <Toggle checked={prefs.multiThreadDownload} onChange={(value) => onPrefChange('multiThreadDownload', value)} />
              </SettingsControlRow>
              <SettingsControlRow title="最大下载重试次数" detail="工作空间下载的最大重试次数">
                <input
                  className="settings-number-input"
                  type="number"
                  min={0}
                  max={20}
                  value={prefs.maxDownloadRetries}
                  onChange={(event) => onPrefChange('maxDownloadRetries', Number(event.target.value))}
                />
              </SettingsControlRow>
            </SettingsBlock>
          </SettingsSection>
        )}
        {tab === 'external' && (
          <SettingsSection title="外部应用授权">
            <InfoGrid items={[
              ['飞书', '使用 lark-cli / Hermes skill'],
              ['浏览器', '使用本机 Browser 能力'],
              ['状态', '后续补 OAuth 状态面板']
            ]} />
          </SettingsSection>
        )}
        {tab === 'cloud' && (
          <SettingsSection title="云端运行环境">
            <InfoGrid items={[
              ['运行范围', '本机'],
              ['后端', 'Hermes Cowork API'],
              ['Hermes', runtime?.bridgeMode ?? '未知']
            ]} />
          </SettingsSection>
        )}
        {tab === 'commands' && (
          <SettingsSection title="命令">
            <InfoGrid items={[
              ['启动', 'npm run dev'],
              ['类型检查', 'npm run typecheck'],
              ['构建前端', 'npm run build:web']
            ]} />
          </SettingsSection>
        )}
        {tab === 'rules' && (
          <SettingsSection title="规则">
            <SettingsSubtabs
              value={prefs.rulesScope}
              options={[['local', '本地'], ['cloud', '云端']]}
              onChange={(value) => onPrefChange('rulesScope', value as RulesScope)}
            />
            <SettingsBlock title="导入设置">
              <SettingsControlRow title="将 AGENTS.md 包含在上下文中" detail="智能体将读取根目录中的 AGENTS.md 文件并将其添加到上下文中。">
                <Toggle checked={prefs.includeAgentsMd} onChange={(value) => onPrefChange('includeAgentsMd', value)} />
              </SettingsControlRow>
              <SettingsControlRow title="将 CLAUDE.md 包含在上下文中" detail="智能体将读取根目录中的 CLAUDE.md 和 CLAUDE.local.md 文件并将其添加到上下文中。">
                <Toggle checked={prefs.includeClaudeMd} onChange={(value) => onPrefChange('includeClaudeMd', value)} />
              </SettingsControlRow>
            </SettingsBlock>
            <SettingsBlock title="规则">
              <div className="settings-card-header compact">
                <div>
                  <strong>规则</strong>
                  <span>创建并管理规则，在聊天过程中遵循这些规则。</span>
                </div>
                <InlineAddControl
                  value={ruleDraft}
                  placeholder="输入规则名称"
                  onChange={setRuleDraft}
                  onAdd={() => {
                    onAddRule(ruleDraft)
                    setRuleDraft('')
                  }}
                  label="创建"
                />
              </div>
              <div className="rules-empty">
                {prefs.rules.length === 0 ? (
                  <>
                    <FileText size={20} />
                    <strong>暂无规则</strong>
                    <span>点击新建以添加你的第一个规则</span>
                  </>
                ) : (
                  prefs.rules.map((rule) => <div className="rule-item" key={rule}>{rule}</div>)
                )}
              </div>
            </SettingsBlock>
          </SettingsSection>
        )}
        {tab === 'about' && (
          <SettingsSection title="关于 Hermes Cowork">
            <InfoGrid items={[
              ['产品', 'Hermes Cowork'],
              ['定位', 'Hermes 本机前端'],
              ['版本', '0.1.0']
            ]} />
          </SettingsSection>
        )}
      </section>
    </div>
  )
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="settings-section-content">
      <h2>{title}</h2>
      {children}
    </div>
  )
}

function SettingsBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="settings-block">
      <h3>{title}</h3>
      <div className="settings-card">{children}</div>
    </div>
  )
}

function SettingsCard({ children }: { children: ReactNode }) {
  return <div className="settings-card">{children}</div>
}

function SettingsControlRow({
  title,
  detail,
  children
}: {
  title: string
  detail?: string
  children?: ReactNode
}) {
  return (
    <div className="settings-control-row">
      <div className="settings-control-copy">
        <strong>{title}</strong>
        {detail && <span>{detail}</span>}
      </div>
      {children && <div className="settings-control-action">{children}</div>}
    </div>
  )
}

function ModelScenarioCard({
  title,
  detail,
  action,
  onClick
}: {
  title: string
  detail: string
  action: string
  onClick: () => void
}) {
  return (
    <div className="model-scenario-card">
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <button type="button" className="settings-link-button" onClick={onClick}>
        {action}
      </button>
    </div>
  )
}

function SelectControl({
  value,
  options,
  onChange
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <select className="settings-select-control" value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option}>{option}</option>)}
    </select>
  )
}

function SettingsSubtabs({
  value,
  options,
  onChange
}: {
  value: string
  options: Array<[string, string]>
  onChange: (value: string) => void
}) {
  return (
    <div className="settings-subtabs">
      {options.map(([id, label]) => (
        <button className={value === id ? 'active' : ''} key={id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function McpServePanel({ status }: { status: HermesMcpServeStatus | null }) {
  const logs = status?.logs ?? []
  return (
    <div className="mcp-serve-panel">
      <div className="mcp-serve-grid">
        <div>
          <span>运行状态</span>
          <strong>{status?.running ? '运行中' : '未运行'}</strong>
        </div>
        <div>
          <span>进程 PID</span>
          <strong>{status?.pid ?? '无'}</strong>
        </div>
        <div>
          <span>启动命令</span>
          <strong>{status?.command.join(' ') ?? 'hermes mcp serve -v'}</strong>
        </div>
        <div>
          <span>工作目录</span>
          <strong>{status?.cwd ?? 'Hermes Agent 目录'}</strong>
        </div>
      </div>
      <div className="mcp-serve-note">
        <Info size={14} />
        这是 stdio MCP Server：外部 MCP Client 通常需要配置同一条启动命令，而不是连接一个 HTTP 端口。这里的启动按钮用于本机诊断和日志观察。
      </div>
      <div className="mcp-serve-logs">
        <div>
          <strong>最近日志</strong>
          <span>{logs.length ? `${logs.length} 条` : '暂无日志'}</span>
        </div>
        <pre>{logs.length ? logs.slice(-20).map((entry) => `[${entry.stream}] ${entry.text}`).join('\n') : '启动后会显示 Hermes MCP serve 的 stdout/stderr。'}</pre>
      </div>
    </div>
  )
}

function McpServerDetails({
  server,
  testResult,
  isUpdatingTools,
  onSetToolSelection,
  onTest
}: {
  server: HermesMcpConfig['servers'][number]
  testResult?: HermesMcpTestResult
  isUpdatingTools: boolean
  onSetToolSelection: (mode: 'all' | 'include' | 'exclude', tools: string[]) => void
  onTest: () => void
}) {
  const tools = testResult?.tools ?? []
  const toolNames = tools.map((tool) => tool.name)
  const activeToolNames = selectedMcpToolNames(server, toolNames)

  function updateTool(toolName: string, enabled: boolean) {
    const next = new Set(activeToolNames)
    if (enabled) next.add(toolName)
    else next.delete(toolName)
    if (next.size === 0) return
    onSetToolSelection('include', [...next])
  }

  return (
    <div className="mcp-server-details">
      <InfoGrid items={[
        ['功能描述', server.description || inferMcpDescription(server)],
        ['传输方式', mcpTransportLabel(server.transport)],
        ['启动命令', server.command ?? server.url ?? '未配置'],
        ['命令参数', server.args.length ? server.args.join(' ') : '无'],
        ['认证方式', mcpAuthLabel(server)],
        ['请求 Header', server.headerKeys.length ? `${server.headerKeys.join(', ')}（值已隐藏）` : '无'],
        ['环境变量', server.envKeys.length ? `${server.envKeys.join(', ')}（值已隐藏）` : '无'],
        ['工具范围', mcpToolModeLabel(server.toolMode)],
        ['启用状态', server.enabled ? '已启用' : '已停用']
      ]} />
      {testResult && (
        <div className={testResult.ok ? 'mcp-test-result ok' : 'mcp-test-result failed'}>
          <div>
            <strong>{testResult.ok ? '连接成功' : '连接失败'}</strong>
            <span>
              {testResult.elapsedMs}ms
              {typeof testResult.toolCount === 'number' ? ` · ${testResult.toolCount} 个工具` : ''}
            </span>
          </div>
          <pre>{testResult.output || testResult.error || 'Hermes 没有返回测试输出。'}</pre>
          {testResult.tools?.length ? (
            <div className="mcp-tool-list">
              <div className="mcp-tool-list-head">
                <div>
                  <strong>发现的工具</strong>
                  <span>对应 Hermes 的 tools.include / tools.exclude 配置，新会话生效。</span>
                </div>
                <div className="mcp-tool-actions">
                  {isUpdatingTools && <Loader2 size={13} className="spin" />}
                  <button
                    className="settings-test-button"
                    onClick={() => onSetToolSelection('all', [])}
                    disabled={isUpdatingTools || activeToolNames.length === toolNames.length}
                  >
                    全部启用
                  </button>
                  <button
                    className="settings-test-button"
                    onClick={() => onSetToolSelection('include', activeToolNames)}
                    disabled={isUpdatingTools || activeToolNames.length === toolNames.length}
                  >
                    保存选择
                  </button>
                </div>
              </div>
              {testResult.tools.map((tool) => (
                <div className="mcp-tool-row" key={tool.name}>
                  <Toggle
                    checked={activeToolNames.includes(tool.name)}
                    disabled={isUpdatingTools || (activeToolNames.length === 1 && activeToolNames.includes(tool.name))}
                    onChange={(checked) => updateTool(tool.name, checked)}
                  />
                  <code>{tool.name}</code>
                  <em>{tool.description}</em>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {!testResult && (
        <div className="mcp-tool-empty">
          <span>先测试一次 MCP，Hermes Cowork 会读取服务返回的工具列表，然后就可以逐个开关。</span>
          <button className="settings-test-button" onClick={onTest}>
            <Play size={13} />
            测试并发现工具
          </button>
        </div>
      )}
    </div>
  )
}

function ManualMcpModal({
  mode = 'create',
  initialServer,
  isSaving,
  onClose,
  onSubmit
}: {
  mode?: 'create' | 'edit'
  initialServer?: HermesMcpConfig['servers'][number] | null
  isSaving: boolean
  onClose: () => void
  onSubmit: (config: HermesMcpManualConfigRequest) => void
}) {
  const initialTransport = initialServer?.transport === 'http' || initialServer?.transport === 'sse' ? initialServer.transport : 'stdio'
  const isEdit = mode === 'edit'
  const [name, setName] = useState(initialServer?.name ?? '')
  const [transport, setTransport] = useState<'stdio' | 'http' | 'sse'>(initialTransport)
  const [command, setCommand] = useState(initialServer?.command ?? '')
  const [argsText, setArgsText] = useState(initialServer?.args.join(' ') ?? '')
  const [url, setUrl] = useState(initialServer?.url ?? '')
  const [envText, setEnvText] = useState('')
  const [auth, setAuth] = useState<'none' | 'oauth' | 'header'>(initialServer?.auth === 'oauth' || initialServer?.auth === 'header' ? initialServer.auth : 'none')
  const [authHeaderName, setAuthHeaderName] = useState(initialServer?.headerKeys[0] ?? 'Authorization')
  const [authHeaderValue, setAuthHeaderValue] = useState('')
  const [preset, setPreset] = useState('')

  useEffect(() => {
    if (!initialServer) return
    setName(initialServer.name)
    setTransport(initialServer.transport === 'http' || initialServer.transport === 'sse' ? initialServer.transport : 'stdio')
    setCommand(initialServer.command ?? '')
    setArgsText(initialServer.args.join(' '))
    setUrl(initialServer.url ?? '')
    setEnvText('')
    setAuth(initialServer.auth === 'oauth' || initialServer.auth === 'header' ? initialServer.auth : 'none')
    setAuthHeaderName(initialServer.headerKeys[0] ?? 'Authorization')
    setAuthHeaderValue('')
    setPreset('')
  }, [initialServer])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit({
      name: name.trim(),
      transport,
      command: command.trim(),
      args: splitShellLike(argsText),
      url: url.trim(),
      env: envText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      auth,
      authHeaderName: authHeaderName.trim(),
      authHeaderValue: authHeaderValue.trim(),
      preset: isEdit ? undefined : preset.trim()
    })
  }

  return (
    <form className="modal manual-mcp-modal" onSubmit={handleSubmit}>
      <div className="modal-headline">
        <div>
          <h2>{isEdit ? '编辑 MCP' : '手动配置 MCP'}</h2>
          <p>{isEdit ? '修改已安装 MCP 的连接配置。保存前会自动备份 Hermes 配置，保存后自动测试连接。' : '通过 Hermes 原生命令添加 MCP，写入前会自动备份配置，成功后自动测试连接。'}</p>
        </div>
        <button type="button" className="settings-close inline" onClick={onClose} aria-label="关闭手动配置">
          <XCircle size={18} />
        </button>
      </div>
      <label>
        服务名称
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如 filesystem 或 my-mcp"
          disabled={isEdit}
        />
      </label>
      <label>
        连接方式
        <select value={transport} onChange={(event) => setTransport(event.target.value as 'stdio' | 'http' | 'sse')}>
          <option value="stdio">本机命令 stdio</option>
          <option value="http">HTTP URL</option>
          <option value="sse">SSE URL</option>
        </select>
      </label>
      {!isEdit && (
        <label>
          Hermes preset
          <input
            value={preset}
            onChange={(event) => setPreset(event.target.value)}
            placeholder="可选；对应 hermes mcp add --preset"
          />
          <span className="manual-mcp-note">填写 preset 时会优先按 Hermes 内置 preset 添加；留空则使用下面的命令或 URL。</span>
        </label>
      )}
      {transport === 'stdio' ? (
        <>
          <label>
            启动命令
            <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="npx / node / python" />
          </label>
          <label>
            参数
            <input value={argsText} onChange={(event) => setArgsText(event.target.value)} placeholder="-y @modelcontextprotocol/server-filesystem /path" />
          </label>
          <label>
            环境变量
            <textarea
              value={envText}
              onChange={(event) => setEnvText(event.target.value)}
              placeholder={isEdit ? '留空则保留原环境变量；填写 KEY=value 会替换原 env。' : 'KEY=value\nTOKEN=...'}
            />
          </label>
        </>
      ) : (
        <>
          <label>
            服务 URL
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/sse" />
          </label>
          <label>
            认证方式
            <select value={auth} onChange={(event) => setAuth(event.target.value as 'none' | 'oauth' | 'header')}>
              <option value="none">无认证</option>
              <option value="oauth">OAuth</option>
              <option value="header">Header</option>
            </select>
          </label>
          {auth === 'header' && (
            <div className="manual-mcp-grid">
              <label>
                Header 名称
                <input value={authHeaderName} onChange={(event) => setAuthHeaderName(event.target.value)} placeholder="Authorization" />
              </label>
              <label>
                Header 值
                <input
                  value={authHeaderValue}
                  onChange={(event) => setAuthHeaderValue(event.target.value)}
                  placeholder={isEdit ? '留空保留原 headers' : 'Bearer ${MY_MCP_TOKEN}'}
                />
              </label>
            </div>
          )}
          <span className="manual-mcp-note">Header 值建议写成环境变量占位符，例如 Bearer ${'{'}MY_MCP_TOKEN{'}'}；界面只回显 Header 名称，不读取密钥。</span>
        </>
      )}
      <div className="modal-actions">
        <button type="button" className="ghost-button" onClick={onClose}>取消</button>
        <button className="send-button" disabled={isSaving || !name.trim()}>
          {isSaving ? <Loader2 size={15} className="spin" /> : isEdit ? <Wrench size={15} /> : <Plus size={15} />}
          {isEdit ? '保存并测试' : '添加并测试'}
        </button>
      </div>
    </form>
  )
}

function McpMarketplaceModal({
  onClose,
  onInstalled,
  recommendations
}: {
  onClose: () => void
  onInstalled: (result: HermesMcpInstallResult) => void
  recommendations: HermesMcpRecommendations | null
}) {
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<HermesMcpMarketplaceCandidate[]>([])
  const [selected, setSelected] = useState<HermesMcpMarketplaceCandidate | null>(null)
  const [marketMode, setMarketMode] = useState<'recommended' | 'search'>(recommendations?.categories.length ? 'recommended' : 'search')
  const [isLoading, setIsLoading] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installResult, setInstallResult] = useState<HermesMcpInstallResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recommendedCandidates = useMemo(
    () => (recommendations?.categories ?? []).flatMap((group) => group.candidates),
    [recommendations]
  )
  const visibleCandidates = marketMode === 'recommended' ? recommendedCandidates : candidates

  async function runSearch(nextQuery = query) {
    setIsLoading(true)
    setError(null)
    setMarketMode('search')
    try {
      const response = await searchHermesMcpMarketplace(nextQuery)
      setCandidates(response.candidates)
      setSelected(response.candidates[0] ?? null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setCandidates([])
      setSelected(null)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleInstall(candidate: HermesMcpMarketplaceCandidate) {
    setInstallingId(candidate.id)
    setError(null)
    setInstallResult(null)
    try {
      const result = await installHermesMcpServer(candidate)
      setInstallResult(result)
      onInstalled(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setInstallingId(null)
    }
  }

  useEffect(() => {
    if (recommendedCandidates.length) {
      setMarketMode('recommended')
      setSelected(recommendedCandidates[0] ?? null)
    } else {
      void runSearch('')
    }
  }, [recommendedCandidates.length])

  return (
    <div className="mcp-marketplace-modal">
      <div className="marketplace-head">
        <div>
          <h2>MCP 市场</h2>
          <p>推荐内容来自每日 MCP 日报；也可以手动搜索 GitHub 上的 MCP 服务。</p>
        </div>
        <button className="settings-close inline" onClick={onClose} aria-label="关闭 MCP 市场">
          <XCircle size={18} />
        </button>
      </div>
      <div className="marketplace-tabs">
        <button
          className={marketMode === 'recommended' ? 'active' : ''}
          disabled={!recommendedCandidates.length}
          onClick={() => {
            setMarketMode('recommended')
            setSelected(recommendedCandidates[0] ?? null)
          }}
        >
          每日推荐
        </button>
        <button
          className={marketMode === 'search' ? 'active' : ''}
          onClick={() => {
            setMarketMode('search')
            setSelected(candidates[0] ?? null)
          }}
        >
          搜索市场
        </button>
      </div>
      <form
        className="marketplace-search"
        onSubmit={(event) => {
          event.preventDefault()
          void runSearch()
        }}
      >
        <Search size={15} />
        <input value={query} placeholder="搜索 GitHub MCP 服务" onChange={(event) => setQuery(event.target.value)} />
        <button disabled={isLoading}>{isLoading ? <Loader2 size={14} className="spin" /> : '搜索'}</button>
      </form>
      {error && <div className="settings-error-line">{error}</div>}
      <div className="marketplace-body">
        <div className="marketplace-list">
          {marketMode === 'recommended' && recommendations?.aiSummary && (
            <div className="marketplace-daily-report">
              <strong>推荐日报</strong>
              <span>{recommendations.aiSummary}</span>
            </div>
          )}
          {isLoading && <div className="mcp-empty-state">正在从 GitHub 搜索 MCP 服务...</div>}
          {!isLoading && visibleCandidates.length === 0 && !error && (
            <div className="mcp-empty-state">
              {marketMode === 'recommended' ? '暂无每日推荐。请先在设置页生成日报。' : '没有找到匹配的 MCP 服务。'}
            </div>
          )}
          {visibleCandidates.map((candidate) => (
            <button
              className={selected?.id === candidate.id ? 'marketplace-item active' : 'marketplace-item'}
              key={candidate.id}
              onClick={() => setSelected(candidate)}
            >
              <McpIcon name={candidate.name} iconUrl={candidate.iconUrl} />
              <div>
                <strong>{candidate.name}</strong>
                <p>{candidate.description}</p>
                <small>{candidate.categoryLabel} · {candidate.repo} · {languageLabel(candidate.language)} · {candidate.stars} 个星标</small>
              </div>
              <Plus size={15} />
            </button>
          ))}
        </div>
        <div className="marketplace-detail">
          {selected ? (
            <>
              <div className="marketplace-detail-title">
                <strong>{selected.name}</strong>
                <a href={selected.url} target="_blank" rel="noreferrer">
                  查看仓库
                  <ExternalLink size={13} />
                </a>
              </div>
              <p>{selected.description}</p>
              <InfoGrid items={[
                ['配置名', selected.installName],
                ['语言', languageLabel(selected.language)],
                ['星标', String(selected.stars)],
                ['命令置信度', confidenceLabel(selected.confidence)],
                ['仓库说明', selected.sourceDescription]
              ]} />
              <div className="marketplace-command">
                <span>推荐的 Hermes 命令</span>
                <pre>{marketplaceCommand(selected)}</pre>
              </div>
              <div className="marketplace-safety">
                <Shield size={15} />
                <span>安装会写入 Hermes 本机配置，并在写入前自动备份 `config.yaml`。MCP 会在本机执行上面的启动命令。</span>
              </div>
              <div className="marketplace-note">
                安装后会立即调用 Hermes 原生测试，确认连接状态和工具发现结果。
              </div>
              {installResult?.installName === selected.installName && (
                <div className={installResult.testResult?.ok ? 'mcp-test-result ok' : 'mcp-test-result failed'}>
                  <div>
                    <strong>{installResult.testResult?.ok ? '安装并测试成功' : '已安装，测试未通过'}</strong>
                    <span>
                      {installResult.testResult
                        ? `${installResult.testResult.elapsedMs}ms${typeof installResult.testResult.toolCount === 'number' ? ` · ${installResult.testResult.toolCount} 个工具` : ''}`
                        : '等待测试结果'}
                    </span>
                  </div>
                  <pre>{installResult.testResult?.output || installResult.output || 'Hermes 没有返回安装输出。'}</pre>
                </div>
              )}
              <button
                className="marketplace-install-button"
                disabled={installingId === selected.id || !selected.suggestedCommand}
                onClick={() => void handleInstall(selected)}
              >
                {installingId === selected.id ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
                {selected.suggestedCommand ? '安装到 Hermes' : '需要手动配置'}
              </button>
            </>
          ) : (
            <div className="mcp-empty-state">选择一个 MCP 服务查看安装建议。</div>
          )}
        </div>
      </div>
    </div>
  )
}

function marketplaceCommand(candidate: HermesMcpMarketplaceCandidate) {
  if (!candidate.suggestedCommand) {
    return `hermes mcp add ${candidate.installName} --command <cmd> --args <args...>`
  }
  return `hermes mcp add ${candidate.installName} --command ${candidate.suggestedCommand} --args ${candidate.suggestedArgs.join(' ')}`
}

function splitShellLike(value: string) {
  return value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((part) => part.replace(/^['"]|['"]$/g, '')) ?? []
}

function languageLabel(value: string) {
  return value && value !== 'unknown' ? value : '未知语言'
}

function formatMaybeDate(value?: string) {
  if (!value) return '待生成'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '待生成'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function confidenceLabel(value: HermesMcpMarketplaceCandidate['confidence']) {
  if (value === 'high') return '高'
  if (value === 'medium') return '中'
  return '低，需要人工确认'
}

function InlineAddControl({
  value,
  placeholder,
  label = '',
  onChange,
  onAdd
}: {
  value: string
  placeholder: string
  label?: string
  onChange: (value: string) => void
  onAdd: () => void
}) {
  return (
    <div className="inline-add-control">
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onAdd()
          }
        }}
      />
      <button onClick={onAdd}>
        <Plus size={13} />
        {label}
      </button>
    </div>
  )
}

function MusicIcon() {
  return <span className="music-note">♪</span>
}

function SelectRow({
  icon,
  label,
  value,
  options,
  onChange
}: {
  icon: ReactNode
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="settings-select-row">
      {icon}
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  )
}

function Toggle({
  checked,
  disabled = false,
  onChange
}: {
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      className={checked ? 'settings-toggle active' : 'settings-toggle'}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="settings-info-grid">
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  )
}

function CloudIcon() {
  return <Globe2 size={15} />
}

function mcpLogo(name: string) {
  return name
    .split(/[-_\s]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2) || 'M'
}

function McpIcon({ name, iconUrl }: { name: string; iconUrl?: string }) {
  return (
    <span className="mcp-logo">
      {iconUrl && (
        <img
          src={iconUrl}
          alt=""
          onError={(event) => {
            event.currentTarget.style.display = 'none'
            const fallback = event.currentTarget.nextElementSibling
            if (fallback instanceof HTMLElement) fallback.hidden = false
          }}
        />
      )}
      <span hidden={Boolean(iconUrl)}>{mcpLogo(name)}</span>
    </span>
  )
}

function mcpServerSummary(server: HermesMcpConfig['servers'][number]) {
  const issues = server.issues.length ? ` · ${server.issues.join('、')}` : ''
  return `${server.description || inferMcpDescription(server)}${issues}`
}

function inferMcpDescription(server: HermesMcpConfig['servers'][number]) {
  const text = `${server.name} ${server.command ?? ''} ${server.args.join(' ')} ${server.url ?? ''}`.toLowerCase()
  if (text.includes('csv') || text.includes('excel') || text.includes('spreadsheet')) {
    return '表格分析能力：读取 CSV/表格文件，做字段识别、数据清洗、统计汇总和分析输出。'
  }
  if (text.includes('sqlite')) {
    return 'SQLite 数据库能力：查询和维护本机 SQLite 数据库，适合轻量数据分析。'
  }
  if (text.includes('vision') || text.includes('image') || text.includes('ocr')) {
    return '视觉理解能力：读取图片、截图或视觉素材，提取文字、结构和关键信息。'
  }
  if (text.includes('web-search') || text.includes('search')) {
    return '网页调研能力：联网搜索资料、读取网页结果，并把来源整理给 Hermes 使用。'
  }
  if (text.includes('lark') || text.includes('feishu')) {
    return '飞书工作流能力：连接云文档、消息、日历、审批等飞书工具，支撑办公自动化。'
  }
  return '本机 MCP 服务：为 Hermes 增加可调用的扩展工具能力。'
}

function selectedMcpToolNames(server: HermesMcpConfig['servers'][number], toolNames: string[]) {
  if (!toolNames.length) return []
  if (server.includeTools.length) {
    const include = new Set(server.includeTools)
    return toolNames.filter((name) => include.has(name))
  }
  if (server.excludeTools.length) {
    const exclude = new Set(server.excludeTools)
    return toolNames.filter((name) => !exclude.has(name))
  }
  return toolNames
}

function mcpTransportLabel(value: HermesMcpConfig['servers'][number]['transport']) {
  if (value === 'stdio') return '标准输入输出'
  if (value === 'http') return 'HTTP'
  if (value === 'sse') return 'SSE'
  return '未知传输'
}

function mcpAuthLabel(server: HermesMcpConfig['servers'][number]) {
  if (server.auth === 'oauth') return 'OAuth'
  if (server.auth === 'header') return server.headerKeys.length ? `Header：${server.headerKeys.join(', ')}` : 'Header'
  if (server.auth === 'unknown') return '未知认证'
  return '无认证'
}

function mcpToolModeLabel(value: string) {
  if (value === 'all') return '全部工具'
  if (value.endsWith(' selected')) return `${value.replace(' selected', '')} 个已选择工具`
  if (value.endsWith(' excluded')) return `${value.replace(' excluded', '')} 个已排除工具`
  return value
}

function hermesProviderId(label: string) {
  const map: Record<string, string> = {
    'Hermes 当前 Provider': 'auto',
    'Custom endpoint': 'custom',
    Anthropic: 'anthropic',
    'OpenAI Codex': 'openai-codex',
    MiniMax: 'minimax',
    'Xiaomi MiMo': 'xiaomi',
    OpenRouter: 'openrouter',
    'Kimi / Moonshot': 'kimi',
    'Z.AI / GLM': 'zai'
  }
  return map[label] ?? label.trim().toLowerCase().replace(/\s+/g, '-')
}

function FragmentWithTrace({
  message,
  task,
  traceAfterMessageId
}: {
  message: Message
  task: Task | undefined
  traceAfterMessageId?: string
}) {
  return (
    <>
      <article className={`message ${message.role}`}>
        <div className="message-meta">
          {message.role === 'user' ? '你' : 'Hermes'}
          <span>{formatTime(message.createdAt)}</span>
        </div>
        <div className="message-body">{message.content}</div>
      </article>
      {task && message.id === traceAfterMessageId && <InlineExecutionTrace task={task} />}
    </>
  )
}

function InlineExecutionTrace({ task }: { task: Task }) {
  const rows = executionTraceRows(task)
  if (!rows.length) return null

  const toolCount = rows.filter((row) => row.kind === 'tool' || row.kind === 'search' || row.kind === 'file').length
  const thinkingCount = rows.filter((row) => row.kind === 'thinking').length
  const fileCount = rows.filter((row) => row.kind === 'file').length
  const searchCount = rows.filter((row) => row.kind === 'search').length
  const errorCount = rows.filter((row) => row.kind === 'error').length
  const defaultOpen = task.status === 'running' || rows.length <= 8
  const lastRow = rows[rows.length - 1]

  return (
    <section className="agent-trace">
      <div className="agent-trace-agent">
        <div className="agent-avatar">
          <Bot size={15} />
        </div>
        <strong>Hermes Cowork</strong>
        {task.status === 'running' && <Loader2 size={13} className="spin" />}
      </div>

      <details className="agent-trace-details" open={defaultOpen}>
        <summary>
          <span>查看详情</span>
          <ChevronDown size={14} />
        </summary>
        <div className="agent-trace-stats">
          <span>{thinkingCount} 条思考摘要</span>
          <span>{toolCount} 次操作</span>
          {fileCount > 0 && <span>{fileCount} 次文件动作</span>}
          {searchCount > 0 && <span>{searchCount} 次网页/搜索</span>}
          {errorCount > 0 && <span className="danger-text">{errorCount} 个异常</span>}
          <span>{statusLabel(task.status)}</span>
        </div>
        {lastRow && (
          <div className={`agent-trace-current ${lastRow.kind}`}>
            <span className="agent-trace-icon">{traceIcon(lastRow.kind)}</span>
            <div>
              <strong>{lastRow.title}</strong>
              {lastRow.detail && <p>{lastRow.detail}</p>}
            </div>
          </div>
        )}
        <div className="agent-trace-lanes">
          {(['thinking', 'search', 'file', 'tool', 'done'] as TraceRow['kind'][]).map((kind) => {
            const active = rows.some((row) => row.kind === kind)
            return <span className={active ? `active ${kind}` : ''} key={kind}>{traceKindLabel(kind)}</span>
          })}
        </div>
        <ol className="agent-trace-list">
          {rows.map((row) => (
            <li className={`agent-trace-row ${row.kind}`} key={row.id}>
              <span className="agent-trace-icon">{traceIcon(row.kind)}</span>
              <div>
                <strong>{row.title}</strong>
                {row.detail && <p>{row.detail}</p>}
              </div>
              <time>{formatTime(row.createdAt)}</time>
            </li>
          ))}
        </ol>
      </details>
    </section>
  )
}

function SkillDetailModal({
  skill,
  files,
  selectedFile,
  content,
  error,
  onClose,
  onSelectFile,
  onToggle,
  onUseSkill
}: {
  skill: Skill
  files: SkillFile[]
  selectedFile: SkillFile | null
  content: string
  error: string | null
  onClose: () => void
  onSelectFile: (file: SkillFile) => void
  onToggle: () => void
  onUseSkill: () => void
}) {
  const fileCount = files.filter((file) => file.type === 'file').length
  const directoryCount = files.filter((file) => file.type === 'directory').length

  return (
    <div className="modal skill-detail-modal">
      <div className="skill-detail-head">
        <div className="skill-detail-title">
          <BookOpen size={28} />
          <div>
            <h2>{skill.name}</h2>
            <p>
              {sourceLabel(skill.source)} · {fileCount} 个文件 · {directoryCount} 个文件夹
            </p>
          </div>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="关闭技能详情">
          <XCircle size={18} />
        </button>
      </div>

      <p className="skill-detail-description">{skill.description}</p>

      <div className="skill-browser">
        <aside className="skill-file-tree">
          <div className="skill-browser-label">
            <Files size={14} />
            文件
          </div>
          {!files.length && <p className="muted-copy">正在读取文件列表...</p>}
          {files.map((file) => (
            <button
              className={selectedFile?.relativePath === file.relativePath ? 'active' : ''}
              key={file.relativePath}
              onClick={() => onSelectFile(file)}
              title={file.path}
            >
              {file.type === 'directory' ? <Folder size={14} /> : <FileText size={14} />}
              <span>{file.relativePath}</span>
            </button>
          ))}
        </aside>

        <section className="skill-file-preview">
          <div className="skill-file-preview-head">
            <div>
              <strong>{selectedFile?.relativePath ?? '选择文件'}</strong>
              {selectedFile && (
                <span>
                  {selectedFile.type === 'file' ? formatBytes(selectedFile.size) : '文件夹'} · {formatTime(selectedFile.modifiedAt)}
                </span>
              )}
            </div>
            {selectedFile?.previewable && (
              <button className="ghost-button" onClick={() => void copyToClipboard(content)}>
                <Copy size={14} />
                复制
              </button>
            )}
          </div>
          {error ? (
            <div className="skill-file-error">{error}</div>
          ) : selectedFile?.type === 'directory' ? (
            <div className="skill-file-empty">
              <Folder size={22} />
              <span>这是一个文件夹，请选择其中的文件。</span>
            </div>
          ) : selectedFile ? (
            <pre className="skill-file-content">{content || '正在读取...'}</pre>
          ) : (
            <div className="skill-file-empty">
              <Code2 size={22} />
              <span>选择左侧文件查看内容。</span>
            </div>
          )}
        </section>
      </div>

      <div className="modal-actions skill-detail-actions">
        <button className="ghost-button" onClick={onToggle}>
          {skill.enabled ? '禁用' : '启用'}
        </button>
        <button className="ghost-button" onClick={onUseSkill}>
          <Play size={14} />
          使用技能
        </button>
        <button className="send-button" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}

function PreviewModal({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  return (
    <div className={`modal preview-modal ${preview.kind}-preview-modal`}>
      <div className="preview-head">
        <div>
          <h2>{preview.title}</h2>
          <p>
            {preview.kind === 'markdown' && 'Markdown 文档预览'}
            {preview.kind === 'csv' && '表格数据预览'}
            {preview.kind === 'text' && '文本预览'}
          </p>
        </div>
        <button className="ghost-button" onClick={() => void copyToClipboard(preview.body)}>
          <Copy size={14} />
          复制全文
        </button>
      </div>
      <PreviewBody preview={preview} />
      <div className="modal-actions">
        <button className="send-button" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}

function PreviewBody({ preview }: { preview: Preview }) {
  if (preview.kind === 'markdown') {
    return <div className="markdown-preview">{renderMarkdown(preview.body)}</div>
  }

  if (preview.kind === 'csv') {
    return <CsvPreview title={preview.title} body={preview.body} />
  }

  return <pre className="text-preview">{preview.body}</pre>
}

function CsvPreview({ title, body }: { title: string; body: string }) {
  const delimiter = title.toLowerCase().endsWith('.tsv') ? '\t' : ','
  const rows = parseDelimitedRows(body, delimiter)
  if (!rows.length) return <p className="muted-copy">这个文件没有可展示的数据。</p>

  const [header, ...dataRows] = rows
  const visibleRows = dataRows.slice(0, 200)
  const columnCount = Math.max(...rows.map((row) => row.length))

  return (
    <div className="csv-preview">
      <div className="preview-meta">
        <span>{rows.length - 1} 行数据</span>
        <span>{columnCount} 列</span>
        {dataRows.length > visibleRows.length && <span>仅展示前 {visibleRows.length} 行</span>}
      </div>
      <div className="csv-table-wrap">
        <table>
          <thead>
            <tr>
              {Array.from({ length: columnCount }).map((_, index) => (
                <th key={`head-${index}`}>{header[index] || `列 ${index + 1}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {Array.from({ length: columnCount }).map((_, index) => (
                  <td key={`${rowIndex}-${index}`}>{row[index] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: Task['status'] }) {
  if (status === 'running') return <Loader2 size={15} className="spin" />
  if (status === 'completed') return <CheckCircle2 size={15} />
  if (status === 'failed') return <XCircle size={15} />
  if (status === 'stopped') return <Square size={15} />
  return <Circle size={15} />
}

function SidebarRecentTaskRow({
  task,
  active,
  onSelect
}: {
  task: Task
  active: boolean
  onSelect: () => void
}) {
  return (
    <button className={active ? 'recent-task-row active' : 'recent-task-row'} onClick={onSelect}>
      <span className={`recent-task-status ${task.status}`} />
      <span>{task.title}</span>
      {task.pinned && <Star size={11} />}
    </button>
  )
}

function TaskRow({
  task,
  active,
  onSelect,
  onPin,
  onArchive,
  onDelete
}: {
  task: Task
  active: boolean
  onSelect: () => void
  onPin: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={[
        'task-row',
        active ? 'active' : '',
        task.pinned ? 'pinned' : '',
        task.archivedAt ? 'archived' : ''
      ].filter(Boolean).join(' ')}
    >
      <button className="task-card" onClick={onSelect}>
        <StatusIcon status={task.status} />
        <div className="task-card-main">
          <span>{task.title}</span>
          {(task.skillNames ?? []).length > 0 && <em>{task.skillNames?.join('、')}</em>}
        </div>
        <small>{formatTime(task.createdAt)}</small>
      </button>
      <button
        className={task.pinned ? 'task-action active' : 'task-action'}
        title={task.pinned ? '取消收藏' : '收藏置顶'}
        onClick={onPin}
      >
        <Star size={14} />
      </button>
      <button
        className="task-action"
        title={task.archivedAt ? '移回活跃任务' : '归档任务'}
        onClick={onArchive}
      >
        {task.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />}
      </button>
      <button
        className="task-delete"
        title="删除任务记录"
        onClick={onDelete}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function TemplateIcon({ name }: { name: string }) {
  if (name === 'web') return <Globe2 size={28} />
  if (name === 'research') return <Presentation size={28} />
  if (name === 'data') return <BarChart3 size={28} />
  if (name === 'files') return <FolderOpen size={28} />
  return <Hammer size={28} />
}

function EmptyInspectorState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-inspector-state">
      <Circle size={18} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
}

function TaskSummaryCard({ task, workspace }: { task?: Task; workspace?: Workspace }) {
  if (!task) {
    return (
      <section className="inspector-card task-summary-card">
        <h3>任务总览</h3>
        <EmptyInspectorState title="未选择任务" detail="选择左侧任务后，这里会显示模型、工作区和运行状态。" />
      </section>
    )
  }

  const stats = taskOperationStats(task)
  const summaryRows = executionTraceRows(task)
  const latest = summaryRows[summaryRows.length - 1]

  return (
    <section className="inspector-card task-summary-card">
      <div className="task-summary-head">
        <div>
          <span>当前任务</span>
          <strong>{task.title}</strong>
        </div>
        <div className={`status-pill compact ${task.status}`}>
          <StatusIcon status={task.status} />
          {statusLabel(task.status)}
        </div>
      </div>

      <div className="task-summary-metrics">
        <div>
          <span>模型</span>
          <strong>{task.modelId === 'auto' || !task.modelId ? 'Hermes 默认' : task.modelId}</strong>
        </div>
        <div>
          <span>工作区</span>
          <strong>{workspace?.name ?? task.workspaceId}</strong>
        </div>
        <div>
          <span>运行时长</span>
          <strong>{taskElapsedLabel(task)}</strong>
        </div>
        <div>
          <span>Session</span>
          <strong>{task.hermesSessionId ?? '未生成'}</strong>
        </div>
      </div>

      <div className="task-summary-strip">
        <span><Brain size={13} />{stats.thinking} 思考</span>
        <span><Wrench size={13} />{stats.tools} 工具</span>
        <span><FileText size={13} />{stats.files} 文件</span>
        <span><FileArchive size={13} />{task.artifacts.length} 产物</span>
      </div>

      {latest && (
        <div className={`task-summary-latest ${latest.kind}`}>
          <span className="agent-trace-icon">{traceIcon(latest.kind)}</span>
          <div>
            <strong>{latest.title}</strong>
            {latest.detail && <p>{latest.detail}</p>}
          </div>
        </div>
      )}
    </section>
  )
}

function RecentOperations({ task }: { task: Task }) {
  const rows = executionTraceRows(task).filter((row) => row.kind !== 'thinking').slice(-6)
  if (!rows.length) return <p className="muted-copy">还没有捕获到工具、网页、文件或结果事件。</p>

  return (
    <ol className="recent-operations">
      {rows.map((row) => (
        <li className={row.kind} key={row.id}>
          <span className="agent-trace-icon">{traceIcon(row.kind)}</span>
          <div>
            <strong>{row.title}</strong>
            {row.detail && <p>{row.detail}</p>}
          </div>
          <time>{formatTime(row.createdAt)}</time>
        </li>
      ))}
    </ol>
  )
}

function ExecutionPane({ task, tab }: { task: Task; tab: 'response' | 'tools' | 'logs' | 'errors' }) {
  const view = task.executionView
  if (!view) return <p className="muted-copy">还没有运行信息。</p>

  if (tab === 'response') {
    return view.response ? <pre className="detail-pane">{view.response}</pre> : <p className="muted-copy">正文会在 Hermes 返回后显示。</p>
  }

  if (tab === 'tools') {
    const toolEvents = task.events?.filter((event) => event.type.startsWith('tool.')) ?? []
    if (toolEvents.length) {
      return <ToolCards events={toolEvents} dense />
    }

    return view.tools.length ? (
      <ul className="detail-list">
        {view.tools.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    ) : (
      <p className="muted-copy">当前没有可识别的工具或命令记录。CLI quiet 模式会隐藏部分工具细节。</p>
    )
  }

  if (tab === 'errors') {
    return view.errors.length ? (
      <ul className="detail-list error-list">
        {view.errors.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    ) : (
      <p className="muted-copy">没有错误。</p>
    )
  }

  return view.logs.length || view.rawLog ? (
    <pre className="detail-pane">{view.logs.length ? view.logs.join('\n') : view.rawLog}</pre>
  ) : (
    <p className="muted-copy">暂无运行日志。</p>
  )
}

function EventTimeline({ events }: { events: ExecutionEvent[] }) {
  const visible = events.filter((event) =>
    ['bridge.started', 'step', 'thinking', 'status', 'tool.started', 'tool.completed', 'artifact.created', 'task.completed', 'task.failed'].includes(
      event.type
    )
  )

  if (!visible.length) {
    return <p className="muted-copy">还没有步骤事件。新任务运行时会实时出现。</p>
  }

  return (
    <ol className="event-timeline">
      {visible.slice(-14).map((event) => (
        <li key={event.id} className={`event ${event.type.replace('.', '-')}`}>
          <span className="event-dot" />
          <div>
            <strong>{eventTitle(event)}</strong>
            <p>{eventSummary(event)}</p>
          </div>
          <time>{formatTime(event.createdAt)}</time>
        </li>
      ))}
    </ol>
  )
}

function ToolCards({ events, dense = false }: { events: ExecutionEvent[]; dense?: boolean }) {
  const [toolQuery, setToolQuery] = useState('')
  const [copiedPayload, setCopiedPayload] = useState<string | null>(null)
  const toolEvents = events.filter((event) => event.type.startsWith('tool.'))
  if (!toolEvents.length) {
    return <p className="muted-copy">当前任务没有工具调用，或 Hermes 没有暴露工具细节。</p>
  }

  const normalizedQuery = toolQuery.trim().toLowerCase()
  const completedCount = toolEvents.filter((event) => event.type === 'tool.completed').length
  const failedCount = toolEvents.filter((event) => event.isError).length
  const filteredEvents = normalizedQuery
    ? toolEvents.filter((event) => toolSearchText(event).includes(normalizedQuery))
    : toolEvents
  const visibleEvents = filteredEvents.slice(dense ? -14 : -8)

  async function handleCopy(key: string, value: unknown) {
    await copyToClipboard(payloadText(value))
    setCopiedPayload(key)
    window.setTimeout(() => setCopiedPayload((current) => (current === key ? null : current)), 1500)
  }

  return (
    <div className="tool-card-list">
      <div className="tool-toolbar">
        <label className="tool-filter">
          <Search size={13} />
          <input value={toolQuery} onChange={(event) => setToolQuery(event.target.value)} placeholder="过滤工具" />
        </label>
        <div className="tool-summary-strip">
          <span>{normalizedQuery ? `${filteredEvents.length}/${toolEvents.length}` : `${toolEvents.length} 条事件`}</span>
          <span>{completedCount} 次完成</span>
          {failedCount > 0 && <span className="danger-text">{failedCount} 次异常</span>}
        </div>
      </div>
      {!visibleEvents.length && <p className="muted-copy">没有匹配的工具事件。</p>}
      {visibleEvents.map((event) => (
        <article className={event.isError ? 'tool-card failed' : 'tool-card'} key={event.id}>
          <div className="tool-card-head">
            <Wrench size={14} />
            <strong title={toolDisplayName(event)}>{toolDisplayName(event)}</strong>
            <span>{toolPhaseLabel(event)}</span>
          </div>
          {toolPrimaryText(event) && <p>{toolPrimaryText(event)}</p>}
          <details className="tool-detail">
            <summary>
              <ChevronDown size={13} />
              参数与返回
            </summary>
            <div className="tool-detail-body">
              {toolPayloadSections(event).map((section) => (
                <div className="tool-payload" key={section.label}>
                  <div className="tool-payload-head">
                    <span>{section.label}</span>
                    <button
                      type="button"
                      title={`复制 ${section.label}`}
                      onClick={() => void handleCopy(`${event.id}-${section.label}`, section.value)}
                    >
                      {copiedPayload === `${event.id}-${section.label}` ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                  <pre>{stringifyPreview(section.value, dense ? 1800 : 900)}</pre>
                </div>
              ))}
            </div>
          </details>
        </article>
      ))}
    </div>
  )
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

function toolDisplayName(event: ExecutionEvent) {
  if (event.name) return String(event.name)
  if (Array.isArray(event.args)) {
    const [, maybeName] = event.args
    if (typeof maybeName === 'string' && maybeName.trim()) return maybeName
    const [kind] = event.args
    if (typeof kind === 'string' && kind.trim()) return kind
  }
  return event.type
}

function toolPhaseLabel(event: ExecutionEvent) {
  if (event.type === 'tool.started') return '开始'
  if (event.type === 'tool.completed') return event.isError ? '异常' : '完成'
  if (event.type === 'tool.progress') return '进度'
  return event.type.replace('tool.', '')
}

function toolPrimaryText(event: ExecutionEvent) {
  if (typeof event.summary === 'string' && event.summary.trim()) return event.summary
  if (typeof event.message === 'string' && event.message.trim()) return event.message
  if (typeof event.text === 'string' && event.text.trim()) return event.text
  if (Array.isArray(event.args) && typeof event.args[2] === 'string' && event.args[2].trim()) return event.args[2]
  if (typeof event.result === 'string' && event.result.trim()) return event.result.slice(0, 180)
  if (typeof event.error === 'string' && event.error.trim()) return event.error
  return ''
}

function toolSearchText(event: ExecutionEvent) {
  return [
    toolDisplayName(event),
    toolPhaseLabel(event),
    toolPrimaryText(event),
    ...toolPayloadSections(event).map((section) => payloadText(section.value))
  ]
    .join('\n')
    .toLowerCase()
}

function toolPayloadSections(event: ExecutionEvent) {
  const sections: { label: string; value: unknown }[] = []
  if (event.args !== undefined) sections.push({ label: 'args', value: event.args })
  if (event.kwargs !== undefined) sections.push({ label: 'kwargs', value: event.kwargs })
  if (event.result !== undefined) sections.push({ label: 'result', value: event.result })
  if (event.error !== undefined) sections.push({ label: 'error', value: event.error })
  if (!sections.length) sections.push({ label: 'event', value: event })
  return sections
}

function payloadText(value: unknown) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function hasDraggedFiles(event: ReactDragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes('Files')
}

function previewKind(title: string): Preview['kind'] {
  const lower = title.toLowerCase()
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown'
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return 'csv'
  return 'text'
}

function renderMarkdown(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    if (line.trim().startsWith('```')) {
      const codeLines = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push(<pre key={`code-${index}`}>{codeLines.join('\n')}</pre>)
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const text = heading[2]
      if (level === 1) blocks.push(<h1 key={`h-${index}`}>{text}</h1>)
      if (level === 2) blocks.push(<h2 key={`h-${index}`}>{text}</h2>)
      if (level === 3) blocks.push(<h3 key={`h-${index}`}>{text}</h3>)
      if (level >= 4) blocks.push(<h4 key={`h-${index}`}>{text}</h4>)
      index += 1
      continue
    }

    if (line.trim().startsWith('|') && lines[index + 1]?.includes('|')) {
      const tableLines = []
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        tableLines.push(lines[index])
        index += 1
      }
      const rows = tableLines
        .filter((item) => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(item))
        .map((item) => item.replace(/^\s*\|?|\|?\s*$/g, '').split('|').map((cell) => cell.trim()))
      if (rows.length) {
        const [header, ...body] = rows
        blocks.push(
          <div className="markdown-table-wrap" key={`table-${index}`}>
            <table>
              <thead>
                <tr>{header.map((cell, cellIndex) => <th key={`h-${cellIndex}`}>{cell}</th>)}</tr>
              </thead>
              <tbody>
                {body.map((row, rowIndex) => (
                  <tr key={`r-${rowIndex}`}>
                    {header.map((_, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{row[cellIndex] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ''))
        index += 1
      }
      blocks.push(
        <ul key={`ul-${index}`}>
          {items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
        </ul>
      )
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = []
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ''))
        index += 1
      }
      blocks.push(
        <ol key={`ol-${index}`}>
          {items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
        </ol>
      )
      continue
    }

    if (line.trim().startsWith('>')) {
      const quotes = []
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quotes.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      blocks.push(<blockquote key={`quote-${index}`}>{quotes.join('\n')}</blockquote>)
      continue
    }

    const paragraph = [line.trim()]
    index += 1
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,4})\s+/.test(lines[index]) &&
      !lines[index].trim().startsWith('```') &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index]) &&
      !lines[index].trim().startsWith('|')
    ) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push(<p key={`p-${index}`}>{paragraph.join(' ')}</p>)
  }

  return blocks.length ? blocks : <p className="muted-copy">这个 Markdown 文件没有可展示内容。</p>
}

function parseDelimitedRows(input: string, delimiter: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]
    if (char === '"' && inQuotes && next === '"') {
      cell += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === delimiter && !inQuotes) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(cell)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

function TodoSteps({ task }: { task: Task }) {
  const events = task.events ?? []
  const hasThinking = events.some((event) => event.type === 'thinking' || event.type === 'step')
  const hasTools = events.some((event) => event.type.startsWith('tool.'))
  const hasArtifacts = task.artifacts.length > 0
  const hasErrors = task.status === 'failed' || events.some((event) => event.type === 'task.failed')
  const wasStopped = task.status === 'stopped' || events.some((event) => event.type === 'task.stopped')

  const steps = [
    {
      label: '接收任务',
      detail: task.prompt,
      status: 'done'
    },
    {
      label: '理解与规划',
      detail: hasThinking ? 'Hermes 已进入推理流程' : '等待 Hermes 开始推理',
      status: hasThinking || task.status !== 'running' ? 'done' : 'running'
    },
    {
      label: '调用工具',
      detail: hasTools ? '已捕获工具/技能调用事件' : '本轮可能无需工具，或工具细节尚未暴露',
      status: hasTools ? 'done' : task.status === 'running' ? 'pending' : 'skipped'
    },
    {
      label: '沉淀产物',
      detail: hasArtifacts ? `识别到 ${task.artifacts.length} 个产物` : '暂无新增产物',
      status: hasArtifacts ? 'done' : task.status === 'completed' ? 'skipped' : 'pending'
    },
    {
      label: wasStopped ? '任务停止' : hasErrors ? '处理失败' : '返回结果',
      detail: wasStopped ? '用户主动停止了这次执行' : hasErrors ? task.error || '查看错误页签获取原因' : statusLabel(task.status),
      status: wasStopped ? 'stopped' : hasErrors ? 'failed' : task.status === 'completed' ? 'done' : task.status === 'running' ? 'running' : 'pending'
    }
  ]

  return (
    <ol className="todo-steps">
      {steps.map((step) => (
        <li className={`todo-step ${step.status}`} key={step.label}>
          <span />
          <div>
            <strong>{step.label}</strong>
            <p>{step.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function ReferenceInfo({ task, workspaceFiles }: { task?: Task; workspaceFiles: WorkspaceFile[] }) {
  const references = task ? extractTaskReferences(task) : []
  const skillNames = task?.skillNames ?? []
  const recentFiles = workspaceFiles.slice(0, 5)

  return (
    <div className="reference-info">
      <div className="reference-group">
        <span>技能</span>
        {skillNames.length ? (
          <ul className="skill-list">
            {skillNames.map((name) => (
              <li key={name}><BookOpen size={14} />{name}</li>
            ))}
          </ul>
        ) : (
          <p className="muted-copy">本任务未预载指定技能。</p>
        )}
      </div>

      <div className="reference-group">
        <span>联网与工具来源</span>
        {references.length ? (
          <ul className="reference-link-list">
            {references.slice(0, 10).map((reference) => (
              <li key={reference}>
                <Globe2 size={13} />
                <span title={reference}>{reference}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-copy">任务运行后，网页、搜索和工具来源会显示在这里。</p>
        )}
      </div>

      <div className="reference-group">
        <span>当前工作区</span>
        {recentFiles.length ? (
          <ul className="reference-link-list">
            {recentFiles.map((file) => (
              <li key={file.path}>
                <FileText size={13} />
                <span title={file.relativePath}>{file.relativePath}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-copy">当前授权工作区还没有可展示文件。</p>
        )}
      </div>
    </div>
  )
}

function WorkspaceFiles({
  files,
  onUseFile,
  onPreviewFile,
  onRevealFile
}: {
  files: WorkspaceFile[]
  onUseFile: (file: WorkspaceFile) => void
  onPreviewFile?: (file: WorkspaceFile) => void
  onRevealFile?: (file: WorkspaceFile) => void
}) {
  if (!files.length) {
    return <p className="muted-copy">当前授权工作区还没有可展示文件。</p>
  }

  return (
    <div className="workspace-file-list">
      {files.slice(0, 12).map((file) => (
        <div className="workspace-file" key={file.path} title={file.relativePath}>
          <FileText size={15} />
          <div>
            <strong>{file.name}</strong>
            <span>
              {file.type || 'file'} · {formatBytes(file.size)} · {formatTime(file.modifiedAt)}
            </span>
          </div>
          <button title="作为上下文发送给 Hermes" onClick={() => onUseFile(file)}>
            <Plus size={14} />
          </button>
          <button title="预览文本文件" onClick={() => onPreviewFile?.(file)}>
            <FileText size={14} />
          </button>
          <button title="在 Finder 中显示" onClick={() => onRevealFile?.(file)}>
            <FolderOpen size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

function latestUserMessageId(task?: Task) {
  return task?.messages.slice().reverse().find((message) => message.role === 'user')?.id
}

function mergeStreamedTask(current: AppState, task: Task): AppState {
  const exists = current.tasks.some((item) => item.id === task.id)
  const tasks = exists
    ? current.tasks.map((item) => (item.id === task.id ? task : item))
    : [task, ...current.tasks]

  return {
    ...current,
    tasks,
    messages: [
      ...current.messages.filter((message) => message.taskId !== task.id),
      ...(task.messages ?? [])
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    artifacts: [
      ...current.artifacts.filter((artifact) => artifact.taskId !== task.id),
      ...(task.artifacts ?? [])
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
}

type TraceRow = {
  id: string
  kind: 'thinking' | 'search' | 'tool' | 'file' | 'status' | 'done' | 'stopped' | 'error'
  title: string
  detail: string
  createdAt: string
}

function executionTraceRows(task: Task): TraceRow[] {
  const rows = (task.events ?? [])
    .filter((event) =>
      ['bridge.started', 'step', 'thinking', 'status', 'tool.started', 'tool.completed', 'tool.progress', 'artifact.created', 'task.completed', 'task.stopped', 'task.failed'].includes(
        event.type
      )
    )
    .map((event): TraceRow => {
      if (event.type === 'thinking') {
        return {
          id: event.id,
          kind: 'thinking',
          title: '思考',
          detail: eventSummary(event),
          createdAt: event.createdAt
        }
      }
      if (event.type === 'step') {
        return {
          id: event.id,
          kind: 'thinking',
          title: eventTitle(event),
          detail: eventSummary(event),
          createdAt: event.createdAt
        }
      }
      if (event.type.startsWith('tool.')) {
        const name = toolDisplayName(event)
        return {
          id: event.id,
          kind: traceToolKind(name, event),
          title: `${toolPhaseLabel(event)}：${name}`,
          detail: traceToolDetail(event),
          createdAt: event.createdAt
        }
      }
      if (event.type === 'artifact.created') {
        return {
          id: event.id,
          kind: 'file',
          title: `生成产物：${String(event.name ?? '文件')}`,
          detail: eventSummary(event),
          createdAt: event.createdAt
        }
      }
      if (event.type === 'task.completed') {
        return {
          id: event.id,
          kind: 'done',
          title: '任务完成',
          detail: 'Hermes 已返回最终结果',
          createdAt: event.createdAt
        }
      }
      if (event.type === 'task.stopped') {
        return {
          id: event.id,
          kind: 'stopped',
          title: '任务已停止',
          detail: eventSummary(event),
          createdAt: event.createdAt
        }
      }
      if (event.type === 'task.failed') {
        return {
          id: event.id,
          kind: 'error',
          title: '任务失败',
          detail: eventSummary(event),
          createdAt: event.createdAt
        }
      }
      return {
        id: event.id,
        kind: 'status',
        title: eventTitle(event),
        detail: eventSummary(event),
        createdAt: event.createdAt
      }
    })

  if (task.status === 'running' && !rows.some((row) => row.kind === 'done' || row.kind === 'error')) {
    rows.push({
      id: `${task.id}-running`,
      kind: 'status',
      title: '持续运行中',
      detail: 'Hermes 正在执行任务，新的思考和操作会继续出现在这里。',
      createdAt: task.updatedAt
    })
  }

  return rows.slice(-24)
}

function traceToolKind(name: string, event: ExecutionEvent): TraceRow['kind'] {
  if (event.category === 'search') return 'search'
  if (event.category === 'file') return 'file'
  if (event.category === 'error') return 'error'
  if (event.category === 'result') return 'done'
  const text = `${name} ${event.type} ${toolPrimaryText(event)} ${payloadText(event.args)} ${payloadText(event.kwargs)}`.toLowerCase()
  if (event.isError) return 'error'
  if (text.includes('search') || text.includes('browser') || text.includes('web') || text.includes('url') || text.includes('http')) return 'search'
  if (text.includes('file') || text.includes('read') || text.includes('write') || text.includes('workspace') || text.includes('path')) return 'file'
  return 'tool'
}

function traceToolDetail(event: ExecutionEvent) {
  const primary = toolPrimaryText(event)
  if (primary) return stringifyPreview(primary, 180)
  if (event.type === 'tool.started') return stringifyPreview(event.args ?? event.kwargs ?? '工具开始执行', 180)
  if (event.type === 'tool.completed') return event.isError ? eventSummary(event) : stringifyPreview(event.result ?? '工具执行完成', 180)
  return eventSummary(event)
}

function traceIcon(kind: TraceRow['kind']) {
  if (kind === 'thinking') return <Brain size={14} />
  if (kind === 'search') return <Globe2 size={14} />
  if (kind === 'file') return <FileText size={14} />
  if (kind === 'done') return <CheckCircle2 size={14} />
  if (kind === 'stopped') return <Square size={14} />
  if (kind === 'error') return <XCircle size={14} />
  if (kind === 'tool') return <Wrench size={14} />
  return <Clock3 size={14} />
}

function traceKindLabel(kind: TraceRow['kind']) {
  if (kind === 'thinking') return '思考'
  if (kind === 'search') return '检索'
  if (kind === 'file') return '文件'
  if (kind === 'tool') return '工具'
  if (kind === 'done') return '结果'
  if (kind === 'stopped') return '停止'
  if (kind === 'error') return '异常'
  return '状态'
}

function taskOperationStats(task: Task) {
  const rows = executionTraceRows(task)
  return {
    thinking: rows.filter((row) => row.kind === 'thinking').length,
    tools: rows.filter((row) => row.kind === 'tool' || row.kind === 'search' || row.kind === 'file').length,
    files: rows.filter((row) => row.kind === 'file').length,
    errors: rows.filter((row) => row.kind === 'error').length
  }
}

function taskElapsedLabel(task: Task) {
  const start = task.startedAt ?? task.createdAt
  const end = task.completedAt ?? (task.status === 'running' ? new Date().toISOString() : task.updatedAt)
  const elapsed = Math.max(0, new Date(end).getTime() - new Date(start).getTime())
  if (!Number.isFinite(elapsed) || elapsed <= 0) return '刚刚'
  const seconds = Math.floor(elapsed / 1000)
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const restSeconds = seconds % 60
  if (minutes < 60) return restSeconds ? `${minutes} 分 ${restSeconds} 秒` : `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes ? `${hours} 小时 ${restMinutes} 分` : `${hours} 小时`
}

function extractTaskReferences(task: Task) {
  const text = [
    task.prompt,
    task.stdout ?? '',
    ...(task.events ?? []).flatMap((event) => [
      toolPrimaryText(event),
      payloadText(event.args),
      payloadText(event.kwargs),
      payloadText(event.result)
    ])
  ].join('\n')
  const urls = text.match(/https?:\/\/[^\s"'<>）)]+/g) ?? []
  const files = text.match(/(?:\/Users\/[^\s"'<>]+|[\w.-]+\/[\w./-]+\.(?:md|csv|xlsx|pdf|docx|txt|json))/g) ?? []
  return [...new Set([...urls, ...files])].slice(0, 16)
}

function eventTitle(event: ExecutionEvent) {
  if (event.type === 'bridge.started') return '桥接已启动'
  if (event.type === 'step') return `第 ${event.iteration ?? '?'} 轮推理`
  if (event.type === 'thinking') return '思考中'
  if (event.type === 'status') return `状态：${event.kind ?? '运行'}`
  if (event.type === 'tool.started') return `开始工具：${event.name ?? 'tool'}`
  if (event.type === 'tool.completed') return `完成工具：${event.name ?? 'tool'}`
  if (event.type === 'artifact.created') return `生成产物：${event.name ?? '文件'}`
  if (event.type === 'task.completed') return '任务完成'
  if (event.type === 'task.stopped') return '任务已停止'
  if (event.type === 'task.failed') return '任务失败'
  return event.type
}

function eventSummary(event: ExecutionEvent) {
  if (event.type === 'bridge.started') return String(event.cwd ?? '授权工作区')
  if (event.type === 'step') return `${Array.isArray(event.previousTools) ? event.previousTools.length : 0} 个上一轮工具结果`
  if (event.type === 'thinking') return String(event.message || 'Hermes 正在处理')
  if (event.type === 'status') return String(event.message ?? '')
  if (event.type === 'tool.started') return stringifyPreview(event.args, 120)
  if (event.type === 'tool.completed') return event.isError ? '工具返回错误' : String(event.result ?? '工具执行完成').slice(0, 140)
  if (event.type === 'artifact.created') return String(event.summary ?? event.relativePath ?? '文件已加入产物区')
  if (event.type === 'task.completed') return 'Hermes 已返回最终结果'
  if (event.type === 'task.stopped') return String(event.summary ?? '用户已停止当前 Hermes 任务')
  if (event.type === 'task.failed') return String(event.error ?? 'Hermes 执行失败')
  return stringifyPreview(event, 140)
}

function stringifyPreview(value: unknown, limit = 260) {
  let text: string
  if (typeof value === 'string') {
    text = value
  } else {
    try {
      text = JSON.stringify(value, null, 2)
    } catch {
      text = String(value)
    }
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

function RuntimePanel({ runtime }: { runtime: HermesRuntime | null }) {
  if (!runtime) {
    return <p className="muted-copy">正在读取 Hermes 状态...</p>
  }

  const environment = runtime.parsed.Environment ?? {}
  const gateway = runtime.parsed['Gateway Service'] ?? {}
  const sessions = runtime.parsed.Sessions ?? {}
  const messaging = runtime.parsed['Messaging Platforms'] ?? {}
  const configuredPlatforms = Object.entries(messaging)
    .filter(([, value]) => !String(value).toLowerCase().includes('not configured'))
    .map(([name]) => name)

  return (
    <div className="runtime-panel">
      <div className="runtime-grid">
        <span>桥接方式</span>
        <strong title={runtime.bridgeMode}>{runtime.bridgeMode}</strong>
        <span>模型</span>
        <strong title={environment.Model}>{environment.Model ?? '未知'}</strong>
        <span>服务商</span>
        <strong title={environment.Provider}>{environment.Provider ?? '未知'}</strong>
        <span>网关</span>
        <strong title={gateway.Status}>{gateway.Status ?? '未知'}</strong>
        <span>会话</span>
        <strong title={sessions.Active}>{sessions.Active ?? '未知'}</strong>
      </div>

      {configuredPlatforms.length > 0 && (
        <p className="runtime-platforms">已配置平台：{configuredPlatforms.join('、')}</p>
      )}

      <details className="runtime-details">
        <summary>版本与路径</summary>
        <pre>{runtime.versionText}</pre>
        <pre>{runtime.paths.hermesBin}</pre>
        <pre>{runtime.paths.hermesPythonBin}</pre>
      </details>

      <p className="runtime-updated">更新于 {formatTime(runtime.updatedAt)}</p>
    </div>
  )
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function sourceLabel(source: Skill['source']) {
  if (source === 'plugin') return '插件'
  if (source === 'system') return '系统'
  if (source === 'uploaded') return '上传'
  return '用户'
}

function shortenSkillPath(value: string) {
  return value.replace(/^\/Users\/[^/]+/, '~')
}

function statusLabel(status: Task['status']) {
  return {
    idle: '未开始',
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    stopped: '已停止'
  }[status]
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

export default App
