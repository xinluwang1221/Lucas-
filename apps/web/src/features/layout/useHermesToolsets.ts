import { useCallback, useState } from 'react'
import type { HermesToolset } from '../../lib/api'
import { jsonHeaders, request } from '../../lib/http'

export function useHermesToolsets() {
  const [toolsets, setToolsets] = useState<HermesToolset[]>([])
  const [toolsetsError, setToolsetsError] = useState<string | null>(null)
  const [toolsetUpdatingName, setToolsetUpdatingName] = useState<string | null>(null)

  const refreshToolsets = useCallback(async () => {
    setToolsetsError(null)
    try {
      setToolsets(await request<HermesToolset[]>('/api/hermes/dashboard/official/toolsets'))
    } catch (cause) {
      setToolsetsError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const toggleToolset = useCallback(
    async (toolset: HermesToolset) => {
      setToolsetsError(null)
      setToolsetUpdatingName(toolset.name)
      try {
        const result = await request<{ ok: boolean; toolset: HermesToolset }>(
          `/api/hermes/dashboard/official/toolsets/${encodeURIComponent(toolset.name)}/toggle`,
          {
            method: 'PUT',
            headers: jsonHeaders,
            body: JSON.stringify({ enabled: !toolset.enabled })
          }
        )
        setToolsets((current) => current.map((item) => item.name === toolset.name ? result.toolset : item))
        await refreshToolsets()
      } catch (cause) {
        setToolsetsError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setToolsetUpdatingName(null)
      }
    },
    [refreshToolsets]
  )

  return {
    toolsets,
    toolsetsError,
    toolsetUpdatingName,
    refreshToolsets,
    toggleToolset
  }
}
