import { useEffect, useRef, useState } from 'react'
import { taskStreamUrl, type Task } from '../../lib/api'

export type TaskStreamStatus = 'idle' | 'connecting' | 'live' | 'fallback'

type UseTaskStreamParams = {
  selectedTaskId: string | null | undefined
  selectedTaskStatus?: Task['status']
  hasRunningTask: boolean
  refresh: () => Promise<void>
  onTaskUpdate: (task: Task) => void
  onRefreshError?: (cause: unknown) => void
}

export function useTaskStream({
  selectedTaskId,
  selectedTaskStatus,
  hasRunningTask,
  refresh,
  onTaskUpdate,
  onRefreshError
}: UseTaskStreamParams) {
  const [taskStreamStatus, setTaskStreamStatus] = useState<TaskStreamStatus>('idle')
  const [taskStreamUpdatedAt, setTaskStreamUpdatedAt] = useState<string | null>(null)
  const refreshRef = useRef(refresh)
  const onTaskUpdateRef = useRef(onTaskUpdate)
  const onRefreshErrorRef = useRef(onRefreshError)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    onTaskUpdateRef.current = onTaskUpdate
  }, [onTaskUpdate])

  useEffect(() => {
    onRefreshErrorRef.current = onRefreshError
  }, [onRefreshError])

  useEffect(() => {
    void refreshRef.current().catch((cause) => onRefreshErrorRef.current?.(cause))
    const interval = window.setInterval(() => {
      void refreshRef.current().catch(() => undefined)
    }, hasRunningTask ? 900 : 1800)
    return () => window.clearInterval(interval)
  }, [hasRunningTask])

  useEffect(() => {
    if (!selectedTaskId || selectedTaskStatus !== 'running') {
      setTaskStreamStatus('idle')
      setTaskStreamUpdatedAt(null)
      return
    }

    setTaskStreamStatus('connecting')
    setTaskStreamUpdatedAt(null)
    const source = new EventSource(taskStreamUrl(selectedTaskId))
    source.addEventListener('open', () => {
      setTaskStreamStatus('live')
      setTaskStreamUpdatedAt(new Date().toISOString())
    })
    source.addEventListener('task', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { task?: Task }
        if (!payload.task) return
        onTaskUpdateRef.current(payload.task)
        setTaskStreamStatus('live')
        setTaskStreamUpdatedAt(new Date().toISOString())
      } catch {
        // Ignore malformed SSE payloads; the polling fallback will refresh state.
      }
    })
    source.addEventListener('task.deleted', () => {
      void refreshRef.current().catch(() => undefined)
    })
    source.addEventListener('error', () => {
      setTaskStreamStatus('fallback')
    })

    return () => source.close()
  }, [selectedTaskId, selectedTaskStatus])

  return { taskStreamStatus, taskStreamUpdatedAt }
}
