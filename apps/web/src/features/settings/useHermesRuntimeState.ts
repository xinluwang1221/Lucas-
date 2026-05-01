import { useCallback, useState } from 'react'
import {
  getHermesRuntime,
  getHermesSessions,
  getHermesUpdateStatus,
  runHermesAutoUpdate,
  runHermesCompatibilityTest,
  type HermesAutoUpdateResult,
  type HermesCompatibilityTestResult,
  type HermesRuntime,
  type HermesSessionSummary,
  type HermesUpdateStatus
} from '../../lib/api'

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}

export function useHermesRuntimeState({ onRuntimeError }: { onRuntimeError?: (message: string) => void } = {}) {
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

  const refreshRuntime = useCallback(async () => {
    try {
      setRuntime(await getHermesRuntime())
    } catch (cause) {
      onRuntimeError?.(errorMessage(cause))
    }
  }, [onRuntimeError])

  const refreshHermesUpdateStatus = useCallback(async () => {
    setHermesUpdateLoading(true)
    setHermesUpdateError(null)
    try {
      setHermesUpdate(await getHermesUpdateStatus())
    } catch (cause) {
      setHermesUpdateError(errorMessage(cause))
    } finally {
      setHermesUpdateLoading(false)
    }
  }, [])

  const handleRunHermesCompatibilityTest = useCallback(async () => {
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
      setHermesCompatibilityError(errorMessage(cause))
    } finally {
      setHermesCompatibilityRunning(false)
    }
  }, [refreshHermesUpdateStatus])

  const handleRunHermesAutoUpdate = useCallback(async () => {
    setHermesAutoUpdating(true)
    setHermesAutoUpdateError(null)
    try {
      const result = await runHermesAutoUpdate()
      setHermesAutoUpdateResult(result)
      setHermesCompatibilityResult(result.postTest ?? result.preTest)
      await refreshHermesUpdateStatus()
    } catch (cause) {
      setHermesAutoUpdateError(errorMessage(cause))
    } finally {
      setHermesAutoUpdating(false)
    }
  }, [refreshHermesUpdateStatus])

  const refreshHermesSessions = useCallback(async () => {
    try {
      const response = await getHermesSessions()
      setHermesSessions(response.sessions)
    } catch {
      setHermesSessions([])
    }
  }, [])

  return {
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
  }
}
