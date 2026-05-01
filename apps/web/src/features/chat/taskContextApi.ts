import { request } from '../../lib/http'
import type { HermesContextCompressResult, HermesContextSnapshot } from '../../lib/api'

export async function getTaskContext(taskId: string): Promise<HermesContextSnapshot> {
  return request(`/api/tasks/${encodeURIComponent(taskId)}/context`)
}

export async function compressTaskContext(taskId: string): Promise<HermesContextCompressResult> {
  return request(`/api/tasks/${encodeURIComponent(taskId)}/context/compress`, {
    method: 'POST'
  })
}
