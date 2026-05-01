import { jsonHeaders, request } from '../../lib/http'
import type {
  HermesModelConfigureRequest,
  HermesReasoningConfigureRequest,
  ModelListResponse,
  ModelOption
} from '../../lib/api'

export async function listModels(): Promise<ModelListResponse> {
  return request('/api/models')
}

export async function refreshModelCatalog(): Promise<ModelListResponse> {
  return request('/api/models/catalog/refresh', {
    method: 'POST'
  })
}

export async function selectModel(modelId: string) {
  return request('/api/models/select', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ modelId })
  })
}

export async function addModel(model: Pick<ModelOption, 'id' | 'label' | 'provider' | 'description'>): Promise<ModelOption> {
  return request('/api/models', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(model)
  })
}

export async function deleteModel(modelId: string): Promise<ModelListResponse> {
  return request(`/api/models/${encodeURIComponent(modelId)}`, {
    method: 'DELETE'
  })
}

export async function setHermesDefaultModel(modelId: string, provider?: string): Promise<ModelListResponse> {
  return request('/api/models/hermes-default', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ modelId, provider })
  })
}

export async function configureHermesModel(requestBody: HermesModelConfigureRequest): Promise<ModelListResponse> {
  return request('/api/models/configure', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(requestBody)
  })
}

export async function configureHermesReasoning(requestBody: HermesReasoningConfigureRequest): Promise<ModelListResponse> {
  return request('/api/models/reasoning', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(requestBody)
  })
}

export async function deleteHermesModelProvider(providerId: string): Promise<ModelListResponse> {
  return request(`/api/models/providers/${encodeURIComponent(providerId)}`, {
    method: 'DELETE'
  })
}

export async function setHermesFallbackProviders(providers: string[]): Promise<ModelListResponse> {
  return request('/api/models/fallbacks', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ providers })
  })
}
