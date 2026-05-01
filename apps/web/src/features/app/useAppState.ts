import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState } from '../../lib/api'
import { getAppState } from './appStateApi'

const emptyAppState: AppState = {
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

export function useAppState() {
  const [state, setState] = useState<AppState>(emptyAppState)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('default')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null | undefined>(undefined)
  const selectedTaskIdRef = useRef<string | null | undefined>(selectedTaskId)
  const selectedWorkspaceIdRef = useRef(selectedWorkspaceId)

  useEffect(() => {
    selectedTaskIdRef.current = selectedTaskId
  }, [selectedTaskId])

  useEffect(() => {
    selectedWorkspaceIdRef.current = selectedWorkspaceId
  }, [selectedWorkspaceId])

  const refresh = useCallback(async () => {
    const next = await getAppState()
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
  }, [])

  return {
    state,
    setState,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    selectedTaskId,
    setSelectedTaskId,
    refresh
  }
}
