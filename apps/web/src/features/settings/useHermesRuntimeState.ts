import { useCallback, useState } from 'react'
import {
  getHermesDiagnostics,
  getHermesRuntime,
  getHermesSessions,
  getHermesUpdateStatus,
  runHermesAutoUpdate,
  runHermesCompatibilityTest,
  startHermesDashboard
} from './runtimeApi'
import type {
  HermesAutoUpdateResult,
  HermesCompatibilityTestResult,
  HermesDiagnosticsStatus,
  HermesRuntime,
  HermesSessionSummary,
  HermesUpdateStatus
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
  const [hermesDashboardStarting, setHermesDashboardStarting] = useState(false)
  const [hermesDashboardError, setHermesDashboardError] = useState<string | null>(null)
  const [hermesDiagnostics, setHermesDiagnostics] = useState<HermesDiagnosticsStatus | null>(null)
  const [hermesDiagnosticsLoading, setHermesDiagnosticsLoading] = useState(false)
  const [hermesDiagnosticsError, setHermesDiagnosticsError] = useState<string | null>(null)

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

  const handleStartHermesDashboard = useCallback(async () => {
    setHermesDashboardStarting(true)
    setHermesDashboardError(null)
    try {
      const dashboard = await startHermesDashboard()
      setRuntime((current) => current ? { ...current, dashboard, updatedAt: new Date().toISOString() } : current)
      await refreshRuntime()
    } catch (cause) {
      setHermesDashboardError(errorMessage(cause))
    } finally {
      setHermesDashboardStarting(false)
    }
  }, [refreshRuntime])

  const refreshHermesDiagnostics = useCallback(async (options: { start?: boolean } = {}) => {
    setHermesDiagnosticsLoading(true)
    setHermesDiagnosticsError(null)
    try {
      setHermesDiagnostics(await getHermesDiagnostics({ days: 30, start: options.start }))
    } catch (cause) {
      setHermesDiagnosticsError(errorMessage(cause))
    } finally {
      setHermesDiagnosticsLoading(false)
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
  }
}
