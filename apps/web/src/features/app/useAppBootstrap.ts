import { useEffect } from 'react'

type AsyncRefresh = () => Promise<void>

type UseAppBootstrapParams = {
  refreshRuntime: AsyncRefresh
  refreshHermesUpdateStatus: AsyncRefresh
  refreshHermesSessions: AsyncRefresh
  refreshHermesMcp: AsyncRefresh
  refreshMcpServeStatus: AsyncRefresh
  refreshMcpRecommendationsState: AsyncRefresh
  refreshBackgroundStatus: AsyncRefresh
  refreshCronState: AsyncRefresh
  refreshSkills: AsyncRefresh
  refreshModels: AsyncRefresh
}

export function useAppBootstrap({
  refreshRuntime,
  refreshHermesUpdateStatus,
  refreshHermesSessions,
  refreshHermesMcp,
  refreshMcpServeStatus,
  refreshMcpRecommendationsState,
  refreshBackgroundStatus,
  refreshCronState,
  refreshSkills,
  refreshModels
}: UseAppBootstrapParams) {
  useEffect(() => {
    void refreshRuntime()
    void refreshHermesUpdateStatus()
    void refreshHermesSessions()
    void refreshHermesMcp()
    void refreshMcpServeStatus()
    void refreshMcpRecommendationsState()
    void refreshBackgroundStatus()
    void refreshCronState()
    void refreshSkills().catch(() => undefined)
    void refreshModels().catch(() => undefined)
  }, [
    refreshBackgroundStatus,
    refreshCronState,
    refreshHermesMcp,
    refreshHermesSessions,
    refreshHermesUpdateStatus,
    refreshMcpRecommendationsState,
    refreshMcpServeStatus,
    refreshModels,
    refreshRuntime,
    refreshSkills
  ])
}
