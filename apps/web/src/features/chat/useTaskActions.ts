import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import {
  archiveTask,
  createTask,
  deleteTask,
  pinTask,
  respondTaskApproval,
  respondTaskClarify,
  sendTaskMessage,
  setTaskTags,
  stopTask
} from './chatApi'
import type { ApprovalChoice, MessageAnnotation, MessageAttachment, ModelOption, Task, Workspace } from '../../lib/api'
import type { TaskScope } from './useTaskSelection'

type UseTaskActionsParams = {
  prompt: string
  selectedWorkspace?: Workspace
  selectedTask?: Task
  runningTask?: Task
  selectedModel: ModelOption
  composerSkillNames: string[]
  composerAttachments: MessageAttachment[]
  composerAnnotations: MessageAnnotation[]
  attachmentUploading: boolean
  selectedTaskId: string | null | undefined
  taskScope: TaskScope
  refresh: () => Promise<void>
  resolveModelSelectionKey: (model: ModelOption) => string
  setError: (message: string | null) => void
  setPrompt: Dispatch<SetStateAction<string>>
  setComposerSkillNames: Dispatch<SetStateAction<string[]>>
  setComposerAttachments: Dispatch<SetStateAction<MessageAttachment[]>>
  setComposerAnnotations: Dispatch<SetStateAction<MessageAnnotation[]>>
  setSelectedTaskId: Dispatch<SetStateAction<string | null | undefined>>
}

export function useTaskActions({
  prompt,
  selectedWorkspace,
  selectedTask,
  runningTask,
  selectedModel,
  composerSkillNames,
  composerAttachments,
  composerAnnotations,
  attachmentUploading,
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
}: UseTaskActionsParams) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [stoppingTaskId, setStoppingTaskId] = useState<string | null>(null)
  const [approvingTaskId, setApprovingTaskId] = useState<string | null>(null)
  const [clarifyingTaskId, setClarifyingTaskId] = useState<string | null>(null)

  const submitPrompt = useCallback(async () => {
    const hasContext = Boolean(composerAttachments.length || composerAnnotations.length)
    const nextPrompt = prompt.trim() || (hasContext ? '请查看这些附件和批注。' : '')
    if ((!nextPrompt && !hasContext) || !selectedWorkspace || isSubmitting || runningTask || attachmentUploading) return
    setIsSubmitting(true)
    setError(null)
    try {
      const activeTask = selectedTask?.status === 'running' ? null : selectedTask
      const taskSkillNames = activeTask?.skillNames?.length ? activeTask.skillNames : composerSkillNames
      const modelSelectionKey = resolveModelSelectionKey(selectedModel)
      const taskAttachments = composerAttachments.filter((attachment) => attachment.workspaceId === selectedWorkspace.id)
      const taskAnnotations = composerAnnotations.filter((annotation) => annotation.workspaceId === selectedWorkspace.id)
      const task = activeTask
        ? (await sendTaskMessage(activeTask.id, nextPrompt, modelSelectionKey, taskSkillNames, taskAttachments, taskAnnotations)).task
        : await createTask(selectedWorkspace.id, nextPrompt, modelSelectionKey, taskSkillNames, taskAttachments, taskAnnotations)
      setPrompt('')
      setComposerSkillNames([])
      setComposerAttachments([])
      setComposerAnnotations([])
      setSelectedTaskId(task.id)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setIsSubmitting(false)
    }
  }, [
    attachmentUploading,
    composerAnnotations,
    composerAttachments,
    composerSkillNames,
    isSubmitting,
    prompt,
    refresh,
    resolveModelSelectionKey,
    runningTask,
    selectedModel,
    selectedTask,
    selectedWorkspace,
    setComposerSkillNames,
    setComposerAttachments,
    setComposerAnnotations,
    setError,
    setPrompt,
    setSelectedTaskId
  ])

  const handleStop = useCallback(
    async (task: Task) => {
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
    },
    [refresh, setError, stoppingTaskId]
  )

  const handleRespondApproval = useCallback(
    async (task: Task, choice: ApprovalChoice) => {
      if (approvingTaskId) return
      try {
        setApprovingTaskId(task.id)
        setError(null)
        await respondTaskApproval(task.id, choice)
        await refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setApprovingTaskId(null)
      }
    },
    [approvingTaskId, refresh, setError]
  )

  const handleRespondClarify = useCallback(
    async (task: Task, answer: string) => {
      if (clarifyingTaskId) return
      try {
        setClarifyingTaskId(task.id)
        setError(null)
        await respondTaskClarify(task.id, answer)
        await refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setClarifyingTaskId(null)
      }
    },
    [clarifyingTaskId, refresh, setError]
  )

  const handleDeleteTask = useCallback(
    async (task: Task) => {
      const confirmed = window.confirm('只删除 Hermes Cowork 中的任务记录，不删除工作区文件。确定删除吗？')
      if (!confirmed) return
      try {
        await deleteTask(task.id)
        setSelectedTaskId(null)
        await refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    },
    [refresh, setError, setSelectedTaskId]
  )

  const handlePinTask = useCallback(
    async (task: Task) => {
      setError(null)
      try {
        await pinTask(task.id, !task.pinned)
        await refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    },
    [refresh, setError]
  )

  const handleArchiveTask = useCallback(
    async (task: Task) => {
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
    },
    [refresh, selectedTaskId, setError, setSelectedTaskId, taskScope]
  )

  const handleToggleTag = useCallback(
    async (task: Task, tag: string) => {
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
    },
    [refresh, setError]
  )

  return {
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
  }
}
