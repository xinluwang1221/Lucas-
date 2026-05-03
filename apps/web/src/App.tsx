import {
  ChevronDown,
  FolderOpen,
  Loader2,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppBootstrap } from './features/app/useAppBootstrap'
import { useAppState } from './features/app/useAppState'
import { AppSidebar } from './features/layout/AppSidebar'
import {
  DispatchView,
  IdeasView,
  SearchTasksView,
  TemplateIcon
} from './features/layout/SecondaryViews'
import { ScheduledTasksView, useScheduledState } from './features/scheduled'
import { SessionsView } from './features/sessions'
import { usePanelLayout } from './features/layout/usePanelLayout'
import { useHermesToolsets } from './features/layout/useHermesToolsets'
import { FilePreviewPanel } from './features/file-preview/FilePreviewPanel'
import { useFilePreview } from './features/file-preview/useFilePreview'
import { ChatComposer } from './features/chat/ChatComposer'
import { FragmentWithTrace } from './features/chat/ChatExecutionViews'
import { MessageBody } from './features/chat/MessageBody'
import {
	  buildApprovalMessageParts,
	  buildClarifyMessageParts,
	  buildToolCardMessageParts,
  MessagePartList,
  taskStreamLabel
} from './features/chat/MessageParts'
import type { MarkdownFileReference } from './features/markdown/MarkdownContent'
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
import { useModelActions } from './features/settings/useModelActions'
import { useModelState } from './features/settings/useModelState'
import { useModelConfigForm } from './features/settings/useModelConfigForm'
import { useMcpState } from './features/settings/useMcpState'
import { useHermesRuntimeState } from './features/settings/useHermesRuntimeState'
import { SettingsModal } from './features/settings/SettingsModal'
import { useSettingsPreferences } from './features/settings/useSettingsPreferences'
import type { SettingsTab } from './features/settings/settingsTypes'
import { SkillDetailModal, SkillsView, useSkillsState } from './features/skills'
import {
  ManualMcpModal as SettingsManualMcpModal,
  McpMarketplaceModal as SettingsMcpMarketplaceModal
} from './features/settings/mcp'
import { TaskFocusPanel } from './features/chat/TaskFocusPanel'
import { latestAssistantMessageId, latestUserMessageId } from './features/chat/messageUtils'
import { mergeStreamedTask } from './features/chat/taskState'
import { taskExportUrl, tasksExportUrl } from './features/chat/chatApi'
import { useConversationBehavior } from './features/chat/useConversationBehavior'
import { useTaskContext } from './features/chat/useTaskContext'
import { useTaskStream } from './features/chat/useTaskStream'
import { useTaskSelection } from './features/chat/useTaskSelection'
import { ProjectsView } from './features/workspace/ProjectsView'
import { artifactPreviewTarget, workspacePreviewTarget } from './features/workspace/previewTargets'
import { useWorkspaceFiles } from './features/workspace/useWorkspaceFiles'
import { useWorkspaceActions } from './features/workspace/useWorkspaceActions'
import { useWorkspaceDropzone } from './features/workspace/useWorkspaceDropzone'
import { uploadFile, type WorkspaceFile } from './features/workspace/workspaceApi'
import {
  HermesMcpConfig,
  Artifact,
  MessageAnnotation,
  MessageAttachment,
  ModelOption,
  Task,
  Skill,
} from './lib/api'
import type {
  MouseEvent as ReactMouseEvent,
} from 'react'

type ViewMode = 'tasks' | 'search' | 'scheduled' | 'projects' | 'dispatch' | 'ideas' | 'skills' | 'sessions'

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

const taskTagOptions = ['文件整理', '文档生成', '飞书', '数据分析', '网页调研']

function closeOnBackdropMouseDown(onClose: () => void) {
  return (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }
}

function messageAttachmentFromWorkspaceFile(file: WorkspaceFile, workspaceId: string): MessageAttachment {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${workspaceId}:${file.relativePath}:${Date.now()}`,
    workspaceId,
    name: file.name,
    relativePath: file.relativePath,
    path: file.path,
    type: file.type,
    size: file.size,
    createdAt: new Date().toISOString()
  }
}

function normalizeUploadedWorkspaceFile(file: WorkspaceFile, source: File, workspacePath: string): WorkspaceFile {
  const uploadedPath = file.path || `${workspacePath.replace(/\/+$/, '')}/${source.name}`
  const relativePath = file.relativePath || relativePathFromWorkspacePath(uploadedPath, workspacePath) || source.name
  const sourceExtension = source.name.includes('.') ? source.name.split('.').pop() : ''
  return {
    name: file.name || source.name,
    relativePath,
    path: uploadedPath,
    type: file.type || sourceExtension || 'file',
    size: Number.isFinite(file.size) ? file.size : source.size,
    modifiedAt: file.modifiedAt || new Date().toISOString()
  }
}

function relativePathFromWorkspacePath(filePath: string, workspacePath: string) {
  const normalizedFile = filePath.replace(/\\/g, '/')
  const normalizedWorkspace = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '')
  return normalizedFile.startsWith(`${normalizedWorkspace}/`)
    ? normalizedFile.slice(normalizedWorkspace.length + 1)
    : ''
}

function workspaceFileFromMessageAttachment(attachment: MessageAttachment): WorkspaceFile {
  return {
    name: attachment.name,
    relativePath: attachment.relativePath,
    path: attachment.path,
    type: attachment.type,
    size: attachment.size,
    modifiedAt: attachment.createdAt
  }
}

function workspaceFileFromMessageAnnotation(annotation: MessageAnnotation): WorkspaceFile {
  return {
    name: annotation.fileName,
    relativePath: annotation.relativePath,
    path: annotation.path,
    type: annotation.type,
    size: 0,
    modifiedAt: annotation.createdAt
  }
}

function mergeComposerAttachments(current: MessageAttachment[], incoming: MessageAttachment[]) {
  const merged = new Map(current.map((attachment) => [`${attachment.workspaceId}:${attachment.relativePath}`, attachment]))
  for (const attachment of incoming) {
    merged.set(`${attachment.workspaceId}:${attachment.relativePath}`, attachment)
  }
  return Array.from(merged.values()).slice(0, 12)
}

function preferredPreviewPanelWidth() {
  if (typeof window === 'undefined') return 680
  return Math.min(820, Math.max(660, Math.round(window.innerWidth * 0.36)))
}

type ConversationFileReference = MarkdownFileReference & {
  source: 'artifact' | 'workspace'
  workspaceId?: string
  artifact?: Artifact
  workspaceFile?: WorkspaceFile
}

function buildConversationFileReferences(task: Task | null | undefined, workspaceFiles: WorkspaceFile[]): ConversationFileReference[] {
  const references = new Map<string, ConversationFileReference>()
  for (const artifact of task?.artifacts ?? []) {
    references.set(`artifact:${artifact.id}`, {
      id: `artifact:${artifact.id}`,
      source: 'artifact',
      name: artifact.name,
      relativePath: artifact.relativePath,
      type: artifact.type,
      workspaceId: artifact.workspaceId,
      artifact
    })
  }

  for (const message of task?.messages ?? []) {
    for (const attachment of message.attachments ?? []) {
      const workspaceFile = workspaceFileFromMessageAttachment(attachment)
      references.set(`attachment:${attachment.workspaceId}:${attachment.relativePath}`, {
        id: `attachment:${attachment.workspaceId}:${attachment.relativePath}`,
        source: 'workspace',
        name: attachment.name,
        relativePath: attachment.relativePath,
        type: attachment.type,
        workspaceId: attachment.workspaceId,
        workspaceFile
      })
    }
  }

  for (const file of workspaceFiles) {
    references.set(`workspace:${file.relativePath}`, {
      id: `workspace:${file.relativePath}`,
      source: 'workspace',
      name: file.name,
      relativePath: file.relativePath,
      type: file.type,
      workspaceFile: file
    })
  }
  return [...references.values()]
}

function App() {
  const {
    state,
    setState,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    selectedTaskId,
    setSelectedTaskId,
    refresh
  } = useAppState()
  const [viewMode, setViewMode] = useState<ViewMode>('tasks')
  const {
    leftSidebarCollapsed,
    setLeftSidebarCollapsed,
    rightSidebarCollapsed,
    setRightSidebarCollapsed,
    panelLayout,
    draggingPane,
    startPaneResize,
    ensureRightPanelWidth,
    panelLayoutStyle
  } = usePanelLayout()
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
    hermesDashboardStarting,
    hermesDashboardError,
    hermesDiagnostics,
    hermesDiagnosticsLoading,
    hermesDiagnosticsError,
    hermesSessions,
    refreshRuntime,
    refreshHermesUpdateStatus,
    handleRunHermesCompatibilityTest,
    handleRunHermesAutoUpdate,
    handleStartHermesDashboard,
    refreshHermesDiagnostics,
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
    cronState,
    cronLoading,
    cronError,
    cronSaving,
    cronMutatingId,
    cronNotice,
    refreshCronState,
    handleCreateCronJob,
    handleUpdateCronJob,
    runJobAction
  } = useScheduledState()
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
  const {
    toolsets,
    toolsetsError,
    toolsetUpdatingName,
    refreshToolsets,
    toggleToolset
  } = useHermesToolsets()
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
  const [composerAttachments, setComposerAttachments] = useState<MessageAttachment[]>([])
  const [composerAnnotations, setComposerAnnotations] = useState<MessageAnnotation[]>([])
  const [composerAttachmentUploading, setComposerAttachmentUploading] = useState(false)
  const [filePreviewPinned, setFilePreviewPinned] = useState(false)
  const [filePreviewFullscreen, setFilePreviewFullscreen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('account')
  const {
    language,
    setLanguage,
    theme,
    setTheme,
    privacyMode,
    setPrivacyMode,
    settingsPrefs,
    updateSettingsPref,
    handleAddSettingsRule
  } = useSettingsPreferences()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const skillFileInputRef = useRef<HTMLInputElement | null>(null)
  const modelPickerRef = useRef<HTMLDivElement | null>(null)
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
    promptInputRef,
    conversationRef,
    conversationEndRef,
    focusComposer,
    handleConversationScroll,
    createSubmitHandler,
    createPromptKeyDownHandler
  } = useConversationBehavior({ selectedTask, selectedTaskId })
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
    onOpen: () => {
      setRightSidebarCollapsed(false)
      ensureRightPanelWidth(preferredPreviewPanelWidth())
      setFilePreviewFullscreen(false)
    },
    onError: setError
  })
  function handleCloseFilePreview() {
    closeFilePreview()
    setFilePreviewPinned(false)
    setFilePreviewFullscreen(false)
  }

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
    onWorkspaceChange: () => {
      if (!filePreviewPinned) handleCloseFilePreview()
    }
  })
  const selectedTaskFileReferences = useMemo(
    () => buildConversationFileReferences(selectedTask, workspaceFiles),
    [selectedTask, workspaceFiles]
  )
  const selectedTaskLatestAssistantMessageId = latestAssistantMessageId(selectedTask)
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
    handleOpenPreviewTarget,
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
  const { isDraggingFiles, clearDropzone, dropzoneHandlers } = useWorkspaceDropzone({
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
    handleSelectModel,
    handleConfigureReasoning,
    handleSetHermesDefaultModel,
    handleDeleteModel,
    handleSetHermesFallbackProviders,
    handleDeleteHermesModelProvider
  } = useModelActions({
    resolveModelSelectionKey,
    applyModelResponse,
    refreshModels,
    setSelectedModelId,
    setModelMenuOpen,
    setHermesModelUpdating,
    setHermesModelError,
    setModelNotice
  })
  const {
    isSubmitting,
    stoppingTaskId,
    approvingTaskId,
    clarifyingTaskId,
    submitPrompt,
    handleStop,
    handleRespondApproval,
    handleRespondClarify,
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
    composerAttachments,
    composerAnnotations,
    attachmentUploading: composerAttachmentUploading,
    selectedTaskId,
    taskScope,
    refresh,
    resolveModelSelectionKey,
    setError,
    setPrompt,
    setComposerSkillNames,
    setComposerAttachments,
    setComposerAnnotations,
    setSelectedTaskId
  })
  const handleSubmit = useMemo(() => createSubmitHandler(submitPrompt), [createSubmitHandler, submitPrompt])
  const handlePromptKeyDown = useMemo(
    () => createPromptKeyDownHandler(submitPrompt),
    [createPromptKeyDownHandler, submitPrompt]
  )

  useAppBootstrap({
    refreshRuntime,
    refreshHermesUpdateStatus,
    refreshHermesSessions,
    refreshHermesMcp,
    refreshMcpServeStatus,
    refreshMcpRecommendationsState,
    refreshBackgroundStatus,
    refreshCronState,
    refreshSkills,
    refreshModels
  })

  useEffect(() => {
    if (!settingsOpen || settingsTab !== 'models') return
    void refreshModels().catch(() => undefined)
  }, [settingsOpen, settingsTab])

  useEffect(() => {
    if (!settingsOpen || settingsTab !== 'diagnostics') return
    void refreshHermesDiagnostics().catch(() => undefined)
  }, [settingsOpen, settingsTab, refreshHermesDiagnostics])

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

  useEffect(() => {
    setComposerAttachments((current) =>
      current.filter((attachment) => attachment.workspaceId === selectedWorkspaceId)
    )
    setComposerAnnotations((current) =>
      current.filter((annotation) => annotation.workspaceId === selectedWorkspaceId)
    )
  }, [selectedWorkspaceId])

  async function handleAttachComposerFiles(files: File[]) {
    if (!selectedWorkspace) {
      setError('请先选择一个授权工作区。')
      return
    }
    const uploadableFiles = files.filter((file) => file.size >= 0)
    if (!uploadableFiles.length) return
    setComposerAttachmentUploading(true)
    setError(null)
    try {
      const uploadedAttachments: MessageAttachment[] = []
      for (const file of uploadableFiles) {
        const uploaded = await uploadFile(selectedWorkspace.id, file)
        uploadedAttachments.push(messageAttachmentFromWorkspaceFile(
          normalizeUploadedWorkspaceFile(uploaded, file, selectedWorkspace.path),
          selectedWorkspace.id
        ))
      }
      setComposerAttachments((current) => mergeComposerAttachments(current, uploadedAttachments))
      await refresh()
      await refreshWorkspaceFiles()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setComposerAttachmentUploading(false)
    }
  }

  function handlePreviewMessageAttachment(attachment: MessageAttachment) {
    void openWorkspaceFilePreview(workspaceFileFromMessageAttachment(attachment), attachment.workspaceId)
  }

  function handlePreviewMessageAnnotation(annotation: MessageAnnotation) {
    void openWorkspaceFilePreview(workspaceFileFromMessageAnnotation(annotation), annotation.workspaceId)
  }

  function handleCreatePreviewAnnotation(annotation: MessageAnnotation) {
    if (!annotation.workspaceId) {
      setError('这个文件缺少工作区信息，暂时不能作为 Hermes 上下文发送。')
      return
    }
    setError(null)
    setComposerAnnotations((current) => [
      ...current.filter((item) => item.id !== annotation.id),
      annotation
    ].slice(-12))
    window.setTimeout(() => focusComposer(), 0)
  }

  function handleUpdatePreviewAnnotation(annotation: MessageAnnotation) {
    if (!annotation.workspaceId) return
    setComposerAnnotations((current) => current.map((item) => (
      item.id === annotation.id ? annotation : item
    )))
  }

  function previewTargetFromAttachment(attachment: MessageAttachment) {
    return workspacePreviewTarget(workspaceFileFromMessageAttachment(attachment), attachment.workspaceId)
  }

  function previewTargetFromFileReference(reference: MarkdownFileReference) {
    const matched = selectedTaskFileReferences.find((item) => item.id === reference.id)
    if (!matched) return null
    if (matched.source === 'artifact' && matched.artifact) {
      return artifactPreviewTarget(matched.artifact)
    }
    if (matched.source === 'workspace' && matched.workspaceFile) {
      return workspacePreviewTarget(matched.workspaceFile, matched.workspaceId ?? selectedWorkspaceId)
    }
    return null
  }

  function handleOpenMessageFileReference(reference: MarkdownFileReference) {
    const target = previewTargetFromFileReference(reference)
    if (!target) return
    if (target.source === 'artifact' && target.artifactId) {
      const matched = selectedTaskFileReferences.find((item) => item.id === reference.id)
      if (matched?.artifact) void openArtifactPreview(matched.artifact)
      return
    }
    if (target.source === 'workspace') {
      const matched = selectedTaskFileReferences.find((item) => item.id === reference.id)
      if (matched?.workspaceFile) void openWorkspaceFilePreview(matched.workspaceFile, target.workspaceId)
    }
  }

  function handleOpenMessageAttachmentNative(attachment: MessageAttachment) {
    void handleOpenPreviewTarget(previewTargetFromAttachment(attachment))
  }

  function handleRevealMessageAttachment(attachment: MessageAttachment) {
    void handleRevealPreviewTarget(previewTargetFromAttachment(attachment))
  }

  function handleUseMessageAttachment(attachment: MessageAttachment) {
    handleUsePreviewTarget(previewTargetFromAttachment(attachment))
  }

  function handleOpenMessageArtifactNative(artifact: Artifact) {
    void handleOpenPreviewTarget(artifactPreviewTarget(artifact))
  }

  function handleUseMessageArtifact(artifact: Artifact) {
    handleUsePreviewTarget(artifactPreviewTarget(artifact))
  }

  function handleOpenMessageFileReferenceNative(reference: MarkdownFileReference) {
    const target = previewTargetFromFileReference(reference)
    if (target) void handleOpenPreviewTarget(target)
  }

  function handleRevealMessageFileReference(reference: MarkdownFileReference) {
    const target = previewTargetFromFileReference(reference)
    if (target) void handleRevealPreviewTarget(target)
  }

  function handleUseMessageFileReference(reference: MarkdownFileReference) {
    const target = previewTargetFromFileReference(reference)
    if (target) handleUsePreviewTarget(target)
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
        viewMode === 'tasks' && filePreviewFullscreen ? 'file-preview-expanded' : '',
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

      <AppSidebar
        viewMode={viewMode}
        selectedWorkspaceId={selectedWorkspaceId}
        selectedTaskId={selectedTaskId}
        sidebarWorkspaceGroups={sidebarWorkspaceGroups}
        workspacePicking={workspacePicking}
        workspaceUpdatingId={workspaceUpdatingId}
        accountMenuOpen={accountMenuOpen}
        language={language}
        theme={theme}
        onCollapse={() => setLeftSidebarCollapsed(true)}
        onNewTask={() => {
          setViewMode('tasks')
          setSelectedTaskId(null)
          focusComposer()
        }}
        onAuthorizeWorkspace={() => void handleAuthorizeWorkspace()}
        onOpenWorkspace={(workspace) => {
          setSelectedWorkspaceId(workspace.id)
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
        onRevealWorkspace={(workspace) => {
          setSelectedWorkspaceId(workspace.id)
          void handleRevealWorkspace(workspace)
        }}
        onRenameWorkspace={(workspace) => void handleRenameWorkspace(workspace)}
        onReauthorizeWorkspace={(workspace) => void handleReauthorizeWorkspace(workspace)}
        onRemoveWorkspace={(workspace) => void handleRemoveWorkspace(workspace)}
        onOpenSkills={() => {
          setViewMode('skills')
          void refreshSkills().catch(() => undefined)
          void refreshHermesMcp()
          void refreshToolsets()
        }}
        onOpenSessions={() => {
          setViewMode('sessions')
          void refreshHermesSessions()
        }}
        onOpenScheduled={() => setViewMode('scheduled')}
        onOpenDispatch={() => {
          setViewMode('dispatch')
          void refreshToolsets()
        }}
        onThemeChange={setTheme}
        onOpenSettings={() => {
          setSettingsOpen(true)
          setAccountMenuOpen(false)
        }}
        onCloseAccountMenu={() => setAccountMenuOpen(false)}
        onToggleAccountMenu={() => setAccountMenuOpen((open) => !open)}
      />

      <main className={viewMode === 'tasks' ? 'workspace-main' : 'skills-main'}>
        {viewMode === 'skills' ? (
          <SkillsView
            skills={skills}
            customizeTab={customizeTab}
            tab={skillTab}
            query={skillQuery}
            notice={skillNotice}
            connectors={hermesMcp?.servers ?? []}
            toolsets={toolsets}
            toolsetsError={toolsetsError}
            toolsetUpdatingName={toolsetUpdatingName}
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
            onRefreshToolsets={() => void refreshToolsets()}
            onToggleToolset={(toolset) => void toggleToolset(toolset)}
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
        ) : viewMode === 'sessions' ? (
          <SessionsView
            sessions={hermesSessions}
            tasks={state.tasks}
            selectedWorkspaceId={selectedWorkspaceId}
            onRefresh={() => void refreshHermesSessions()}
            onOpenTask={(task) => {
              setSelectedWorkspaceId(task.workspaceId)
              setSelectedTaskId(task.id)
              if (task.hermesSessionResumeMode === 'explicit') setSelectedModelId('auto')
              setViewMode('tasks')
            }}
          />
        ) : viewMode === 'scheduled' ? (
          <ScheduledTasksView
            cronState={cronState}
            cronLoading={cronLoading}
            cronError={cronError}
            cronSaving={cronSaving}
            cronMutatingId={cronMutatingId}
            cronNotice={cronNotice}
            workspaces={state.workspaces}
            skills={skills}
            onRefreshCron={() => void refreshCronState()}
            onCreateCronJob={(input, onSuccess) => void handleCreateCronJob(input, onSuccess)}
            onUpdateCronJob={(jobId, input, onSuccess) => void handleUpdateCronJob(jobId, input, onSuccess)}
            onRunCronAction={(jobId, action) => void runJobAction(jobId, action)}
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
              if (!filePreviewPinned) handleCloseFilePreview()
            }}
            onWorkspaceQueryChange={setWorkspaceFileQuery}
            onCloseFilePreview={handleCloseFilePreview}
            onOpenPreviewTarget={(target) => void handleOpenPreviewTarget(target)}
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
            toolsets={toolsets}
            toolsetsError={toolsetsError}
            skills={skills}
            onOpenConnectors={() => {
              setCustomizeTab('connectors')
              setViewMode('skills')
              void refreshHermesMcp()
            }}
            onOpenToolsets={() => {
              setCustomizeTab('toolsets')
              setViewMode('skills')
              void refreshToolsets()
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
                    <MessageBody
                      role={message.role}
                      content={message.content}
                      attachments={message.attachments}
                      annotations={message.annotations}
                      fileReferences={selectedTaskFileReferences}
                      onOpenAttachment={handlePreviewMessageAttachment}
                      onOpenAttachmentNative={handleOpenMessageAttachmentNative}
                      onRevealAttachment={handleRevealMessageAttachment}
                      onUseAttachment={handleUseMessageAttachment}
                      onOpenAnnotation={handlePreviewMessageAnnotation}
                      onOpenFileReference={handleOpenMessageFileReference}
                      onOpenFileReferenceNative={handleOpenMessageFileReferenceNative}
                      onRevealFileReference={handleRevealMessageFileReference}
                      onUseFileReference={handleUseMessageFileReference}
                    />
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
              formatTime={formatTime}
              artifactCards={message.id === selectedTaskLatestAssistantMessageId ? selectedTask?.artifacts ?? [] : []}
              fileReferences={selectedTaskFileReferences}
              onOpenAttachment={handlePreviewMessageAttachment}
              onOpenAttachmentNative={handleOpenMessageAttachmentNative}
              onRevealAttachment={handleRevealMessageAttachment}
              onUseAttachment={handleUseMessageAttachment}
              onOpenAnnotation={handlePreviewMessageAnnotation}
              onOpenArtifact={(artifact) => void openArtifactPreview(artifact)}
              onOpenArtifactNative={handleOpenMessageArtifactNative}
              onRevealArtifact={(artifact) => void handleRevealArtifact(artifact)}
              onUseArtifact={handleUseMessageArtifact}
              onOpenFileReference={handleOpenMessageFileReference}
              onOpenFileReferenceNative={handleOpenMessageFileReferenceNative}
              onRevealFileReference={handleRevealMessageFileReference}
              onUseFileReference={handleUseMessageFileReference}
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
              <MessagePartList
                parts={buildClarifyMessageParts(selectedTask, clarifyingTaskId === selectedTask.id)}
                formatTime={formatTime}
                onRespondClarify={(task, answer) => void handleRespondClarify(task, answer)}
              />
              <MessagePartList
                parts={buildApprovalMessageParts(selectedTask, approvingTaskId === selectedTask.id)}
                formatTime={formatTime}
                onRespondApproval={(task, choice) => void handleRespondApproval(task, choice)}
              />
              <MessagePartList
                parts={buildToolCardMessageParts(selectedTask, taskStreamStatus, taskStreamUpdatedAt)}
                formatTime={formatTime}
              />
              <div className="live-answer-block">
                <div className="live-answer-label">
                  <span>{selectedTask.liveResponse ? '正在生成回答' : '等待最终回答'}</span>
                  {!selectedTask.liveResponse && <em>过程会先在上方实时更新</em>}
                </div>
                {selectedTask.liveResponse ? (
                  <MessageBody
                    role="assistant"
                    content={selectedTask.liveResponse}
                    live
                    fileReferences={selectedTaskFileReferences}
                    onOpenFileReference={handleOpenMessageFileReference}
                    onOpenFileReferenceNative={handleOpenMessageFileReferenceNative}
                    onRevealFileReference={handleRevealMessageFileReference}
                    onUseFileReference={handleUseMessageFileReference}
                  />
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
          composerAttachments={composerAttachments}
          composerAnnotations={composerAnnotations}
          attachmentUploading={composerAttachmentUploading}
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
          onAttachFiles={(files) => void handleAttachComposerFiles(files)}
          onAttachmentDrag={clearDropzone}
          onRemoveAttachment={(attachmentId) => setComposerAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId))}
          onPreviewAttachment={handlePreviewMessageAttachment}
          onRemoveAnnotation={(annotationId) => setComposerAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId))}
          onPreviewAnnotation={handlePreviewMessageAnnotation}
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
            pinned={filePreviewPinned}
            fullscreen={filePreviewFullscreen}
            onClose={handleCloseFilePreview}
            onOpenNative={(target) => void handleOpenPreviewTarget(target)}
            onReveal={(target) => void handleRevealPreviewTarget(target)}
            onTogglePin={() => setFilePreviewPinned((current) => !current)}
            onToggleFullscreen={() => setFilePreviewFullscreen((current) => !current)}
            onCreateAnnotation={handleCreatePreviewAnnotation}
            onUpdateAnnotation={handleUpdatePreviewAnnotation}
            onRemoveAnnotation={(annotationId) => setComposerAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId))}
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
            hermesDashboardStarting={hermesDashboardStarting}
            hermesDashboardError={hermesDashboardError}
            hermesDiagnostics={hermesDiagnostics}
            hermesDiagnosticsLoading={hermesDiagnosticsLoading}
            hermesDiagnosticsError={hermesDiagnosticsError}
            onTabChange={setSettingsTab}
            onClose={() => setSettingsOpen(false)}
            onRefreshRuntime={() => void refreshRuntime()}
            onStartHermesDashboard={() => void handleStartHermesDashboard()}
            onRefreshHermesDiagnostics={() => void refreshHermesDiagnostics()}
            onStartHermesDashboardForDiagnostics={() => {
              void refreshHermesDiagnostics({ start: true }).then(() => refreshRuntime())
            }}
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

export default App
