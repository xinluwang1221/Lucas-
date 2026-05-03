import { jsonHeaders, request } from '../../lib/http'
import type {
  HermesAutoUpdateResult,
  HermesCompatibilityTestResult,
  HermesDashboardAdapterStatus,
  HermesRuntime,
  HermesSessionDetailResponse,
  HermesSessionsResponse,
  RenameHermesSessionResponse,
  HermesUpdateStatus
} from '../../lib/api'

export async function getHermesRuntime(): Promise<HermesRuntime> {
  return request('/api/hermes/runtime')
}

export async function startHermesDashboard(): Promise<HermesDashboardAdapterStatus> {
  return request('/api/hermes/dashboard/start', { method: 'POST' })
}

export async function getHermesUpdateStatus(): Promise<HermesUpdateStatus> {
  return request('/api/hermes/update-status')
}

export async function runHermesCompatibilityTest(): Promise<HermesCompatibilityTestResult> {
  return request('/api/hermes/compatibility-test', {
    method: 'POST'
  })
}

export async function runHermesAutoUpdate(): Promise<HermesAutoUpdateResult> {
  return request('/api/hermes/update', {
    method: 'POST'
  })
}

export async function getHermesSessions(params: { q?: string; limit?: number } = {}): Promise<HermesSessionsResponse> {
  const query = new URLSearchParams()
  if (params.q?.trim()) query.set('q', params.q.trim())
  if (params.limit) query.set('limit', String(params.limit))
  const suffix = query.toString()
  return request(`/api/hermes/sessions${suffix ? `?${suffix}` : ''}`)
}

export async function getHermesSessionDetail(sessionId: string): Promise<HermesSessionDetailResponse> {
  return request(`/api/hermes/sessions/${encodeURIComponent(sessionId)}`)
}

export async function renameHermesSession(sessionId: string, title: string): Promise<RenameHermesSessionResponse> {
  return request(`/api/hermes/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ title })
  })
}
