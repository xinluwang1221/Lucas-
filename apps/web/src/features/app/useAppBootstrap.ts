import { useEffect } from 'react'

type AsyncRefresh = () => Promise<void>

type UseAppBootstrapParams = {
  refreshRuntime: AsyncRefresh
  refreshHermesUpdateStatus: AsyncRefresh
  refreshHermesSessions: AsyncRefresh
  refreshHermesMcp: AsyncRefresh
  refreshMcpServeStatus: AsyncRefresh
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
    void refreshCronState()
    void refreshSkills().catch(() => undefined)
    void refreshModels().catch(() => undefined)
  }, [
    refreshCronState,
    refreshHermesMcp,
    refreshHermesSessions,
    refreshHermesUpdateStatus,
    refreshMcpServeStatus,
    refreshModels,
    refreshRuntime,
    refreshSkills
  ])
}
