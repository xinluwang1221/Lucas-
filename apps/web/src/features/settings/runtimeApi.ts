import { request } from '../../lib/http'
import type {
  HermesAutoUpdateResult,
  HermesCompatibilityTestResult,
  HermesDashboardAdapterStatus,
  HermesRuntime,
  HermesSessionsResponse,
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

export async function getHermesSessions(): Promise<HermesSessionsResponse> {
  return request('/api/hermes/sessions')
}
