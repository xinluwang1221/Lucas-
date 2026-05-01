import { useCallback, useState, type FormEvent } from 'react'
import { configureHermesModel, selectModel } from './modelApi'
import {
  type HermesModelCatalogProvider,
  type HermesModelOverview,
  type ModelListResponse
} from '../../lib/api'
import {
  defaultModelApiMode,
  hermesProviderId,
  providerSavedModelConfig
} from './models'

type UseModelConfigFormParams = {
  hermesModel: HermesModelOverview | null
  modelCatalog: HermesModelCatalogProvider[]
  applyModelResponse: (response: ModelListResponse, selectedModelOverride?: string) => void
  refreshModels: () => Promise<void>
  setModelNotice: (message: string | null) => void
  setHermesModelError: (message: string | null) => void
  onModelMenuClose: () => void
}

export function useModelConfigForm({
  hermesModel,
  modelCatalog,
  applyModelResponse,
  refreshModels,
  setModelNotice,
  setHermesModelError,
  onModelMenuClose
}: UseModelConfigFormParams) {
  const [modelPanelOpen, setModelPanelOpen] = useState(false)
  const [newModelId, setNewModelId] = useState('')
  const [newModelLabel, setNewModelLabel] = useState('')
  const [newModelProvider, setNewModelProvider] = useState('')
  const [newModelBaseUrl, setNewModelBaseUrl] = useState('')
  const [newModelApiKey, setNewModelApiKey] = useState('')
  const [newModelApiMode, setNewModelApiMode] = useState('chat_completions')
  const [modelPanelSaving, setModelPanelSaving] = useState(false)

  const selectNewModelProvider = useCallback(
    (providerId: string) => {
      const savedConfig = providerSavedModelConfig(providerId, hermesModel)
      setNewModelProvider(providerId)
      setNewModelId('')
      setNewModelLabel('')
      setNewModelBaseUrl(savedConfig.baseUrl)
      setNewModelApiKey('')
      setNewModelApiMode(savedConfig.apiMode || defaultModelApiMode(providerId))
    },
    [hermesModel]
  )

  const openModelConfigPanel = useCallback(
    (providerId = hermesModel?.provider || '', modelId = '') => {
      setModelNotice(null)
      const knownProviderId = modelCatalog.some((provider) => provider.id === providerId) ? providerId : ''
      const savedConfig = providerSavedModelConfig(knownProviderId, hermesModel)
      const providerModels = modelCatalog.find((provider) => provider.id === knownProviderId)?.models ?? []
      const defaultModel =
        modelId ||
        (hermesProviderId(knownProviderId) === hermesProviderId(hermesModel?.provider ?? '')
          ? hermesModel?.defaultModel ?? ''
          : '')

      setNewModelProvider(knownProviderId)
      setNewModelId(defaultModel)
      setNewModelLabel(defaultModel ? (providerModels.includes(defaultModel) ? defaultModel : 'custom') : '')
      setNewModelBaseUrl(savedConfig.baseUrl)
      setNewModelApiKey('')
      setNewModelApiMode(savedConfig.apiMode || defaultModelApiMode(knownProviderId))
      setModelPanelOpen(true)
    },
    [hermesModel, modelCatalog, setModelNotice]
  )

  const closeModelConfigPanel = useCallback(() => {
    if (!modelPanelSaving) setModelPanelOpen(false)
  }, [modelPanelSaving])

  const handleAddModel = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      const id = newModelId.trim() || newModelLabel.trim()
      const provider = hermesProviderId(newModelProvider)
      if (!id || !provider) return
      setModelNotice(null)
      setHermesModelError(null)
      setModelPanelSaving(true)
      try {
        const response = await configureHermesModel({
          provider,
          modelId: id,
          baseUrl: newModelBaseUrl.trim() || undefined,
          apiKey: newModelApiKey.trim() || undefined,
          apiMode: newModelApiMode
        })
        await selectModel('auto')
        applyModelResponse(response, 'auto')
        setNewModelId('')
        setNewModelLabel('')
        setNewModelProvider('')
        setNewModelBaseUrl('')
        setNewModelApiKey('')
        setNewModelApiMode('chat_completions')
        setModelPanelOpen(false)
        onModelMenuClose()
        setModelNotice(`已配置 Hermes 默认模型：${id}`)
        await refreshModels()
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause)
        setModelNotice(message)
        setHermesModelError(message)
      } finally {
        setModelPanelSaving(false)
      }
    },
    [
      applyModelResponse,
      newModelApiKey,
      newModelApiMode,
      newModelBaseUrl,
      newModelId,
      newModelLabel,
      newModelProvider,
      onModelMenuClose,
      refreshModels,
      setHermesModelError,
      setModelNotice
    ]
  )

  return {
    modelPanelOpen,
    modelPanelSaving,
    newModelId,
    newModelLabel,
    newModelProvider,
    newModelBaseUrl,
    newModelApiKey,
    newModelApiMode,
    setNewModelId,
    setNewModelLabel,
    setNewModelBaseUrl,
    setNewModelApiKey,
    setNewModelApiMode,
    selectNewModelProvider,
    openModelConfigPanel,
    closeModelConfigPanel,
    handleAddModel
  }
}
