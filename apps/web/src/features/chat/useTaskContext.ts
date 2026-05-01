import { useCallback, useEffect, useRef, useState } from 'react'
import {
  compressTaskContext,
  getTaskContext,
  type HermesContextSnapshot,
  type Task
} from '../../lib/api'

type UseTaskContextParams = {
  selectedTask?: Task
  refreshAppState: () => Promise<void>
}

export function useTaskContext({ selectedTask, refreshAppState }: UseTaskContextParams) {
  const [selectedTaskContext, setSelectedTaskContext] = useState<HermesContextSnapshot | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [contextCompressing, setContextCompressing] = useState(false)
  const [contextError, setContextError] = useState<string | null>(null)
  const selectedTaskIdRef = useRef<string | undefined>(selectedTask?.id)
  const refreshAppStateRef = useRef(refreshAppState)

  useEffect(() => {
    selectedTaskIdRef.current = selectedTask?.id
  }, [selectedTask?.id])

  useEffect(() => {
    refreshAppStateRef.current = refreshAppState
  }, [refreshAppState])

  const refreshSelectedTaskContext = useCallback(
    async (task = selectedTask) => {
      if (!task) {
        setSelectedTaskContext(null)
        setContextError(null)
        return
      }
      setContextLoading(true)
      setContextError(null)
      try {
        const context = await getTaskContext(task.id)
        if (selectedTaskIdRef.current === task.id) {
          setSelectedTaskContext(context)
        }
      } catch (cause) {
        if (selectedTaskIdRef.current === task.id) {
          setContextError(cause instanceof Error ? cause.message : String(cause))
        }
      } finally {
        if (selectedTaskIdRef.current === task.id) {
          setContextLoading(false)
        }
      }
    },
    [selectedTask]
  )

  const compressSelectedTaskContext = useCallback(async () => {
    if (!selectedTask || selectedTask.status === 'running') return
    setContextCompressing(true)
    setContextError(null)
    try {
      const result = await compressTaskContext(selectedTask.id)
      setSelectedTaskContext(result.context)
      await refreshAppStateRef.current()
    } catch (cause) {
      setContextError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setContextCompressing(false)
    }
  }, [selectedTask])

  useEffect(() => {
    let cancelled = false
    if (!selectedTask) {
      setSelectedTaskContext(null)
      setContextError(null)
      setContextLoading(false)
      return () => {
        cancelled = true
      }
    }
    setContextLoading(true)
    setContextError(null)
    void getTaskContext(selectedTask.id)
      .then((context) => {
        if (!cancelled) setSelectedTaskContext(context)
      })
      .catch((cause) => {
        if (!cancelled) setContextError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedTask?.id, selectedTask?.status, selectedTask?.hermesSessionId, selectedTask?.events?.length])

  return {
    selectedTaskContext,
    contextLoading,
    contextCompressing,
    contextError,
    refreshSelectedTaskContext,
    compressSelectedTaskContext
  }
}
