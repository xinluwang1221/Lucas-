import { useCallback, useState } from 'react'
import type { HermesCronJobInput, HermesCronState } from '../../lib/api'
import {
  createHermesCronJob,
  getHermesCronState,
  pauseHermesCronJob,
  removeHermesCronJob,
  resumeHermesCronJob,
  runHermesCronJob,
  updateHermesCronJob
} from './scheduledApi'

export function useScheduledState() {
  const [cronState, setCronState] = useState<HermesCronState | null>(null)
  const [cronLoading, setCronLoading] = useState(false)
  const [cronError, setCronError] = useState<string | null>(null)
  const [cronSaving, setCronSaving] = useState(false)
  const [cronMutatingId, setCronMutatingId] = useState<string | null>(null)
  const [cronNotice, setCronNotice] = useState<string | null>(null)

  const refreshCronState = useCallback(async () => {
    setCronLoading(true)
    setCronError(null)
    try {
      setCronState(await getHermesCronState())
    } catch (cause) {
      setCronError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCronLoading(false)
    }
  }, [])

  const handleCreateCronJob = useCallback(async (input: HermesCronJobInput, onSuccess?: () => void) => {
    setCronSaving(true)
    setCronError(null)
    setCronNotice(null)
    try {
      setCronState(await createHermesCronJob(input))
      setCronNotice('已创建，Hermes gateway 运行时会按计划执行。')
      onSuccess?.()
    } catch (cause) {
      setCronError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCronSaving(false)
    }
  }, [])

  const handleUpdateCronJob = useCallback(async (jobId: string, input: HermesCronJobInput, onSuccess?: () => void) => {
    setCronSaving(true)
    setCronError(null)
    setCronNotice(null)
    try {
      setCronState(await updateHermesCronJob(jobId, input))
      setCronNotice('已保存，下一次执行会使用新配置。')
      onSuccess?.()
    } catch (cause) {
      setCronError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCronSaving(false)
    }
  }, [])

  const runJobAction = useCallback(async (jobId: string, action: 'pause' | 'resume' | 'run' | 'remove') => {
    setCronMutatingId(jobId)
    setCronError(null)
    setCronNotice(null)
    try {
      if (action === 'pause') {
        setCronState(await pauseHermesCronJob(jobId))
        setCronNotice('已暂停，任务不会自动执行。')
      } else if (action === 'resume') {
        setCronState(await resumeHermesCronJob(jobId))
        setCronNotice('已恢复，Hermes 会重新计算下一次执行时间。')
      } else if (action === 'run') {
        setCronState(await runHermesCronJob(jobId))
        setCronNotice('已排到下一次 Hermes cron tick。若 gateway 未运行，需要先启动后台。')
      } else {
        setCronState(await removeHermesCronJob(jobId))
        setCronNotice('已删除。')
      }
    } catch (cause) {
      setCronError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCronMutatingId(null)
    }
  }, [])

  return {
    cronState,
    cronLoading,
    cronError,
    cronSaving,
    cronMutatingId,
    cronNotice,
    setCronNotice,
    refreshCronState,
    handleCreateCronJob,
    handleUpdateCronJob,
    runJobAction
  }
}
