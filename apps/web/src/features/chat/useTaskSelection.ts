import { useMemo } from 'react'
import type { AppState, HermesSessionSummary } from '../../lib/api'
import { hiddenTaskMessages, visibleTaskMessages } from './messageUtils'

export type TaskScope = 'active' | 'archived' | 'all'
export type TaskWorkspaceScope = 'current' | 'all'

type UseTaskSelectionParams = {
  state: AppState
  selectedWorkspaceId: string
  selectedTaskId: string | null | undefined
  taskSearch: string
  taskScope: TaskScope
  taskWorkspaceScope: TaskWorkspaceScope
  selectedTaskTag: string
  hermesSessions: HermesSessionSummary[]
}

export function useTaskSelection({
  state,
  selectedWorkspaceId,
  selectedTaskId,
  taskSearch,
  taskScope,
  taskWorkspaceScope,
  selectedTaskTag,
  hermesSessions
}: UseTaskSelectionParams) {
  const selectedWorkspace = useMemo(
    () => state.workspaces.find((workspace) => workspace.id === selectedWorkspaceId),
    [selectedWorkspaceId, state.workspaces]
  )

  const selectedTask = useMemo(
    () => (selectedTaskId ? state.tasks.find((task) => task.id === selectedTaskId) : undefined),
    [selectedTaskId, state.tasks]
  )

  const runningTask = useMemo(() => state.tasks.find((task) => task.status === 'running'), [state.tasks])

  const filteredTasks = useMemo(() => {
    const keyword = taskSearch.trim().toLowerCase()
    return state.tasks.filter((task) => {
      if (taskWorkspaceScope === 'current' && task.workspaceId !== selectedWorkspaceId) return false
      if (taskScope === 'active' && task.archivedAt) return false
      if (taskScope === 'archived' && !task.archivedAt) return false
      if (selectedTaskTag !== 'all' && !(task.tags ?? []).includes(selectedTaskTag)) return false
      if (!keyword) return true
      return `${task.title} ${task.prompt} ${task.status} ${task.hermesSessionId ?? ''} ${(task.tags ?? []).join(
        ' '
      )}`
        .toLowerCase()
        .includes(keyword)
    })
  }, [state.tasks, taskSearch, taskScope, taskWorkspaceScope, selectedWorkspaceId, selectedTaskTag])

  const sidebarWorkspaceGroups = useMemo(() => {
    return state.workspaces.map((workspace) => ({
      workspace,
      tasks: state.tasks
        .filter((task) => task.workspaceId === workspace.id && !task.archivedAt)
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 8),
      archivedTasks: state.tasks
        .filter((task) => task.workspaceId === workspace.id && task.archivedAt)
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 16)
    }))
  }, [state.workspaces, state.tasks])

  const taskGroups = useMemo(() => {
    return state.workspaces
      .map((workspace) => ({
        workspace,
        tasks: filteredTasks.filter((task) => task.workspaceId === workspace.id)
      }))
      .filter(
        (group) => group.tasks.length > 0 || (taskWorkspaceScope === 'current' && group.workspace.id === selectedWorkspaceId)
      )
  }, [filteredTasks, state.workspaces, taskWorkspaceScope, selectedWorkspaceId])

  const scopedTasks = useMemo(
    () =>
      state.tasks.filter((task) =>
        taskWorkspaceScope === 'current' ? task.workspaceId === selectedWorkspaceId : true
      ),
    [state.tasks, taskWorkspaceScope, selectedWorkspaceId]
  )

  const scopeFilteredTasks = useMemo(() => {
    return scopedTasks.filter((task) => {
      if (taskScope === 'active' && task.archivedAt) return false
      if (taskScope === 'archived' && !task.archivedAt) return false
      return true
    })
  }, [scopedTasks, taskScope])

  const activeTaskCount = useMemo(() => scopedTasks.filter((task) => !task.archivedAt).length, [scopedTasks])
  const archivedTaskCount = useMemo(() => scopedTasks.filter((task) => task.archivedAt).length, [scopedTasks])

  const selectedTaskMessages = useMemo(() => (selectedTask ? visibleTaskMessages(selectedTask) : []), [selectedTask])
  const selectedTaskHiddenMessages = useMemo(
    () => (selectedTask ? hiddenTaskMessages(selectedTask, selectedTaskMessages) : []),
    [selectedTask, selectedTaskMessages]
  )

  const selectedHermesSession = useMemo(
    () =>
      selectedTask?.hermesSessionId
        ? hermesSessions.find((session) => session.id === selectedTask.hermesSessionId)
        : undefined,
    [hermesSessions, selectedTask?.hermesSessionId]
  )

  return {
    selectedWorkspace,
    selectedTask,
    runningTask,
    filteredTasks,
    sidebarWorkspaceGroups,
    taskGroups,
    scopedTasks,
    scopeFilteredTasks,
    activeTaskCount,
    archivedTaskCount,
    selectedTaskMessages,
    selectedTaskHiddenMessages,
    selectedHermesSession
  }
}
