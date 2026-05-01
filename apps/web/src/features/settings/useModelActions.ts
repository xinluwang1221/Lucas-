import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type {
  HermesReasoningConfigureRequest,
  ModelListResponse,
  ModelOption
} from '../../lib/api'
import {
  configureHermesReasoning,
  deleteHermesModelProvider,
  deleteModel,
  selectModel,
  setHermesDefaultModel,
  setHermesFallbackProviders
} from './modelApi'

type UseModelActionsParams = {
  resolveModelSelectionKey: (model: ModelOption) => string
  applyModelResponse: (response: ModelListResponse, selectedModelOverride?: string) => void
  refreshModels: () => Promise<void>
  setSelectedModelId: Dispatch<SetStateAction<string>>
  setModelMenuOpen: Dispatch<SetStateAction<boolean>>
  setHermesModelUpdating: Dispatch<SetStateAction<string | null>>
  setHermesModelError: Dispatch<SetStateAction<string | null>>
  setModelNotice: Dispatch<SetStateAction<string | null>>
}

export function useModelActions({
  resolveModelSelectionKey,
  applyModelResponse,
  refreshModels,
  setSelectedModelId,
  setModelMenuOpen,
  setHermesModelUpdating,
  setHermesModelError,
  setModelNotice
}: UseModelActionsParams) {
  const handleSelectModel = useCallback(
    async (model: ModelOption) => {
      setModelNotice(null)
      const modelKey = resolveModelSelectionKey(model)
      await selectModel(modelKey)
      setSelectedModelId(modelKey)
      setModelMenuOpen(false)
      await refreshModels()
    },
    [refreshModels, resolveModelSelectionKey, setModelMenuOpen, setModelNotice, setSelectedModelId]
  )

  const handleConfigureReasoning = useCallback(
    async (request: HermesReasoningConfigureRequest, notice: string) => {
      setHermesModelUpdating('reasoning')
      setHermesModelError(null)
      setModelNotice(null)
      try {
        const response = await configureHermesReasoning(request)
        applyModelResponse(response)
        setModelNotice(notice)
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause)
        setHermesModelError(message)
        setModelNotice(message)
      } finally {
        setHermesModelUpdating(null)
      }
    },
    [applyModelResponse, setHermesModelError, setHermesModelUpdating, setModelNotice]
  )

  const handleSetHermesDefaultModel = useCallback(
    async (modelId: string, provider?: string) => {
      setHermesModelUpdating(`${provider ?? 'current'}:${modelId}`)
      setHermesModelError(null)
      try {
        const response = await setHermesDefaultModel(modelId, provider)
        applyModelResponse(response)
        setModelNotice(`Hermes 默认模型已更新为 ${modelId}`)
      } catch (cause) {
        setHermesModelError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setHermesModelUpdating(null)
      }
    },
    [applyModelResponse, setHermesModelError, setHermesModelUpdating, setModelNotice]
  )

  const handleDeleteModel = useCallback(
    async (model: ModelOption) => {
      if (model.builtIn) return
      const modelKey = resolveModelSelectionKey(model)
      setHermesModelUpdating(`delete-model:${modelKey}`)
      setHermesModelError(null)
      setModelNotice(null)
      try {
        const response = await deleteModel(modelKey)
        applyModelResponse(response)
        setModelMenuOpen(false)
        setModelNotice(`已从已配置模型中移除：${model.label}`)
      } catch (cause) {
        setHermesModelError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setHermesModelUpdating(null)
      }
    },
    [
      applyModelResponse,
      resolveModelSelectionKey,
      setHermesModelError,
      setHermesModelUpdating,
      setModelMenuOpen,
      setModelNotice
    ]
  )

  const handleSetHermesFallbackProviders = useCallback(
    async (providers: string[]) => {
      setHermesModelUpdating('fallbacks')
      setHermesModelError(null)
      try {
        const response = await setHermesFallbackProviders(providers)
        applyModelResponse(response)
        setModelNotice(providers.length ? '备用模型列表已更新' : '已关闭备用模型')
      } catch (error) {
        const cause = error instanceof Error ? error : new Error(String(error))
        setHermesModelError(cause.message)
      } finally {
        setHermesModelUpdating(null)
      }
    },
    [applyModelResponse, setHermesModelError, setHermesModelUpdating, setModelNotice]
  )

  const handleDeleteHermesModelProvider = useCallback(
    async (providerId: string, label: string) => {
      const ok = window.confirm(`删除 Hermes 模型服务“${label}”的 Cowork 可管理配置？如果它是当前默认模型，请先切换默认模型。`)
      if (!ok) return
      setHermesModelUpdating(`delete-provider:${providerId}`)
      setHermesModelError(null)
      setModelNotice(null)
      try {
        const response = await deleteHermesModelProvider(providerId)
        applyModelResponse(response)
        setModelNotice(`已移除模型服务配置：${label}`)
      } catch (cause) {
        setHermesModelError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setHermesModelUpdating(null)
      }
    },
    [applyModelResponse, setHermesModelError, setHermesModelUpdating, setModelNotice]
  )

  return {
    handleSelectModel,
    handleConfigureReasoning,
    handleSetHermesDefaultModel,
    handleDeleteModel,
    handleSetHermesFallbackProviders,
    handleDeleteHermesModelProvider
  }
}
