import { jsonHeaders, request } from '../../lib/http'
import type { HermesCronJobInput, HermesCronState } from '../../lib/api'

export async function getHermesCronState(): Promise<HermesCronState> {
  return request('/api/hermes/cron')
}

export async function createHermesCronJob(input: HermesCronJobInput): Promise<HermesCronState> {
  return request('/api/hermes/cron', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input)
  })
}

export async function updateHermesCronJob(jobId: string, input: HermesCronJobInput): Promise<HermesCronState> {
  return request(`/api/hermes/cron/${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify(input)
  })
}

export async function pauseHermesCronJob(jobId: string): Promise<HermesCronState> {
  return request(`/api/hermes/cron/${encodeURIComponent(jobId)}/pause`, { method: 'POST' })
}

export async function resumeHermesCronJob(jobId: string): Promise<HermesCronState> {
  return request(`/api/hermes/cron/${encodeURIComponent(jobId)}/resume`, { method: 'POST' })
}

export async function runHermesCronJob(jobId: string): Promise<HermesCronState> {
  return request(`/api/hermes/cron/${encodeURIComponent(jobId)}/run`, { method: 'POST' })
}

export async function removeHermesCronJob(jobId: string): Promise<HermesCronState> {
  return request(`/api/hermes/cron/${encodeURIComponent(jobId)}`, { method: 'DELETE' })
}
