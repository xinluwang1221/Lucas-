import {
  Archive,
  ArchiveRestore,
  BarChart3,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Database,
  ExternalLink,
  FileArchive,
  FileText,
  Folder,
  FolderSync,
  FolderOpen,
  FolderPlus,
  Globe2,
  Hammer,
  Languages,
  Loader2,
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
  Square,
  Star,
  Tags,
  Trash2,
  Upload,
  User,
  Wrench,
  XCircle
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { usePanelLayout } from './features/layout/usePanelLayout'
import { FilePreviewPanel } from './features/file-preview/FilePreviewPanel'
import { useFilePreview } from './features/file-preview/useFilePreview'
import { ChatComposer } from './features/chat/ChatComposer'
import { MessageBody } from './features/chat/MessageBody'
import {
  ContextResourcesCard,
  TaskArtifactsCard,
  TaskProgressCard
} from './features/chat/TaskInspectorCards'
import { useTaskActions } from './features/chat/useTaskActions'
import {
  ModelConfigModal,
  configuredModelOptionsForComposer,
  groupModelOptionsForMenu,
} from './features/settings/models'
import { useModelState } from './features/settings/useModelState'
import { useModelConfigForm } from './features/settings/useModelConfigForm'
import { useMcpState } from './features/settings/useMcpState'
import { useHermesRuntimeState } from './features/settings/useHermesRuntimeState'
import { SettingsModal } from './features/settings/SettingsModal'
import {
  defaultSettingsPrefs,
  type SettingsPrefs,
  type SettingsTab
} from './features/settings/settingsTypes'
import { SkillDetailModal, SkillsView, useSkillsState } from './features/skills'
import {
  ManualMcpModal as SettingsManualMcpModal,
  McpMarketplaceModal as SettingsMcpMarketplaceModal
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
import { useWorkspaceFiles } from './features/workspace/useWorkspaceFiles'
import { useWorkspaceActions } from './features/workspace/useWorkspaceActions'
import { useWorkspaceDropzone } from './features/workspace/useWorkspaceDropzone'
import type { WorkspaceFile } from './features/workspace/workspaceApi'
import {
  AppState,
  BackgroundServiceStatus,
  configureHermesReasoning,
  deleteHermesModelProvider,
  deleteModel,
  HermesMcpConfig,
  HermesMcpRecommendations,
  HermesReasoningConfigureRequest,
  getState,
  HermesRuntime,
  Message,
  ModelOption,
  setHermesDefaultModel,
  setHermesFallbackProviders,
  selectModel,
  Task,
  taskExportUrl,
  tasksExportUrl,
  Skill,
} from './lib/api'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
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

function closeOnBackdropMouseDown(onClose: () => void) {
  return (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }
}

function App() {
  const [state, setState] = useState<AppState>(emptyState)
  const [viewMode, setViewMode] = useState<ViewMode>('tasks')
  const {
    leftSidebarCollapsed,
    setLeftSidebarCollapsed,
    rightSidebarCollapsed,
    setRightSidebarCollapsed,
    panelLayout,
    draggingPane,
    startPaneResize,
    panelLayoutStyle
  } = usePanelLayout()
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('default')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null | undefined>(undefined)
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'response' | 'tools' | 'logs' | 'errors'>('response')
  const [taskSearch, setTaskSearch] = useState('')
  const [taskScope, setTaskScope] = useState<'active' | 'archived' | 'all'>('active')
  const [taskWorkspaceScope, setTaskWorkspaceScope] = useState<'current' | 'all'>('current')
  const [selectedTaskTag, setSelectedTaskTag] = useState('all')
  const {
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
    hermesSessions,
    refreshRuntime,
    refreshHermesUpdateStatus,
    handleRunHermesCompatibilityTest,
    handleRunHermesAutoUpdate,
    refreshHermesSessions
  } = useHermesRuntimeState({ onRuntimeError: setError })
  const [mcpMarketplaceOpen, setMcpMarketplaceOpen] = useState(false)
  const [manualMcpOpen, setManualMcpOpen] = useState(false)
  const [editingMcp, setEditingMcp] = useState<HermesMcpConfig['servers'][number] | null>(null)
  const {
    hermesMcp,
    mcpError,
    mcpTestResults,
    mcpTestingId,
    mcpUpdatingId,
    mcpDeletingId,
    mcpToolUpdatingId,
    mcpServeStatus,
    mcpServeUpdating,
    mcpServeError,
    mcpRecommendations,
    mcpRecommendationsLoading,
    mcpRecommendationsError,
    backgroundStatus,
    backgroundUpdating,
    backgroundError,
    refreshHermesMcp,
    refreshMcpRecommendationsState,
    handleRefreshMcpRecommendationsWithAi,
    refreshBackgroundStatus,
    refreshMcpServeStatus,
    handleToggleMcpServe,
    handleToggleBackgroundServices,
    handleTestMcpServer,
    handleMcpInstalled,
    handleToggleMcpServer,
    handleDeleteMcpServer,
    handleManualMcpSubmit,
    handleEditMcpSubmit,
    handleSetMcpToolSelection
  } = useMcpState()
  const {
    skills,
    customizeTab,
    setCustomizeTab,
    skillTab,
    setSkillTab,
    skillQuery,
    setSkillQuery,
    skillNotice,
    setSkillNotice,
    selectedSkill,
    setSelectedSkill,
    skillFiles,
    selectedSkillFile,
    skillFileContent,
    skillFileError,
    refreshSkills,
    handleToggleSkill,
    handleSkillUpload,
    handleOpenSkill,
    handleSelectSkillFile
  } = useSkillsState()
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const {
    models,
    modelCatalog,
    selectedModelId,
    setSelectedModelId,
    hermesModel,
    hermesModelUpdating,
    setHermesModelUpdating,
    hermesModelError,
    setHermesModelError,
    modelCatalogRefreshing,
    modelNotice,
    setModelNotice,
    applyModelResponse,
    refreshModels,
    refreshModelCatalogState
  } = useModelState()
  const {
    modelPanelOpen,
    modelPanelSaving,
    newModelId,
    newModelLabel,
    newModelProvider,
    newModelBaseUrl,
    newModelApiKey,
    newModelApiMode,
    setNewModelId,
    setNewModelLabel,
    setNewModelBaseUrl,
    setNewModelApiKey,
    setNewModelApiMode,
    selectNewModelProvider,
    openModelConfigPanel,
    closeModelConfigPanel,
    handleAddModel
  } = useModelConfigForm({
    hermesModel,
    modelCatalog,
    applyModelResponse,
    refreshModels,
    setModelNotice,
    setHermesModelError,
    onModelMenuClose: () => setModelMenuOpen(false)
  })
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
  const selectedTaskIdRef = useRef<string | null | undefined>(selectedTaskId)
  const selectedWorkspaceIdRef = useRef(selectedWorkspaceId)

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
    filePreview,
    closeFilePreview,
    openArtifactPreview,
    openWorkspaceFilePreview
  } = useFilePreview({
    selectedWorkspaceId,
    onOpen: () => setRightSidebarCollapsed(false),
    onError: setError
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
    onWorkspaceChange: closeFilePreview
  })
  const {
    workspacePicking,
    workspaceUpdatingId,
    uploadNotice,
    handleAuthorizeWorkspace,
    handleRenameWorkspace,
    handleReauthorizeWorkspace,
    handleRemoveWorkspace,
    handleUploadFiles,
    handleRevealWorkspace,
    handleRevealWorkspaceFile,
    handleRevealPreviewTarget,
    handleRevealArtifact,
    handleUsePreviewTarget
  } = useWorkspaceActions({
    workspaces: state.workspaces,
    tasks: state.tasks,
    selectedWorkspace: selectedWorkspace ?? undefined,
    refreshAppState: refresh,
    refreshWorkspaceFiles,
    resetWorkspaceTree: () => setWorkspaceTreePath(''),
    openWorkspace: (workspaceId) => {
      setSelectedWorkspaceId(workspaceId)
      setSelectedTaskId(null)
      setViewMode('projects')
    },
    openTaskComposer: () => {
      setSelectedTaskId(null)
      setViewMode('tasks')
      window.setTimeout(() => focusComposer(), 0)
    },
    appendPrompt: appendPromptSnippet,
    onError: setError
  })
  const { isDraggingFiles, dropzoneHandlers } = useWorkspaceDropzone({
    canDropFiles: Boolean(selectedWorkspace),
    onUploadFiles: (files) => void handleUploadFiles(files)
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
  const {
    isSubmitting,
    stoppingTaskId,
    submitPrompt,
    handleStop,
    handleDeleteTask,
    handlePinTask,
    handleArchiveTask,
    handleToggleTag
  } = useTaskActions({
    prompt,
    selectedWorkspace,
    selectedTask,
    runningTask,
    selectedModel,
    composerSkillNames,
    selectedTaskId,
    taskScope,
    refresh,
    resolveModelSelectionKey,
    setError,
    setPrompt,
    setComposerSkillNames,
    setSelectedTaskId
  })

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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    await submitPrompt()
  }

  function handlePromptKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void submitPrompt()
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
      applyModelResponse(response)
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
      applyModelResponse(response)
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
      applyModelResponse(response)
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
      applyModelResponse(response)
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
      applyModelResponse(response)
      setModelNotice(`已移除模型服务配置：${label}`)
    } catch (cause) {
      setHermesModelError(cause instanceof Error ? cause.message : String(cause))
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

  function updateSettingsPref<K extends keyof SettingsPrefs>(key: K, value: SettingsPrefs[K]) {
    setSettingsPrefs((current) => ({ ...current, [key]: value }))
  }

  function handleAddSettingsRule(rule: string) {
    const nextRule = rule.trim()
    if (!nextRule) return
    setSettingsPrefs((current) => ({
      ...current,
      rules: current.rules.includes(nextRule) ? current.rules : [...current.rules, nextRule]
    }))
  }

  function insertFileContext(file: WorkspaceFile) {
    appendPromptSnippet(`请读取这个文件并作为上下文：${file.path}`)
  }

  function appendPromptSnippet(snippet: string) {
    setPrompt((current) => (current.trim() ? `${current.trim()}\n\n${snippet}` : snippet))
  }

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
      {...dropzoneHandlers}
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
                  void handleRevealWorkspace(group.workspace)
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
            onPreviewFile={(file) => void openWorkspaceFilePreview(file)}
            onRevealFile={(file) => void handleRevealWorkspaceFile(file)}
            onOpenFolder={(path) => {
              setWorkspaceTreePath(path)
              closeFilePreview()
            }}
            onWorkspaceQueryChange={setWorkspaceFileQuery}
            onCloseFilePreview={closeFilePreview}
            onUsePreviewTarget={handleUsePreviewTarget}
            onRevealPreviewTarget={(target) => void handleRevealPreviewTarget(target)}
            onUploadClick={() => fileInputRef.current?.click()}
            onAdd={() => void handleAuthorizeWorkspace()}
            onReveal={(workspace) => {
              void handleRevealWorkspace(workspace)
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
            onClose={closeFilePreview}
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
              onPreview={(artifact) => void openArtifactPreview(artifact)}
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
        <div className="modal-backdrop model-backdrop" onMouseDown={closeOnBackdropMouseDown(closeModelConfigPanel)}>
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
            onClose={closeModelConfigPanel}
            onSubmit={handleAddModel}
            onProviderChange={selectNewModelProvider}
            onModelIdChange={setNewModelId}
            onModelLabelChange={setNewModelLabel}
            onBaseUrlChange={setNewModelBaseUrl}
            onApiKeyChange={setNewModelApiKey}
            onApiModeChange={setNewModelApiMode}
            onRefreshCatalog={() => void refreshModelCatalogState()}
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
            onRefreshModelCatalog={() => void refreshModelCatalogState()}
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
            onSubmit={(config) => void handleEditMcpSubmit(editingMcp.id, config, () => setEditingMcp(null))}
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
            onSubmit={(config) => void handleManualMcpSubmit(config, () => setManualMcpOpen(false))}
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
