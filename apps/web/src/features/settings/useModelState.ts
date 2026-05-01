import { useCallback, useState } from 'react'
import { listModels, refreshModelCatalog } from './modelApi'
import {
  type HermesModelCatalogProvider,
  type HermesModelOverview,
  type ModelListResponse,
  type ModelOption
} from '../../lib/api'

export function useModelState() {
  const [models, setModels] = useState<ModelOption[]>([])
  const [modelCatalog, setModelCatalog] = useState<HermesModelCatalogProvider[]>([])
  const [selectedModelId, setSelectedModelId] = useState('auto')
  const [hermesModel, setHermesModel] = useState<HermesModelOverview | null>(null)
  const [hermesModelUpdating, setHermesModelUpdating] = useState<string | null>(null)
  const [hermesModelError, setHermesModelError] = useState<string | null>(null)
  const [modelCatalogRefreshing, setModelCatalogRefreshing] = useState(false)
  const [modelNotice, setModelNotice] = useState<string | null>(null)

  const applyModelResponse = useCallback((response: ModelListResponse, selectedModelOverride?: string) => {
    setModels(response.models)
    setSelectedModelId(selectedModelOverride ?? response.selectedModelId)
    setHermesModel(response.hermes)
    setModelCatalog(response.catalog ?? [])
  }, [])

  const refreshModels = useCallback(async () => {
    applyModelResponse(await listModels())
  }, [applyModelResponse])

  const refreshModelCatalogState = useCallback(async () => {
    setModelCatalogRefreshing(true)
    setHermesModelError(null)
    setModelNotice(null)
    try {
      const response = await refreshModelCatalog()
      applyModelResponse(response)
      const sourceSummary = response.catalogRefresh?.sources
        ?.map((source) => `${source.label}${source.ok ? `：${source.addedModels.length} 个模型` : '：刷新失败'}`)
        .join('；')
      setModelNotice(sourceSummary ? `模型目录已刷新。${sourceSummary}` : '模型目录已刷新')
    } catch (cause) {
      setHermesModelError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setModelCatalogRefreshing(false)
    }
  }, [applyModelResponse])

  return {
    models,
    modelCatalog,
    selectedModelId,
    setSelectedModelId,
    hermesModel,
    hermesModelUpdating,
    setHermesModelUpdating,
    hermesModelError,
    setHermesModelError,
    modelCatalogRefreshing,
    modelNotice,
    setModelNotice,
    applyModelResponse,
    refreshModels,
    refreshModelCatalogState
  }
}
