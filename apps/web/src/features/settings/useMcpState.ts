import { useCallback, useState } from 'react'
import {
  configureHermesMcpServer,
  getBackgroundStatus,
  getHermesMcpConfig,
  getHermesMcpRecommendations,
  getHermesMcpServeStatus,
  installBackgroundServices,
  refreshHermesMcpRecommendationsWithAi,
  removeHermesMcpServer,
  setHermesMcpServerEnabled,
  setHermesMcpServerTools,
  startHermesMcpServe,
  stopHermesMcpServe,
  testHermesMcpServer,
  uninstallBackgroundServices,
  updateHermesMcpServer,
  type BackgroundServiceStatus,
  type HermesMcpConfig,
  type HermesMcpInstallResult,
  type HermesMcpManualConfigRequest,
  type HermesMcpRecommendations,
  type HermesMcpServeStatus,
  type HermesMcpTestResult
} from '../../lib/api'

export function useMcpState() {
  const [hermesMcp, setHermesMcp] = useState<HermesMcpConfig | null>(null)
  const [mcpError, setMcpError] = useState<string | null>(null)
  const [mcpTestResults, setMcpTestResults] = useState<Record<string, HermesMcpTestResult>>({})
  const [mcpTestingId, setMcpTestingId] = useState<string | null>(null)
  const [mcpUpdatingId, setMcpUpdatingId] = useState<string | null>(null)
  const [mcpDeletingId, setMcpDeletingId] = useState<string | null>(null)
  const [mcpToolUpdatingId, setMcpToolUpdatingId] = useState<string | null>(null)
  const [mcpServeStatus, setMcpServeStatus] = useState<HermesMcpServeStatus | null>(null)
  const [mcpServeUpdating, setMcpServeUpdating] = useState(false)
  const [mcpServeError, setMcpServeError] = useState<string | null>(null)
  const [mcpRecommendations, setMcpRecommendations] = useState<HermesMcpRecommendations | null>(null)
  const [mcpRecommendationsLoading, setMcpRecommendationsLoading] = useState(false)
  const [mcpRecommendationsError, setMcpRecommendationsError] = useState<string | null>(null)
  const [backgroundStatus, setBackgroundStatus] = useState<BackgroundServiceStatus | null>(null)
  const [backgroundUpdating, setBackgroundUpdating] = useState(false)
  const [backgroundError, setBackgroundError] = useState<string | null>(null)

  const refreshHermesMcp = useCallback(async () => {
    setMcpError(null)
    try {
      setHermesMcp(await getHermesMcpConfig())
    } catch (cause) {
      setMcpError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const refreshMcpRecommendationsState = useCallback(async () => {
    setMcpRecommendationsError(null)
    try {
      setMcpRecommendations(await getHermesMcpRecommendations())
    } catch (cause) {
      setMcpRecommendationsError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const handleRefreshMcpRecommendationsWithAi = useCallback(async () => {
    setMcpRecommendationsLoading(true)
    setMcpRecommendationsError(null)
    try {
      setMcpRecommendations(await refreshHermesMcpRecommendationsWithAi())
    } catch (cause) {
      setMcpRecommendationsError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setMcpRecommendationsLoading(false)
    }
  }, [])

  const refreshBackgroundStatus = useCallback(async () => {
    setBackgroundError(null)
    try {
      setBackgroundStatus(await getBackgroundStatus())
    } catch (cause) {
      setBackgroundError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const refreshMcpServeStatus = useCallback(async () => {
    setMcpServeError(null)
    try {
      setMcpServeStatus(await getHermesMcpServeStatus())
    } catch (cause) {
      setMcpServeError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const handleToggleMcpServe = useCallback(
    async (shouldRun: boolean) => {
      setMcpServeUpdating(true)
      setMcpServeError(null)
      try {
        setMcpServeStatus(shouldRun ? await startHermesMcpServe() : await stopHermesMcpServe())
        window.setTimeout(() => void refreshMcpServeStatus(), 600)
      } catch (cause) {
        setMcpServeError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setMcpServeUpdating(false)
      }
    },
    [refreshMcpServeStatus]
  )

  const handleToggleBackgroundServices = useCallback(async (enabled: boolean) => {
    setBackgroundUpdating(true)
    setBackgroundError(null)
    try {
      setBackgroundStatus(enabled ? await installBackgroundServices() : await uninstallBackgroundServices())
    } catch (cause) {
      setBackgroundError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBackgroundUpdating(false)
    }
  }, [])

  const handleTestMcpServer = useCallback(async (serverId: string) => {
    setMcpTestingId(serverId)
    try {
      const result = await testHermesMcpServer(serverId)
      setMcpTestResults((current) => ({ ...current, [serverId]: result }))
    } catch (cause) {
      const result: HermesMcpTestResult = {
        serverId,
        ok: false,
        elapsedMs: 0,
        output: '',
        error: cause instanceof Error ? cause.message : String(cause),
        testedAt: new Date().toISOString()
      }
      setMcpTestResults((current) => ({ ...current, [serverId]: result }))
    } finally {
      setMcpTestingId(null)
    }
  }, [])

  const handleMcpInstalled = useCallback((result: HermesMcpInstallResult) => {
    setHermesMcp(result.config)
    if (result.testResult) {
      setMcpTestResults((current) => ({ ...current, [result.installName]: result.testResult! }))
    }
  }, [])

  const handleToggleMcpServer = useCallback(async (serverId: string, enabled: boolean) => {
    setMcpUpdatingId(serverId)
    setMcpError(null)
    try {
      setHermesMcp(await setHermesMcpServerEnabled(serverId, enabled))
    } catch (cause) {
      setMcpError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setMcpUpdatingId(null)
    }
  }, [])

  const handleDeleteMcpServer = useCallback(async (serverId: string) => {
    if (!window.confirm(`确定删除 MCP 服务「${serverId}」吗？删除前会自动备份 Hermes 配置。`)) return
    setMcpDeletingId(serverId)
    setMcpError(null)
    try {
      setHermesMcp(await removeHermesMcpServer(serverId))
      setMcpTestResults((current) => {
        const next = { ...current }
        delete next[serverId]
        return next
      })
    } catch (cause) {
      setMcpError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setMcpDeletingId(null)
    }
  }, [])

  const handleManualMcpSubmit = useCallback(
    async (config: HermesMcpManualConfigRequest, onSuccess?: () => void) => {
      setMcpUpdatingId(config.name)
      setMcpError(null)
      try {
        const result = await configureHermesMcpServer(config)
        handleMcpInstalled(result)
        onSuccess?.()
      } catch (cause) {
        setMcpError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setMcpUpdatingId(null)
      }
    },
    [handleMcpInstalled]
  )

  const handleEditMcpSubmit = useCallback(
    async (serverId: string, config: HermesMcpManualConfigRequest, onSuccess?: () => void) => {
      setMcpUpdatingId(serverId)
      setMcpError(null)
      try {
        const result = await updateHermesMcpServer(serverId, config)
        setHermesMcp(result.config)
        if (result.testResult) {
          setMcpTestResults((current) => ({ ...current, [result.serverId]: result.testResult! }))
        }
        onSuccess?.()
      } catch (cause) {
        setMcpError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setMcpUpdatingId(null)
      }
    },
    []
  )

  const handleSetMcpToolSelection = useCallback(
    async (serverId: string, mode: 'all' | 'include' | 'exclude', tools: string[]) => {
      setMcpToolUpdatingId(serverId)
      setMcpError(null)
      try {
        const result = await setHermesMcpServerTools(serverId, { mode, tools })
        setHermesMcp(result.config)
      } catch (cause) {
        setMcpError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setMcpToolUpdatingId(null)
      }
    },
    []
  )

  return {
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
  }
}
