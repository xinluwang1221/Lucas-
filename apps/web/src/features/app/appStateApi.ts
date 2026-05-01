import { request } from '../../lib/http'
import type { AppState } from '../../lib/api'

export async function getAppState(): Promise<AppState> {
  return request('/api/state')
}
