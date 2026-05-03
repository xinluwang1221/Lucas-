import { useCallback, useState } from 'react'
import type { HermesToolset } from '../../lib/api'
import { request } from '../../lib/http'

export function useHermesToolsets() {
  const [toolsets, setToolsets] = useState<HermesToolset[]>([])
  const [toolsetsError, setToolsetsError] = useState<string | null>(null)

  const refreshToolsets = useCallback(async () => {
    setToolsetsError(null)
    try {
      setToolsets(await request<HermesToolset[]>('/api/hermes/dashboard/official/toolsets'))
    } catch (cause) {
      setToolsetsError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  return {
    toolsets,
    toolsetsError,
    refreshToolsets
  }
}
