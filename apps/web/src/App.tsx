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
  ExternalLink,
  FileArchive,
  FileText,
  Files,
  Folder,
  FolderSync,
  FolderOpen,
  FolderPlus,
  Globe2,
  Hammer,
  Info,
  Languages,
  Loader2,
  LogOut,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Palette,
  Pencil,
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
  FilePreviewPanel,
  isInlinePreviewKind,
  previewKind,
  type FilePreviewState,
  type FilePreviewTarget
} from './features/file-preview/FilePreviewPanel'
import { ChatComposer } from './features/chat/ChatComposer'
import { MessageBody } from './features/chat/MessageBody'
import {
  ContextResourcesCard,
  TaskArtifactsCard,
  TaskProgressCard
} from './features/chat/TaskInspectorCards'
import {
  ModelConfigModal,
  ModelSettingsSection,
  configuredModelOptionsForComposer,
  defaultModelApiMode,
  groupModelOptionsForMenu,
  hermesProviderId,
  providerSavedModelConfig
} from './features/settings/models'
import {
  ConnectorsView as McpConnectorsView,
  ManualMcpModal as SettingsManualMcpModal,
  McpMarketplaceModal as SettingsMcpMarketplaceModal,
  McpSettingsSection
} from './features/settings/mcp'
import { TaskFocusPanel } from './features/chat/TaskFocusPanel'
import {
  InlineExecutionTracePanel,
  LiveExecutionPanelView,
  traceIcon
} from './features/chat/ExecutionTracePanels'
import {
  compactTraceRows,
  executionTraceRows,
  fallbackLiveTraceRow,
  groupTraceRows,
  liveTraceRows,
  taskElapsedLabel,
  taskStepItems,
  traceSummaryParts,
  workModeLabel
} from './features/chat/executionTraceModel'
import { latestUserMessageId } from './features/chat/messageUtils'
import { mergeStreamedTask } from './features/chat/taskState'
import { useTaskContext } from './features/chat/useTaskContext'
import { useTaskStream, type TaskStreamStatus } from './features/chat/useTaskStream'
import { useTaskSelection } from './features/chat/useTaskSelection'
import { SidebarWorkspaceNode } from './features/workspace/SidebarWorkspaceNode'
import { ProjectsView } from './features/workspace/ProjectsView'
import { artifactPreviewTarget, previewRawUrl, workspacePreviewTarget } from './features/workspace/previewTargets'
import { useWorkspaceFiles } from './features/workspace/useWorkspaceFiles'
import {
  addWorkspace,
  deleteWorkspace,
  pickWorkspaceDirectory,
  previewWorkspaceFile,
  revealWorkspace,
  revealWorkspaceFile,
  updateWorkspace,
  uploadFile,
  type Workspace,
  type WorkspaceFile
} from './features/workspace/workspaceApi'
import {
  AppState,
  archiveTask,
  Artifact,
  BackgroundServiceStatus,
  configureHermesModel,
  configureHermesReasoning,
  configureHermesMcpServer,
  createTask,
  deleteHermesModelProvider,
  deleteModel,
  deleteTask,
  getBackgroundStatus,
  getHermesMcpConfig,
  getHermesMcpRecommendations,
  getHermesRuntime,
  getHermesSessions,
  getHermesUpdateStatus,
  getHermesMcpServeStatus,
  HermesMcpConfig,
  HermesMcpInstallResult,
  HermesMcpManualConfigRequest,
  HermesMcpRecommendations,
  HermesMcpServeStatus,
  HermesMcpTestResult,
  HermesModelCatalogProvider,
  HermesModelOverview,
  HermesReasoningConfigureRequest,
  HermesSessionSummary,
  HermesAutoUpdateResult,
  HermesCompatibilityTestResult,
  HermesUpdateStatus,
  getState,
  HermesRuntime,
  installBackgroundServices,
  listSkillFiles,
  listModels,
  listSkills,
  Message,
  ModelOption,
  previewArtifact,
  readSkillFile,
  refreshModelCatalog,
  refreshHermesMcpRecommendationsWithAi,
  removeHermesMcpServer,
  revealArtifact,
  runHermesAutoUpdate,
  runHermesCompatibilityTest,
  pinTask,
  sendTaskMessage,
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
  tasksExportUrl,
  Skill,
  SkillFile,
  toggleSkill,
  uninstallBackgroundServices,
  updateHermesMcpServer,
  uploadSkill,
} from './lib/api'
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode
} from 'react'

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

function closeOnBackdropMouseDown(onClose: () => void) {
  return (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }
}

const PANEL_LAYOUT_STORAGE_KEY = 'hermes-cowork-panel-layout-v1'
const DEFAULT_SIDEBAR_WIDTH = 286
const DEFAULT_INSPECTOR_WIDTH = 780
const MIN_SIDEBAR_WIDTH = 220
const MAX_SIDEBAR_WIDTH = 380
const MIN_MAIN_WIDTH = 520
const MIN_INSPECTOR_WIDTH = 420
const MAX_INSPECTOR_WIDTH = 1120

type PaneResizeTarget = 'left' | 'right'
type PanelLayout = {
  left: number
  right: number
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function clampPanelLayout(layout: PanelLayout, options: { leftCollapsed?: boolean } = {}): PanelLayout {
  const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth || 1440
  const left = clampNumber(layout.left, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH)
  const effectiveLeft = options.leftCollapsed ? 0 : left
  const maxRightByViewport = Math.max(MIN_INSPECTOR_WIDTH, viewportWidth - effectiveLeft - MIN_MAIN_WIDTH)
  const right = clampNumber(layout.right, MIN_INSPECTOR_WIDTH, Math.min(MAX_INSPECTOR_WIDTH, maxRightByViewport))
  return { left, right }
}

function readPanelLayout(): PanelLayout {
  if (typeof window === 'undefined') {
    return { left: DEFAULT_SIDEBAR_WIDTH, right: DEFAULT_INSPECTOR_WIDTH }
  }
  const stored = window.localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<PanelLayout>
      if (typeof parsed.left === 'number' && typeof parsed.right === 'number') {
        return clampPanelLayout({ left: parsed.left, right: parsed.right })
      }
    } catch {
      window.localStorage.removeItem(PANEL_LAYOUT_STORAGE_KEY)
    }
  }
  return clampPanelLayout({
    left: DEFAULT_SIDEBAR_WIDTH,
    right: Math.round((window.innerWidth || 1440) * 0.38)
  })
}

function App() {
  const [state, setState] = useState<AppState>(emptyState)
  const [viewMode, setViewMode] = useState<ViewMode>('tasks')
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false)
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false)
  const [panelLayout, setPanelLayout] = useState<PanelLayout>(() => readPanelLayout())
  const [draggingPane, setDraggingPane] = useState<PaneResizeTarget | null>(null)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('default')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null | undefined>(undefined)
  const [prompt, setPrompt] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [stoppingTaskId, setStoppingTaskId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [workspacePicking, setWorkspacePicking] = useState(false)
  const [filePreview, setFilePreview] = useState<FilePreviewState | null>(null)
  const [detailTab, setDetailTab] = useState<'response' | 'tools' | 'logs' | 'errors'>('response')
  const [workspaceUpdatingId, setWorkspaceUpdatingId] = useState<string | null>(null)
  const [taskSearch, setTaskSearch] = useState('')
  const [taskScope, setTaskScope] = useState<'active' | 'archived' | 'all'>('active')
  const [taskWorkspaceScope, setTaskWorkspaceScope] = useState<'current' | 'all'>('current')
  const [selectedTaskTag, setSelectedTaskTag] = useState('all')
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [runtime, setRuntime] = useState<HermesRuntime | null>(null)
  const [hermesUpdate, setHermesUpdate] = useState<HermesUpdateStatus | null>(null)
  const [hermesUpdateLoading, setHermesUpdateLoading] = useState(false)
  const [hermesUpdateError, setHermesUpdateError] = useState<string | null>(null)
  const [hermesCompatibilityResult, setHermesCompatibilityResult] = useState<HermesCompatibilityTestResult | null>(null)
  const [hermesCompatibilityRunning, setHermesCompatibilityRunning] = useState(false)
  const [hermesCompatibilityError, setHermesCompatibilityError] = useState<string | null>(null)
  const [hermesAutoUpdateResult, setHermesAutoUpdateResult] = useState<HermesAutoUpdateResult | null>(null)
  const [hermesAutoUpdating, setHermesAutoUpdating] = useState(false)
  const [hermesAutoUpdateError, setHermesAutoUpdateError] = useState<string | null>(null)
  const [hermesSessions, setHermesSessions] = useState<HermesSessionSummary[]>([])
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
  const [modelCatalog, setModelCatalog] = useState<HermesModelCatalogProvider[]>([])
  const [selectedModelId, setSelectedModelId] = useState('auto')
  const [hermesModel, setHermesModel] = useState<HermesModelOverview | null>(null)
  const [hermesModelUpdating, setHermesModelUpdating] = useState<string | null>(null)
  const [hermesModelError, setHermesModelError] = useState<string | null>(null)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [modelPanelOpen, setModelPanelOpen] = useState(false)
  const [newModelId, setNewModelId] = useState('')
  const [newModelLabel, setNewModelLabel] = useState('')
  const [newModelProvider, setNewModelProvider] = useState('')
  const [newModelBaseUrl, setNewModelBaseUrl] = useState('')
  const [newModelApiKey, setNewModelApiKey] = useState('')
  const [newModelApiMode, setNewModelApiMode] = useState('chat_completions')
  const [modelPanelSaving, setModelPanelSaving] = useState(false)
  const [modelCatalogRefreshing, setModelCatalogRefreshing] = useState(false)
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
  const modelPickerRef = useRef<HTMLDivElement | null>(null)
  const conversationRef = useRef<HTMLElement | null>(null)
  const conversationEndRef = useRef<HTMLDivElement | null>(null)
  const conversationFollowRef = useRef(true)
  const dragDepthRef = useRef(0)
  const panelLayoutRef = useRef(panelLayout)
  const selectedTaskIdRef = useRef<string | null | undefined>(selectedTaskId)
  const selectedWorkspaceIdRef = useRef(selectedWorkspaceId)

  useEffect(() => {
    panelLayoutRef.current = panelLayout
  }, [panelLayout])

  useEffect(() => {
    window.localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(panelLayout))
  }, [panelLayout])

  useEffect(() => {
    const handleResize = () => {
      setPanelLayout((current) => clampPanelLayout(current, { leftCollapsed: leftSidebarCollapsed }))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [leftSidebarCollapsed])

  const startPaneResize = (target: PaneResizeTarget, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setDraggingPane(target)
    const startX = event.clientX
    const startLayout = panelLayoutRef.current
    document.body.classList.add('resizing-panels')

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      const nextLayout =
        target === 'left'
          ? { ...startLayout, left: startLayout.left + deltaX }
          : { ...startLayout, right: startLayout.right - deltaX }
      setPanelLayout(clampPanelLayout(nextLayout, { leftCollapsed: leftSidebarCollapsed }))
    }

    const stopResize = () => {
      setDraggingPane(null)
      document.body.classList.remove('resizing-panels')
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
  }

  const refresh = async () => {
    const next = await getState()
    setState(next)
    if (selectedTaskIdRef.current === undefined && next.tasks.length > 0) {
      setSelectedTaskId(next.tasks[0].id)
      selectedTaskIdRef.current = next.tasks[0].id
    }
    if (!next.workspaces.some((workspace) => workspace.id === selectedWorkspaceIdRef.current)) {
      const fallbackWorkspaceId = next.workspaces[0]?.id ?? 'default'
      setSelectedWorkspaceId(fallbackWorkspaceId)
      selectedWorkspaceIdRef.current = fallbackWorkspaceId
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
    setModelCatalog(nextModels.catalog ?? [])
  }

  async function handleRefreshModelCatalog() {
    setModelCatalogRefreshing(true)
    setHermesModelError(null)
    setModelNotice(null)
    try {
      const response = await refreshModelCatalog()
      setModels(response.models)
      setSelectedModelId(response.selectedModelId)
      setHermesModel(response.hermes)
      setModelCatalog(response.catalog ?? [])
      const sourceSummary = response.catalogRefresh?.sources
        ?.map((source) => `${source.label}${source.ok ? `：${source.addedModels.length} 个模型` : '：刷新失败'}`)
        .join('；')
      setModelNotice(sourceSummary ? `模型目录已刷新。${sourceSummary}` : '模型目录已刷新')
    } catch (cause) {
      setHermesModelError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setModelCatalogRefreshing(false)
    }
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

  const {
    selectedWorkspace,
    selectedTask,
    runningTask,
    sidebarWorkspaceGroups,
    selectedTaskMessages,
    selectedTaskHiddenMessages,
    selectedHermesSession
  } = useTaskSelection({
    state,
    selectedWorkspaceId,
    selectedTaskId,
    taskSearch,
    taskScope,
    taskWorkspaceScope,
    selectedTaskTag,
    hermesSessions
  })
  const {
    selectedTaskContext,
    contextLoading,
    contextCompressing,
    contextError,
    refreshSelectedTaskContext,
    compressSelectedTaskContext
  } = useTaskContext({
    selectedTask,
    refreshAppState: refresh
  })
  const {
    workspaceFiles,
    workspaceTree,
    workspaceTreePath,
    setWorkspaceTreePath,
    workspaceFileQuery,
    setWorkspaceFileQuery,
    refreshWorkspaceFiles
  } = useWorkspaceFiles({
    selectedWorkspaceId,
    refreshKey: state.artifacts.length,
    onWorkspaceChange: () => setFilePreview(null)
  })
  const resolveModelSelectionKey = (model: ModelOption) => model.selectedModelKey || model.id

  const composerRunningTask = selectedTask?.status === 'running' ? selectedTask : runningTask
  const { taskStreamStatus, taskStreamUpdatedAt } = useTaskStream({
    selectedTaskId,
    selectedTaskStatus: selectedTask?.status,
    hasRunningTask: Boolean(runningTask),
    refresh,
    onTaskUpdate: (task) => setState((current) => mergeStreamedTask(current, task)),
    onRefreshError: (cause) => setError(cause instanceof Error ? cause.message : String(cause))
  })
  const composerModels = useMemo(() => configuredModelOptionsForComposer(models), [models])
  const selectedModel = composerModels.find((model) => resolveModelSelectionKey(model) === selectedModelId) ?? composerModels[0] ?? {
    id: 'auto',
    label: 'Hermes 默认模型',
    builtIn: true,
    source: 'auto'
  }
  const modelMenuGroups = useMemo(() => groupModelOptionsForMenu(composerModels), [composerModels])

  useEffect(() => {
    selectedTaskIdRef.current = selectedTaskId
  }, [selectedTaskId])

  useEffect(() => {
    selectedWorkspaceIdRef.current = selectedWorkspaceId
  }, [selectedWorkspaceId])

  useEffect(() => {
    conversationFollowRef.current = true
    scrollConversationToBottom()
  }, [selectedTaskId])

  useEffect(() => {
    if (!selectedTask || !conversationFollowRef.current) return
    scrollConversationToBottom()
  }, [
    selectedTask?.id,
    selectedTask?.status,
    selectedTask?.updatedAt,
    selectedTask?.liveResponse?.length,
    selectedTask?.events?.length,
    selectedTask?.messages.length,
    selectedTask?.artifacts.length
  ])

  useEffect(() => {
    void refreshRuntime()
    void refreshHermesUpdateStatus()
    void refreshHermesSessions()
    void refreshHermesMcp()
    void refreshMcpServeStatus()
    void refreshMcpRecommendationsState()
    void refreshBackgroundStatus()
    void refreshSkills().catch(() => undefined)
    void refreshModels().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!settingsOpen || settingsTab !== 'models') return
    void refreshModels().catch(() => undefined)
  }, [settingsOpen, settingsTab])

  useEffect(() => {
    if (!modelMenuOpen) return
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (!modelPickerRef.current?.contains(target)) {
        setModelMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [modelMenuOpen])

  function focusComposer() {
    window.requestAnimationFrame(() => {
      const input = promptInputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    })
  }

  function scrollConversationToBottom() {
    window.requestAnimationFrame(() => {
      conversationEndRef.current?.scrollIntoView({ block: 'end' })
    })
  }

  function handleConversationScroll() {
    const element = conversationRef.current
    if (!element) return
    conversationFollowRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 180
  }

  async function submitPrompt() {
    const nextPrompt = prompt.trim()
    if (!nextPrompt || !selectedWorkspace || isSubmitting || runningTask) return
    setIsSubmitting(true)
    setError(null)
    try {
      const activeTask = selectedTask?.status === 'running' ? null : selectedTask
      const taskSkillNames = activeTask?.skillNames?.length ? activeTask.skillNames : composerSkillNames
      const modelSelectionKey = resolveModelSelectionKey(selectedModel)
      const task = activeTask
        ? (await sendTaskMessage(activeTask.id, nextPrompt, modelSelectionKey, taskSkillNames)).task
        : await createTask(selectedWorkspace.id, nextPrompt, modelSelectionKey, taskSkillNames)
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
    const modelKey = resolveModelSelectionKey(model)
    await selectModel(modelKey)
    setSelectedModelId(modelKey)
    setModelMenuOpen(false)
    await refreshModels()
  }

  async function handleConfigureReasoning(request: HermesReasoningConfigureRequest, notice: string) {
    setHermesModelUpdating('reasoning')
    setHermesModelError(null)
    setModelNotice(null)
    try {
      const response = await configureHermesReasoning(request)
      setModels(response.models)
      setSelectedModelId(response.selectedModelId)
      setHermesModel(response.hermes)
      setModelCatalog(response.catalog ?? [])
      setModelNotice(notice)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setHermesModelError(message)
      setModelNotice(message)
    } finally {
      setHermesModelUpdating(null)
    }
  }

  async function handleSetHermesDefaultModel(modelId: string, provider?: string) {
    setHermesModelUpdating(`${provider ?? 'current'}:${modelId}`)
    setHermesModelError(null)
    try {
      const response = await setHermesDefaultModel(modelId, provider)
      setModels(response.models)
      setSelectedModelId(response.selectedModelId)
      setHermesModel(response.hermes)
      setModelCatalog(response.catalog ?? [])
      setModelNotice(`Hermes 默认模型已更新为 ${modelId}`)
    } catch (cause) {
      setHermesModelError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setHermesModelUpdating(null)
    }
  }

  async function handleDeleteModel(model: ModelOption) {
    if (model.builtIn) return
    const modelKey = resolveModelSelectionKey(model)
    setHermesModelUpdating(`delete-model:${modelKey}`)
    setHermesModelError(null)
    setModelNotice(null)
    try {
      const response = await deleteModel(resolveModelSelectionKey(model))
      setModels(response.models)
      setSelectedModelId(response.selectedModelId)
      setHermesModel(response.hermes)
      setModelCatalog(response.catalog ?? [])
      setModelMenuOpen(false)
      setModelNotice(`已从已配置模型中移除：${model.label}`)
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
      setModelCatalog(response.catalog ?? [])
      setModelNotice(providers.length ? '备用模型列表已更新' : '已关闭备用模型')
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error))
      setHermesModelError(cause.message)
    } finally {
      setHermesModelUpdating(null)
    }
  }

  async function handleDeleteHermesModelProvider(providerId: string, label: string) {
    const ok = window.confirm(`删除 Hermes 模型服务“${label}”的 Cowork 可管理配置？如果它是当前默认模型，请先切换默认模型。`)
    if (!ok) return
    setHermesModelUpdating(`delete-provider:${providerId}`)
    setHermesModelError(null)
    setModelNotice(null)
    try {
      const response = await deleteHermesModelProvider(providerId)
      setModels(response.models)
      setSelectedModelId(response.selectedModelId)
      setHermesModel(response.hermes)
      setModelCatalog(response.catalog ?? [])
      setModelNotice(`已移除模型服务配置：${label}`)
    } catch (cause) {
      setHermesModelError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setHermesModelUpdating(null)
    }
  }

  function selectNewModelProvider(providerId: string) {
    const savedConfig = providerSavedModelConfig(providerId, hermesModel)
    setNewModelProvider(providerId)
    setNewModelId('')
    setNewModelLabel('')
    setNewModelBaseUrl(savedConfig.baseUrl)
    setNewModelApiKey('')
    setNewModelApiMode(savedConfig.apiMode || defaultModelApiMode(providerId))
  }

  function openModelConfigPanel(providerId = hermesModel?.provider || '', modelId = '') {
    setModelNotice(null)
    const knownProviderId = modelCatalog.some((provider) => provider.id === providerId) ? providerId : ''
    selectNewModelProvider(knownProviderId)
    const providerModels = modelCatalog.find((provider) => provider.id === knownProviderId)?.models ?? []
    const defaultModel = modelId || (hermesProviderId(knownProviderId) === hermesProviderId(hermesModel?.provider ?? '') ? hermesModel?.defaultModel ?? '' : '')
    if (defaultModel) {
      setNewModelId(defaultModel)
      setNewModelLabel(providerModels.includes(defaultModel) ? defaultModel : 'custom')
    }
    setModelPanelOpen(true)
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

  function handleContinueTask(task: Task) {
    setViewMode('tasks')
    setSelectedTaskId(task.id)
    setSelectedWorkspaceId(task.workspaceId)
    focusComposer()
  }

  function handleRetryTask(task: Task) {
    setViewMode('tasks')
    setSelectedWorkspaceId(task.workspaceId)
    setSelectedTaskId(null)
    setPrompt(task.prompt)
    focusComposer()
  }

  async function handleAddModel(event: FormEvent) {
    event.preventDefault()
    const id = newModelId.trim() || newModelLabel.trim()
    const provider = hermesProviderId(newModelProvider)
    if (!id || !provider) return
    setModelNotice(null)
    setHermesModelError(null)
    setModelPanelSaving(true)
    try {
      const response = await configureHermesModel({
        provider,
        modelId: id,
        baseUrl: newModelBaseUrl.trim() || undefined,
        apiKey: newModelApiKey.trim() || undefined,
        apiMode: newModelApiMode
      })
      await selectModel('auto')
      setModels(response.models)
      setSelectedModelId('auto')
      setHermesModel(response.hermes)
      setModelCatalog(response.catalog ?? [])
      setNewModelId('')
      setNewModelLabel('')
      setNewModelProvider('')
      setNewModelBaseUrl('')
      setNewModelApiKey('')
      setNewModelApiMode('chat_completions')
      setModelPanelOpen(false)
      setModelMenuOpen(false)
      setModelNotice(`已配置 Hermes 默认模型：${id}`)
      await refreshModels()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setModelNotice(message)
      setHermesModelError(message)
    } finally {
      setModelPanelSaving(false)
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

  async function handleAuthorizeWorkspace() {
    if (workspacePicking) return
    setWorkspacePicking(true)
    setError(null)
    try {
      const picked = await pickWorkspaceDirectory()
      const workspace = await addWorkspace(picked.name, picked.path)
      setSelectedWorkspaceId(workspace.id)
      setSelectedTaskId(null)
      setViewMode('projects')
      await refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      if (!message.includes('取消')) setError(message)
    } finally {
      setWorkspacePicking(false)
    }
  }

  async function handleRenameWorkspace(workspace: Workspace) {
    const name = window.prompt('重命名工作区', workspace.name)?.trim()
    if (!name || name === workspace.name) return
    setWorkspaceUpdatingId(workspace.id)
    setError(null)
    try {
      await updateWorkspace(workspace.id, { name })
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setWorkspaceUpdatingId(null)
    }
  }

  async function handleReauthorizeWorkspace(workspace: Workspace) {
    if (workspacePicking) return
    setWorkspacePicking(true)
    setWorkspaceUpdatingId(workspace.id)
    setError(null)
    try {
	      const picked = await pickWorkspaceDirectory()
	      await updateWorkspace(workspace.id, { path: picked.path, name: picked.name })
      setSelectedWorkspaceId(workspace.id)
      setSelectedTaskId(null)
      setWorkspaceTreePath('')
      setViewMode('projects')
      await refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      if (!message.includes('取消')) setError(message)
    } finally {
      setWorkspacePicking(false)
      setWorkspaceUpdatingId(null)
    }
  }

	  async function handleRemoveWorkspace(workspace: Workspace) {
	    if (workspace.id === 'default') {
	      setError('Default Workspace 是 Cowork 的兜底工作区，不能移除。你可以点“重新授权文件夹”把它指向新的本机目录。')
	      return
	    }
    const workspaceTaskCount = state.tasks.filter((task) => task.workspaceId === workspace.id).length
    const confirmed = window.confirm(`移除工作区“${workspace.name}”？这只会移除 Cowork 中的工作区和 ${workspaceTaskCount} 个会话记录，不会删除真实文件。`)
    if (!confirmed) return
    setWorkspaceUpdatingId(workspace.id)
    setError(null)
    try {
      await deleteWorkspace(workspace.id)
      const fallbackWorkspaceId = state.workspaces.find((item) => item.id !== workspace.id)?.id ?? 'default'
      setSelectedWorkspaceId(fallbackWorkspaceId)
      setSelectedTaskId(null)
      setViewMode('projects')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setWorkspaceUpdatingId(null)
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
    const target = artifactPreviewTarget(artifact)
    const kind = previewKind(target.title)
    const rawUrl = previewRawUrl(target)
    setError(null)
    setRightSidebarCollapsed(false)
    setFilePreview({
      target,
      title: target.title,
      body: '',
      kind,
      rawUrl,
      status: 'loading'
    })
    if (isInlinePreviewKind(kind) && rawUrl) {
      setFilePreview({
        target,
        title: target.title,
        body: '',
        kind,
        rawUrl,
        status: 'ready'
      })
      return
    }
    try {
      const body = await previewArtifact(artifact.id)
      setFilePreview({
        target,
        title: target.title,
        body,
        kind,
        rawUrl,
        status: 'ready'
      })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setFilePreview({
        target,
        title: target.title,
        body: '',
        kind,
        rawUrl,
        status: message.includes('暂不支持') ? 'unsupported' : 'error',
        error: message
      })
    }
  }

  async function handlePreviewWorkspaceFile(file: WorkspaceFile) {
    if (!selectedWorkspace) return
    const target = workspacePreviewTarget(file, selectedWorkspace.id)
    const kind = previewKind(target.title)
    const rawUrl = previewRawUrl(target)
    setError(null)
    setRightSidebarCollapsed(false)
    setFilePreview({
      target,
      title: target.title,
      body: '',
      kind,
      rawUrl,
      status: 'loading'
    })
    if (isInlinePreviewKind(kind) && rawUrl) {
      setFilePreview({
        target,
        title: target.title,
        body: '',
        kind,
        rawUrl,
        status: 'ready'
      })
      return
    }
    try {
      const body = await previewWorkspaceFile(selectedWorkspace.id, file.relativePath)
      setFilePreview({
        target,
        title: target.title,
        body,
        kind,
        rawUrl,
        status: 'ready'
      })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setFilePreview({
        target,
        title: target.title,
        body: '',
        kind,
        rawUrl,
        status: message.includes('暂不支持') ? 'unsupported' : 'error',
        error: message
      })
    }
  }

  async function handleRevealPreviewTarget(target: FilePreviewTarget) {
    setError(null)
    try {
      if (target.source === 'artifact' && target.artifactId) {
        await revealArtifact(target.artifactId)
      } else if (target.workspaceId) {
        await revealWorkspaceFile(target.workspaceId, target.relativePath)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  function handleUsePreviewTarget(target: FilePreviewTarget) {
    const label = target.source === 'artifact' ? '任务产物' : '当前工作区文件'
    const ref = target.relativePath || target.name
    setPrompt((current) => {
      const prefix = current.trim() ? `${current.trim()}\n\n` : ''
      return `${prefix}请使用${label}「${ref}」作为上下文。`
    })
    setSelectedTaskId(null)
    setViewMode('tasks')
    window.setTimeout(() => focusComposer(), 0)
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

  async function refreshRuntime() {
    try {
      setRuntime(await getHermesRuntime())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function refreshHermesUpdateStatus() {
    setHermesUpdateLoading(true)
    setHermesUpdateError(null)
    try {
      setHermesUpdate(await getHermesUpdateStatus())
    } catch (cause) {
      setHermesUpdateError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setHermesUpdateLoading(false)
    }
  }

  async function handleRunHermesCompatibilityTest() {
    setHermesCompatibilityRunning(true)
    setHermesCompatibilityError(null)
    try {
      const result = await runHermesCompatibilityTest()
      setHermesCompatibilityResult(result)
      if (result.status === 'passed') {
        setHermesAutoUpdateResult(null)
      }
      await refreshHermesUpdateStatus()
    } catch (cause) {
      setHermesCompatibilityError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setHermesCompatibilityRunning(false)
    }
  }

  async function handleRunHermesAutoUpdate() {
    setHermesAutoUpdating(true)
    setHermesAutoUpdateError(null)
    try {
      const result = await runHermesAutoUpdate()
      setHermesAutoUpdateResult(result)
      setHermesCompatibilityResult(result.postTest ?? result.preTest)
      await refreshHermesUpdateStatus()
    } catch (cause) {
      setHermesAutoUpdateError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setHermesAutoUpdating(false)
    }
  }

  async function refreshHermesSessions() {
    try {
      const response = await getHermesSessions()
      setHermesSessions(response.sessions)
    } catch {
      setHermesSessions([])
    }
  }

  function insertFileContext(file: WorkspaceFile) {
    const snippet = `请读取这个文件并作为上下文：${file.path}`
    setPrompt((current) => (current.trim() ? `${current.trim()}\n\n${snippet}` : snippet))
  }

  const panelLayoutStyle = useMemo(
    () =>
      ({
        '--sidebar-width': `${panelLayout.left}px`,
        '--inspector-width': `${panelLayout.right}px`
      }) as CSSProperties,
    [panelLayout.left, panelLayout.right]
  )

  return (
    <div
      className={[
        'app-shell',
        isDraggingFiles ? 'dragging-files' : '',
        viewMode !== 'tasks' ? 'skills-mode' : '',
        viewMode === 'tasks' && filePreview ? 'file-preview-mode' : '',
        leftSidebarCollapsed ? 'left-sidebar-collapsed' : '',
        viewMode === 'tasks' && rightSidebarCollapsed ? 'right-sidebar-collapsed' : ''
      ].filter(Boolean).join(' ')}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={panelLayoutStyle}
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
      {!leftSidebarCollapsed && (
        <button
          type="button"
          className={`pane-resizer pane-resizer-left ${draggingPane === 'left' ? 'active' : ''}`}
          style={{ left: `${panelLayout.left - 7}px` }}
          title="拖动调整左侧导航宽度"
          aria-label="拖动调整左侧导航宽度"
          onPointerDown={(event) => startPaneResize('left', event)}
        />
      )}
      {viewMode === 'tasks' && !rightSidebarCollapsed && (
        <button
          type="button"
          className={`pane-resizer pane-resizer-right ${draggingPane === 'right' ? 'active' : ''}`}
          style={{ right: `${panelLayout.right - 7}px` }}
          title="拖动调整右侧工作区宽度"
          aria-label="拖动调整右侧工作区宽度"
          onPointerDown={(event) => startPaneResize('right', event)}
        />
      )}
      {leftSidebarCollapsed && (
        <button
          type="button"
          className="sidebar-restore-button"
          title="显示左侧导航"
          aria-label="显示左侧导航"
          onClick={() => setLeftSidebarCollapsed(false)}
        >
          <PanelLeftOpen size={17} />
        </button>
      )}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Bot size={19} />
          </div>
          <div className="brand-copy">
            <strong>Hermes Cowork</strong>
            <span>本机智能体工作台</span>
          </div>
          <button
            type="button"
            className="icon-button sidebar-collapse-button"
            title="隐藏左侧导航"
            aria-label="隐藏左侧导航"
            onClick={() => setLeftSidebarCollapsed(true)}
          >
            <PanelLeftClose size={15} />
          </button>
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

        <div className="sidebar-section workspace-tree-section">
          <div className="section-title">
            <span>工作区</span>
            <button
              className="icon-button"
              title="新增工作区：选择一个新的本机文件夹授权给 Hermes"
              aria-label="新增工作区"
              onClick={() => void handleAuthorizeWorkspace()}
	              disabled={workspacePicking}
	            >
              {workspacePicking ? <Loader2 size={15} className="spin" /> : <FolderPlus size={15} />}
            </button>
          </div>
          <div className="workspace-tree-list">
            {sidebarWorkspaceGroups.map((group) => (
              <SidebarWorkspaceNode
	                key={group.workspace.id}
	                workspace={group.workspace}
	                tasks={group.tasks}
	                archivedTasks={group.archivedTasks}
	                activeWorkspace={group.workspace.id === selectedWorkspaceId && viewMode === 'projects'}
                activeTaskId={selectedTaskId ?? null}
                onOpenWorkspace={() => {
                  setSelectedWorkspaceId(group.workspace.id)
                  setSelectedTaskId(null)
                  setViewMode('projects')
                }}
                onOpenTask={(task) => {
                  setSelectedWorkspaceId(task.workspaceId)
                  setSelectedTaskId(task.id)
                  setViewMode('tasks')
                }}
                onArchiveTask={(task) => void handleArchiveTask(task)}
                onDeleteTask={(task) => void handleDeleteTask(task)}
                onReveal={() => {
                  setSelectedWorkspaceId(group.workspace.id)
                  setError(null)
                  void revealWorkspace(group.workspace.id).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
                }}
                onRename={() => void handleRenameWorkspace(group.workspace)}
                onReauthorize={() => void handleReauthorizeWorkspace(group.workspace)}
                onRemove={() => void handleRemoveWorkspace(group.workspace)}
                updating={workspaceUpdatingId === group.workspace.id}
              />
            ))}
            {!sidebarWorkspaceGroups.length && (
              <p className="empty-copy">先选择一个文件夹授权给 Hermes。</p>
            )}
          </div>
        </div>

        <div className="sidebar-nav-group">
          <button
            className={viewMode === 'skills' ? 'secondary-nav active' : 'secondary-nav'}
            onClick={() => {
              setViewMode('skills')
              void refreshSkills().catch(() => undefined)
              void refreshHermesMcp()
            }}
          >
            <Hammer size={17} />
            技能
          </button>

          <button
            className={viewMode === 'scheduled' ? 'secondary-nav active' : 'secondary-nav'}
            onClick={() => setViewMode('scheduled')}
          >
            <Clock3 size={17} />
            定时任务
          </button>

          <button
            className={viewMode === 'dispatch' ? 'secondary-nav active' : 'secondary-nav'}
            onClick={() => setViewMode('dispatch')}
          >
            <Globe2 size={17} />
            调度
          </button>
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
          <button
            className="sidebar-user-button"
            title="账号与设置"
            aria-label="账号与设置"
            onClick={() => setAccountMenuOpen((open) => !open)}
          >
            <span className="account-avatar">
              <User size={15} />
            </span>
            <strong>Lucas</strong>
            <span className="local-badge">本机</span>
            <span className="sidebar-settings-cue">
              <Settings size={13} />
            </span>
          </button>
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
            artifacts={state.artifacts}
            workspaceFiles={workspaceFiles}
            workspaceTree={workspaceTree}
            workspacePath={workspaceTreePath}
            workspaceQuery={workspaceFileQuery}
            filePreview={filePreview}
            selectedWorkspaceId={selectedWorkspaceId}
            onSelect={(workspace) => {
              setSelectedWorkspaceId(workspace.id)
              setSelectedTaskId(null)
              setViewMode('projects')
            }}
            onOpenTask={(task) => {
              setSelectedWorkspaceId(task.workspaceId)
              setSelectedTaskId(task.id)
              setViewMode('tasks')
            }}
            onUsePrompt={(workspace, nextPrompt) => {
              setSelectedWorkspaceId(workspace.id)
              setSelectedTaskId(null)
              setPrompt(nextPrompt)
              setViewMode('tasks')
              window.setTimeout(() => focusComposer(), 0)
            }}
            onUseFile={(file) => {
              setPrompt((current) => {
                const prefix = current.trim() ? `${current.trim()}\n\n` : ''
                return `${prefix}请使用当前工作区文件「${file.relativePath}」作为上下文。`
              })
              setSelectedTaskId(null)
              setViewMode('tasks')
              window.setTimeout(() => focusComposer(), 0)
            }}
            onPreviewFile={(file) => void handlePreviewWorkspaceFile(file)}
            onRevealFile={(file) => void handleRevealWorkspaceFile(file)}
            onOpenFolder={(path) => {
              setWorkspaceTreePath(path)
              setFilePreview(null)
            }}
            onWorkspaceQueryChange={setWorkspaceFileQuery}
            onCloseFilePreview={() => setFilePreview(null)}
            onUsePreviewTarget={handleUsePreviewTarget}
            onRevealPreviewTarget={(target) => void handleRevealPreviewTarget(target)}
            onUploadClick={() => fileInputRef.current?.click()}
            onAdd={() => void handleAuthorizeWorkspace()}
            onReveal={(workspace) => {
              setError(null)
              void revealWorkspace(workspace.id).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
            }}
            onRename={(workspace) => void handleRenameWorkspace(workspace)}
            onReauthorize={(workspace) => void handleReauthorizeWorkspace(workspace)}
            onRemove={(workspace) => void handleRemoveWorkspace(workspace)}
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
            <button
              type="button"
              className="icon-button topbar-icon-button"
              title={rightSidebarCollapsed ? '显示右侧工作区' : '隐藏侧边栏'}
              aria-label={rightSidebarCollapsed ? '显示右侧工作区' : '隐藏侧边栏'}
              onClick={() => setRightSidebarCollapsed((collapsed) => !collapsed)}
            >
              {rightSidebarCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
            </button>
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}
        {uploadNotice && !error && <div className="upload-banner">{uploadNotice}</div>}

        {selectedTask && (selectedTask.status === 'failed' || selectedTask.status === 'stopped') && (
          <TaskFocusPanel
            task={selectedTask}
            onContinue={() => handleContinueTask(selectedTask)}
            onRetry={() => handleRetryTask(selectedTask)}
            onArchive={() => void handleArchiveTask(selectedTask)}
            onDelete={() => void handleDeleteTask(selectedTask)}
          />
        )}

        <section className="conversation" ref={conversationRef} onScroll={handleConversationScroll}>
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

          {selectedTaskHiddenMessages.length > 0 && (
            <details className="conversation-history">
              <summary>
                <span>较早对话</span>
                <em>{selectedTaskHiddenMessages.length} 条已收起</em>
                <ChevronDown size={14} />
              </summary>
              <div>
                {selectedTaskHiddenMessages.map((message) => (
                  <article className={`message ${message.role} compact`} key={message.id}>
                    <div className="message-meta">
                      {message.role === 'user' ? '你' : 'Hermes'}
                      <span>{formatTime(message.createdAt)}</span>
                    </div>
                    <MessageBody role={message.role} content={message.content} />
                  </article>
                ))}
              </div>
            </details>
          )}

          {selectedTaskMessages.map((message) => (
            <FragmentWithTrace
              key={message.id}
              message={message}
              task={selectedTask}
              traceAfterMessageId={latestUserMessageId(selectedTask)}
            />
          ))}

          {selectedTask?.status === 'running' && (
            <article className="message assistant pending streaming-message">
              <div className="message-meta">
                <div>
                  Hermes
                  <span>运行中</span>
                  <span className={`stream-pill ${taskStreamStatus}`}>{taskStreamLabel(taskStreamStatus)}</span>
                </div>
              </div>
              <LiveExecutionPanel task={selectedTask} streamStatus={taskStreamStatus} streamUpdatedAt={taskStreamUpdatedAt} />
              <div className="live-answer-block">
                <div className="live-answer-label">
                  <span>{selectedTask.liveResponse ? '正在生成回答' : '等待最终回答'}</span>
                  {!selectedTask.liveResponse && <em>过程会先在上方实时更新</em>}
                </div>
                {selectedTask.liveResponse ? (
                  <MessageBody role="assistant" content={selectedTask.liveResponse} live />
                ) : (
                  <div className="running-inline-status">
                    <Loader2 size={16} className="spin" />
                    Hermes 还在执行，答案开始生成后会显示在这里。
                  </div>
                )}
              </div>
            </article>
          )}
          <div className="conversation-bottom" ref={conversationEndRef} />
        </section>

        <ChatComposer
          prompt={prompt}
          promptInputRef={promptInputRef}
          composerSkillNames={composerSkillNames}
          selectedWorkspaceName={selectedWorkspace?.name}
          selectedModel={selectedModel}
          selectedModelId={selectedModelId}
          modelMenuOpen={modelMenuOpen}
          modelPickerRef={modelPickerRef}
          modelMenuGroups={modelMenuGroups}
          hermesModel={hermesModel}
          hermesModelUpdating={hermesModelUpdating}
          runningTask={composerRunningTask}
          stoppingTaskId={stoppingTaskId}
          isSubmitting={isSubmitting}
          modelNotice={modelNotice}
          onSubmit={handleSubmit}
          onPromptChange={setPrompt}
          onPromptKeyDown={handlePromptKeyDown}
          onRemoveSkill={(name) => setComposerSkillNames((current) => current.filter((item) => item !== name))}
          onOpenWorkspace={() => {
            if (selectedWorkspace) setViewMode('projects')
          }}
          onModelMenuOpenChange={setModelMenuOpen}
          onConfigureReasoning={(request, notice) => void handleConfigureReasoning(request, notice)}
          onSelectModel={(model) => void handleSelectModel(model)}
          onOpenModelConfig={openModelConfigPanel}
          onStopTask={(task) => void handleStop(task)}
          resolveModelSelectionKey={resolveModelSelectionKey}
        />
          </>
        )}
      </main>

      {viewMode === 'tasks' && !rightSidebarCollapsed && (
      <aside className={filePreview ? 'inspector file-preview-inspector' : 'inspector'}>
        {filePreview ? (
          <FilePreviewPanel
            preview={filePreview}
            onClose={() => setFilePreview(null)}
            onUseContext={handleUsePreviewTarget}
            onReveal={(target) => void handleRevealPreviewTarget(target)}
          />
        ) : (
          <>
            <div className="inspector-title-block">
              <button
                type="button"
                className="inspector-title inspector-title-button"
                title="隐藏右侧工作区"
                aria-label="隐藏右侧工作区"
                onClick={() => setRightSidebarCollapsed(true)}
              >
                <PanelRightClose size={17} />
                <span>工作区</span>
              </button>
              <p>{selectedWorkspace?.name ?? '未选择工作区'} · 当前任务的步骤、产出物和过程资源</p>
            </div>

            <TaskProgressCard
              task={selectedTask}
              streamStatus={taskStreamStatus}
              streamUpdatedAt={taskStreamUpdatedAt}
            />

            <TaskArtifactsCard
              task={selectedTask}
              onPreview={(artifact) => void handlePreview(artifact)}
              onReveal={(artifact) => void handleRevealArtifact(artifact)}
            />

            <ContextResourcesCard
              task={selectedTask}
              context={selectedTaskContext}
              loading={contextLoading}
              error={contextError}
              compressing={contextCompressing}
              workspaceFiles={workspaceFiles}
              onRefresh={() => void refreshSelectedTaskContext()}
              onCompress={() => void compressSelectedTaskContext()}
            />
          </>
        )}
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

      {modelPanelOpen && (
        <div className="modal-backdrop model-backdrop" onMouseDown={closeOnBackdropMouseDown(() => {
          if (!modelPanelSaving) setModelPanelOpen(false)
        })}>
          <ModelConfigModal
            modelCatalog={modelCatalog}
            hermesModel={hermesModel}
            providerId={newModelProvider}
            modelId={newModelId}
            modelLabel={newModelLabel}
            baseUrl={newModelBaseUrl}
            apiKey={newModelApiKey}
            apiMode={newModelApiMode}
            notice={modelNotice}
            saving={modelPanelSaving}
            catalogRefreshing={modelCatalogRefreshing}
            onClose={() => setModelPanelOpen(false)}
            onSubmit={handleAddModel}
            onProviderChange={selectNewModelProvider}
            onModelIdChange={setNewModelId}
            onModelLabelChange={setNewModelLabel}
            onBaseUrlChange={setNewModelBaseUrl}
            onApiKeyChange={setNewModelApiKey}
            onApiModeChange={setNewModelApiMode}
            onRefreshCatalog={() => void handleRefreshModelCatalog()}
          />
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop settings-backdrop" onMouseDown={closeOnBackdropMouseDown(() => setSettingsOpen(false))}>
          <SettingsModal
            tab={settingsTab}
            language={language}
            theme={theme}
            privacyMode={privacyMode}
            runtime={runtime}
            hermesUpdate={hermesUpdate}
            hermesUpdateLoading={hermesUpdateLoading}
            hermesUpdateError={hermesUpdateError}
            hermesCompatibilityResult={hermesCompatibilityResult}
            hermesCompatibilityRunning={hermesCompatibilityRunning}
            hermesCompatibilityError={hermesCompatibilityError}
            hermesAutoUpdateResult={hermesAutoUpdateResult}
            hermesAutoUpdating={hermesAutoUpdating}
            hermesAutoUpdateError={hermesAutoUpdateError}
            selectedModel={selectedModel}
            models={composerModels}
            modelCatalog={modelCatalog}
            selectedModelId={resolveModelSelectionKey(selectedModel)}
            hermesModel={hermesModel}
            hermesModelUpdating={hermesModelUpdating}
            hermesModelError={hermesModelError}
            modelCatalogRefreshing={modelCatalogRefreshing}
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
            onRefreshHermesUpdate={() => void refreshHermesUpdateStatus()}
            onRunHermesCompatibilityTest={() => void handleRunHermesCompatibilityTest()}
            onRunHermesAutoUpdate={() => void handleRunHermesAutoUpdate()}
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
            onDeleteModel={(model) => void handleDeleteModel(model)}
            onSetHermesDefaultModel={(modelId, provider) => void handleSetHermesDefaultModel(modelId, provider)}
            onSetHermesFallbackProviders={(providers) => void handleSetHermesFallbackProviders(providers)}
            onDeleteHermesModelProvider={(providerId, label) => void handleDeleteHermesModelProvider(providerId, label)}
            onRefreshModels={() => void refreshModels()}
            onRefreshModelCatalog={() => void handleRefreshModelCatalog()}
            onAddRule={handleAddSettingsRule}
            onOpenAddModel={(providerId, modelId) => openModelConfigPanel(providerId, modelId)}
          />
        </div>
      )}

      {mcpMarketplaceOpen && (
        <div className="modal-backdrop model-backdrop" onMouseDown={closeOnBackdropMouseDown(() => setMcpMarketplaceOpen(false))}>
          <SettingsMcpMarketplaceModal
            onClose={() => setMcpMarketplaceOpen(false)}
            onInstalled={handleMcpInstalled}
            recommendations={mcpRecommendations}
          />
        </div>
      )}

      {editingMcp && (
        <div className="modal-backdrop model-backdrop" onMouseDown={closeOnBackdropMouseDown(() => {
          if (mcpUpdatingId !== editingMcp.id) setEditingMcp(null)
        })}>
          <SettingsManualMcpModal
            mode="edit"
            initialServer={editingMcp}
            isSaving={mcpUpdatingId === editingMcp.id}
            onClose={() => setEditingMcp(null)}
            onSubmit={(config) => void handleEditMcpSubmit(config)}
          />
        </div>
      )}

      {manualMcpOpen && (
        <div className="modal-backdrop model-backdrop" onMouseDown={closeOnBackdropMouseDown(() => {
          if (!mcpUpdatingId) setManualMcpOpen(false)
        })}>
          <SettingsManualMcpModal
            mode="create"
            isSaving={Boolean(mcpUpdatingId)}
            onClose={() => setManualMcpOpen(false)}
            onSubmit={(config) => void handleManualMcpSubmit(config)}
          />
        </div>
      )}

      {selectedSkill && (
        <div className="modal-backdrop" onMouseDown={closeOnBackdropMouseDown(() => setSelectedSkill(null))}>
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
        <McpConnectorsView
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

function WorkspaceContextGroup({
  title,
  emptyText,
  items,
  icon
}: {
  title: string
  emptyText: string
  items: string[]
  icon: ReactNode
}) {
  return (
    <div className="workspace-context-group">
      <h3>{title}</h3>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>
              {icon}
              <span title={item}>{shortReference(item)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{emptyText}</p>
      )}
    </div>
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
  hermesUpdate,
  hermesUpdateLoading,
  hermesUpdateError,
  hermesCompatibilityResult,
  hermesCompatibilityRunning,
  hermesCompatibilityError,
  hermesAutoUpdateResult,
  hermesAutoUpdating,
  hermesAutoUpdateError,
  selectedModel,
  models,
  modelCatalog,
  selectedModelId,
  hermesModel,
  hermesModelUpdating,
  hermesModelError,
  modelCatalogRefreshing,
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
  onRefreshHermesUpdate,
  onRunHermesCompatibilityTest,
  onRunHermesAutoUpdate,
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
  onDeleteModel,
  onSetHermesDefaultModel,
  onSetHermesFallbackProviders,
  onDeleteHermesModelProvider,
  onRefreshModels,
  onRefreshModelCatalog,
  onAddRule,
  onOpenAddModel
}: {
  tab: SettingsTab
  language: string
  theme: string
  privacyMode: boolean
  runtime: HermesRuntime | null
  hermesUpdate: HermesUpdateStatus | null
  hermesUpdateLoading: boolean
  hermesUpdateError: string | null
  hermesCompatibilityResult: HermesCompatibilityTestResult | null
  hermesCompatibilityRunning: boolean
  hermesCompatibilityError: string | null
  hermesAutoUpdateResult: HermesAutoUpdateResult | null
  hermesAutoUpdating: boolean
  hermesAutoUpdateError: string | null
  selectedModel: ModelOption
  models: ModelOption[]
  modelCatalog: HermesModelCatalogProvider[]
  selectedModelId: string
  hermesModel: HermesModelOverview | null
  hermesModelUpdating: string | null
  hermesModelError: string | null
  modelCatalogRefreshing: boolean
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
  onRefreshHermesUpdate: () => void
  onRunHermesCompatibilityTest: () => void
  onRunHermesAutoUpdate: () => void
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
  onDeleteModel: (model: ModelOption) => void
  onSetHermesDefaultModel: (modelId: string, provider?: string) => void
  onSetHermesFallbackProviders: (providers: string[]) => void
  onDeleteHermesModelProvider: (providerId: string, label: string) => void
  onRefreshModels: () => void
  onRefreshModelCatalog: () => void
  onAddRule: (rule: string) => void
  onOpenAddModel: (providerId?: string, modelId?: string) => void
}) {
  const [commandDraft, setCommandDraft] = useState('')
  const [pathDraft, setPathDraft] = useState('')
  const [ruleDraft, setRuleDraft] = useState('')
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
          <McpSettingsSection
            mcpScope={prefs.mcpScope}
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
            onMcpScopeChange={(value) => onPrefChange('mcpScope', value)}
            onToggleMcpServer={onToggleMcpServer}
            onRefreshMcp={onRefreshMcp}
            onTestMcpServer={onTestMcpServer}
            onEditMcpServer={onEditMcpServer}
            onSetMcpToolSelection={onSetMcpToolSelection}
            onDeleteMcpServer={onDeleteMcpServer}
            onOpenMcpMarketplace={onOpenMcpMarketplace}
            onOpenManualMcp={onOpenManualMcp}
            onRefreshMcpRecommendationsWithAi={onRefreshMcpRecommendationsWithAi}
            onToggleBackgroundServices={onToggleBackgroundServices}
            onToggleMcpServe={onToggleMcpServe}
            onRefreshMcpServe={onRefreshMcpServe}
          />
        )}
        {tab === 'models' && (
          <ModelSettingsSection
            selectedModel={selectedModel}
            models={models}
            modelCatalog={modelCatalog}
            selectedModelId={selectedModelId}
            hermesModel={hermesModel}
            hermesModelUpdating={hermesModelUpdating}
            hermesModelError={hermesModelError}
            modelCatalogRefreshing={modelCatalogRefreshing}
            onSelectModel={onSelectModel}
            onDeleteModel={onDeleteModel}
            onSetHermesDefaultModel={onSetHermesDefaultModel}
            onSetHermesFallbackProviders={onSetHermesFallbackProviders}
            onDeleteHermesModelProvider={onDeleteHermesModelProvider}
            onRefreshModels={onRefreshModels}
            onRefreshModelCatalog={onRefreshModelCatalog}
            onOpenAddModel={onOpenAddModel}
          />
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
            <div className="about-summary-card">
              <div>
                <span>本机智能体工作台</span>
                <strong>Hermes Cowork</strong>
                <p>负责把 Hermes 的模型、MCP、任务流和升级状态整理成可操作的前端。</p>
              </div>
              <em>v0.1.0</em>
            </div>
            <SettingsBlock title="Hermes 后台更新">
              <HermesUpdatePanel
                status={hermesUpdate}
                loading={hermesUpdateLoading}
                error={hermesUpdateError}
                testResult={hermesCompatibilityResult}
                testRunning={hermesCompatibilityRunning}
                testError={hermesCompatibilityError}
                autoUpdateResult={hermesAutoUpdateResult}
                autoUpdating={hermesAutoUpdating}
                autoUpdateError={hermesAutoUpdateError}
                onRefresh={onRefreshHermesUpdate}
                onRunTest={onRunHermesCompatibilityTest}
                onRunAutoUpdate={onRunHermesAutoUpdate}
              />
            </SettingsBlock>
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
        <MessageBody role={message.role} content={message.content} />
      </article>
      {task && task.status !== 'running' && message.id === traceAfterMessageId && <InlineExecutionTrace task={task} />}
    </>
  )
}

function LiveExecutionPanel({
  task,
  streamStatus,
  streamUpdatedAt
}: {
  task: Task
  streamStatus: TaskStreamStatus
  streamUpdatedAt: string | null
}) {
  const rows = liveTraceRows(task)
  const currentRow = rows.at(-1) ?? fallbackLiveTraceRow(task)
  const previousRows = rows.slice(-5, -1)
  const steps = taskStepItems(task).slice(-4)

  return (
    <LiveExecutionPanelView
      currentRow={currentRow}
      previousRows={previousRows}
      steps={steps}
      streamStatus={streamStatus}
      streamLabel={taskStreamLabel(streamStatus)}
      streamDescription={taskStreamDescription(streamStatus, streamUpdatedAt)}
      formatTime={formatTime}
      workModeLabel={workModeLabel}
    />
  )
}

function InlineExecutionTrace({ task }: { task: Task }) {
  const rows = executionTraceRows(task)
  if (!rows.length) return null

  const visibleRows = compactTraceRows(task, rows)
  const groups = groupTraceRows(visibleRows)
  const lastRow = rows[rows.length - 1]
  const showCurrentRow = task.status === 'running' && lastRow
  const summaryParts = traceSummaryParts(task, rows)
  const summaryLabel = task.status === 'running' ? '处理中' : '已处理'

  return (
    <InlineExecutionTracePanel
      taskStatus={task.status}
      summaryLabel={summaryLabel}
      elapsedLabel={taskElapsedLabel(task)}
      summaryParts={summaryParts}
      currentRow={showCurrentRow ? lastRow : undefined}
      groups={groups}
      formatTime={formatTime}
    />
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

function StatusIcon({ status }: { status: Task['status'] }) {
  if (status === 'running') return <Loader2 size={15} className="spin" />
  if (status === 'completed') return <CheckCircle2 size={15} />
  if (status === 'failed') return <XCircle size={15} />
  if (status === 'stopped') return <Square size={15} />
  return <Circle size={15} />
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

function hasDraggedFiles(event: ReactDragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes('Files')
}

function shortSessionId(value: string) {
  return value.length > 18 ? `${value.slice(0, 13)}...${value.slice(-5)}` : value
}

function shortReference(value: string) {
  try {
    const url = new URL(value)
    return url.hostname.replace(/^www\./, '')
  } catch {
    const parts = value.split(/[\\/]/).filter(Boolean)
    return parts.slice(-2).join('/')
  }
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

function HermesUpdatePanel({
  status,
  loading,
  error,
  testResult,
  testRunning,
  testError,
  autoUpdateResult,
  autoUpdating,
  autoUpdateError,
  onRefresh,
  onRunTest,
  onRunAutoUpdate
}: {
  status: HermesUpdateStatus | null
  loading: boolean
  error: string | null
  testResult: HermesCompatibilityTestResult | null
  testRunning: boolean
  testError: string | null
  autoUpdateResult: HermesAutoUpdateResult | null
  autoUpdating: boolean
  autoUpdateError: string | null
  onRefresh: () => void
  onRunTest: () => void
  onRunAutoUpdate: () => void
}) {
  if (!status && loading) {
    return (
      <div className="hermes-update-empty">
        <Loader2 size={16} className="spin" />
        正在检查 Hermes 和 GitHub 版本...
      </div>
    )
  }

  if (!status) {
    return (
      <div className="hermes-update-empty">
        <span>{error || '还没有读取 Hermes 更新状态。'}</span>
        <button className="settings-add-button" onClick={onRefresh}>
          <RefreshCw size={14} />
          检查更新
        </button>
      </div>
    )
  }

  const manualTestSupersedesAutoUpdate = Boolean(
    autoUpdateResult &&
    testResult?.status === 'passed' &&
    Date.parse(testResult.completedAt) > Date.parse(autoUpdateResult.completedAt)
  )
  const visibleAutoUpdateResult = manualTestSupersedesAutoUpdate ? null : autoUpdateResult
  const displayStatus = testResult?.status === 'passed' && !status.updateAvailable ? 'verified' : status.compatibility.status
  const statusClass = `hermes-update-banner ${displayStatus}`
  const statusLabel = {
    verified: '可继续使用',
    'needs-review': '升级前需复测',
    blocked: '暂不建议升级',
    unknown: '需要检查'
  }[displayStatus]
  const statusIcon = displayStatus === 'blocked'
    ? <XCircle size={18} />
    : displayStatus === 'verified'
      ? <CheckCircle2 size={18} />
      : <RefreshCw size={18} />
  const headline = status.updateAvailable
    ? `发现 Hermes 新版本 ${status.latestTag || ''}`.trim()
    : displayStatus === 'verified'
      ? '当前很好，无需操作'
      : displayStatus === 'blocked'
        ? '暂不建议更新 Hermes'
        : status.compatibility.title
  const decisionDetail = displayStatus === 'verified' && !status.updateAvailable
    ? '当前 Hermes 后端可用，也没有需要升级的版本。技术诊断信息已收起，日常使用不用处理这里。'
    : status.compatibility.detail
  const versionText = status.latestTag && status.latestTag !== status.currentTag
    ? `${status.currentTag || '未知'} → ${status.latestTag}`
    : `${status.currentTag || status.currentVersion || '未知版本'}`
  const canAutoUpdate = Boolean(status.updateAvailable && testResult?.status === 'passed' && displayStatus !== 'blocked')
  const autoUpdateHint = canAutoUpdate
    ? '前测已通过，Cowork 会自动备份、更新并复测。'
    : status.updateAvailable
      ? '先运行复测，通过后才能自动更新。'
      : '当前没有检测到 Hermes 可用更新。'

  return (
    <div className="hermes-update-panel">
      <div className={statusClass}>
        <div className="hermes-update-status-icon">{statusIcon}</div>
        <div className="hermes-update-summary-copy">
          <span>Hermes 后台更新</span>
          <strong>{headline}</strong>
          <p>{decisionDetail}</p>
          <div className="hermes-update-version-strip">
            <span>当前 {versionText}</span>
            <span>{status.updateAvailable ? '有可用更新' : '无需更新'}</span>
            <span>{displayStatus === 'verified' ? '无需操作' : statusLabel}</span>
          </div>
        </div>
      </div>

      <div className="hermes-update-actions">
        <button className="settings-add-button" onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          检查更新
        </button>
        <button className="hermes-update-test-button" onClick={onRunTest} disabled={testRunning || autoUpdating}>
          {testRunning ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
          {testRunning ? '复测中' : '运行复测'}
        </button>
        {status.updateAvailable && (
          <button
            className="hermes-auto-update-button"
            onClick={onRunAutoUpdate}
            disabled={!canAutoUpdate || autoUpdating || testRunning}
            title={autoUpdateHint}
          >
            {autoUpdating ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            {autoUpdating ? '正在更新' : '自动更新'}
          </button>
        )}
        <a className="settings-link-button" href={status.repoUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={13} />
          GitHub
        </a>
      </div>

      {error && <div className="settings-error-line">{error}</div>}
      {testError && <div className="settings-error-line">{testError}</div>}
      {autoUpdateError && <div className="settings-error-line">{autoUpdateError}</div>}

      <div className="hermes-update-result-stack">
        <HermesCompatibilityResultCard result={testResult} running={testRunning} onRun={onRunTest} />
        <HermesAutoUpdateResultCard result={visibleAutoUpdateResult} running={autoUpdating} />
      </div>

      <details className="hermes-update-diagnostics">
        <summary>
          <span>诊断详情</span>
          <em>{statusLabel}</em>
        </summary>
        <div className="hermes-update-grid">
          <div>
            <span>本机 Hermes</span>
            <strong>{status.currentTag || '未知'}</strong>
            <small title={status.currentVersion}>{status.currentVersion}</small>
          </div>
          <div>
            <span>GitHub 最新</span>
            <strong>{status.latestTag || '未读取到'}</strong>
            <small>{status.updateAvailable ? '有可用更新' : '当前无需更新'}</small>
          </div>
          <div>
            <span>Cowork 验证基线</span>
            <strong>{status.verifiedCoworkTag}</strong>
            <small>超过该版本需要复测</small>
          </div>
          <div>
            <span>本机仓库</span>
            <strong>{status.branch || '未知分支'}</strong>
            <small>{status.workingTreeDirty ? '有未提交改动' : status.commitsBehind ? `落后 ${status.commitsBehind} 个提交` : '工作树干净'}</small>
          </div>
        </div>

        <div className="hermes-update-checks">
          {status.checks.map((check) => (
            <div className={check.ok ? 'ok' : 'failed'} key={check.id}>
              {check.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              <div>
                <strong>{check.label}</strong>
                <span title={check.detail}>{check.detail}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="hermes-update-notes">
          <strong>升级前建议</strong>
          <ul>
            {status.compatibility.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </div>
      </details>
    </div>
  )
}

function HermesCompatibilityResultCard({
  result,
  running,
  onRun
}: {
  result: HermesCompatibilityTestResult | null
  running: boolean
  onRun: () => void
}) {
  if (!result && !running) {
    return (
      <div className="hermes-smoke-card pending">
        <div>
          <strong>还没有本轮复测结果</strong>
          <span>复测会真实调用 Hermes，确认 Cowork 与当前后端仍能配合。</span>
        </div>
        <button className="settings-add-button" onClick={onRun}>
          <Play size={14} />
          复测
        </button>
      </div>
    )
  }

  if (running) {
    return (
      <div className="hermes-smoke-card running">
        <Loader2 size={18} className="spin" />
        <div>
          <strong>正在复测 Hermes</strong>
          <span>正在跑一个最小真实任务，完成后会给出是否可继续使用。</span>
        </div>
      </div>
    )
  }

  if (!result) return null
  const failedStep = result.steps.find((step) => step.status === 'failed')
  const summary = failedStep?.detail || result.smokeTask?.responsePreview || result.detail

  return (
    <div className={`hermes-smoke-card ${result.status}`}>
      <div className="hermes-smoke-head">
        <div>
          <strong>{result.title}</strong>
          <span>{summary}</span>
        </div>
        <em>{result.status === 'passed' ? '通过' : '失败'}</em>
      </div>
      <details className="hermes-compact-details">
        <summary>查看 {result.steps.length} 项复测明细</summary>
        <div className="hermes-smoke-steps">
          {result.steps.map((step) => (
            <div className={step.status} key={step.id}>
              {step.status === 'passed' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              <div>
                <strong>{step.label}</strong>
                <span>{step.detail}</span>
              </div>
              <time>{formatDuration(step.elapsedMs)}</time>
            </div>
          ))}
        </div>
        {result.smokeTask && (
          <div className="hermes-smoke-response">
            <span>小任务返回</span>
            <strong>{result.smokeTask.responsePreview || '无正文预览'}</strong>
            <small>{result.smokeTask.eventCount} 个事件{result.smokeTask.sessionId ? ` · ${shortSessionId(result.smokeTask.sessionId)}` : ''}</small>
          </div>
        )}
      </details>
    </div>
  )
}

function HermesAutoUpdateResultCard({
  result,
  running
}: {
  result: HermesAutoUpdateResult | null
  running: boolean
}) {
  if (!result && !running) return null

  if (running) {
    return (
      <div className="hermes-auto-update-card running">
        <Loader2 size={18} className="spin" />
        <div>
          <strong>正在执行自动更新</strong>
          <span>Cowork 正在备份配置、更新 Hermes，并在结束后自动复测。</span>
        </div>
      </div>
    )
  }

  if (!result) return null
  const afterLabel = result.after?.currentTag || result.after?.currentVersion || '未完成'
  const backupLabel = result.backupDir ? result.backupDir.replace(/^.*\/hermes-update-backups\//, 'data/hermes-update-backups/') : '未创建备份'

  return (
    <div className={`hermes-auto-update-card ${result.status}`}>
      <div className="hermes-auto-update-head">
        <div>
          <strong>{result.title}</strong>
          <span>{result.detail}</span>
        </div>
        <em>{result.status === 'passed' ? '已完成' : '需要处理'}</em>
      </div>
      <div className="hermes-auto-update-summary">
        <div>
          <span>更新前</span>
          <strong>{result.before.currentTag || result.before.currentVersion}</strong>
        </div>
        <div>
          <span>更新后</span>
          <strong>{afterLabel}</strong>
        </div>
        <div>
          <span>前置复测</span>
          <strong>{result.preTest.status === 'passed' ? '通过' : '失败'}</strong>
        </div>
        <div>
          <span>升级后复测</span>
          <strong>{result.postTest ? (result.postTest.status === 'passed' ? '通过' : '失败') : '未执行'}</strong>
        </div>
      </div>
      <details className="hermes-compact-details">
        <summary>备份与命令输出</summary>
        <div className="hermes-auto-update-backup">
          <Archive size={15} />
          <div>
            <strong>配置备份</strong>
            <span title={result.backupDir || ''}>{backupLabel}</span>
            <small>{result.backupFiles.length ? `${result.backupFiles.length} 个文件已备份` : '没有找到需要备份的配置文件'}</small>
          </div>
        </div>
        {(result.stdout || result.stderr) && (
          <div className="hermes-update-log">
            {result.stdout && <pre>{result.stdout}</pre>}
            {result.stderr && <pre>{result.stderr}</pre>}
          </div>
        )}
      </details>
      <small className="hermes-auto-update-time">完成于 {formatTime(result.completedAt)}</small>
    </div>
  )
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} 分 ${seconds % 60} 秒`
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

function taskStreamLabel(status: TaskStreamStatus) {
  return {
    idle: '未连接',
    connecting: '连接中',
    live: '实时同步',
    fallback: '轮询兜底'
  }[status]
}

function taskStreamDescription(status: TaskStreamStatus, updatedAt: string | null) {
  if (status === 'live') return updatedAt ? `最近同步 ${formatTime(updatedAt)}` : '事件流已连接'
  if (status === 'connecting') return '正在连接 Hermes 任务事件流'
  if (status === 'fallback') return '事件流暂不可用，正在用轮询刷新'
  return '任务运行时会自动连接事件流'
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

export default App
