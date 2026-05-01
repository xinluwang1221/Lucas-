import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import {
  archiveTask,
  createTask,
  deleteTask,
  pinTask,
  sendTaskMessage,
  setTaskTags,
  stopTask
} from './chatApi'
import type { ModelOption, Task, Workspace } from '../../lib/api'
import type { TaskScope } from './useTaskSelection'

type UseTaskActionsParams = {
  prompt: string
  selectedWorkspace?: Workspace
  selectedTask?: Task
  runningTask?: Task
  selectedModel: ModelOption
  composerSkillNames: string[]
  selectedTaskId: string | null | undefined
  taskScope: TaskScope
  refresh: () => Promise<void>
  resolveModelSelectionKey: (model: ModelOption) => string
  setError: (message: string | null) => void
  setPrompt: Dispatch<SetStateAction<string>>
  setComposerSkillNames: Dispatch<SetStateAction<string[]>>
  setSelectedTaskId: Dispatch<SetStateAction<string | null | undefined>>
}

export function useTaskActions({
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
}: UseTaskActionsParams) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [stoppingTaskId, setStoppingTaskId] = useState<string | null>(null)

  const submitPrompt = useCallback(async () => {
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
  }, [
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
    submitPrompt,
    handleStop,
    handleDeleteTask,
    handlePinTask,
    handleArchiveTask,
    handleToggleTag
  }
}
