export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8787'

export const jsonHeaders = { 'Content-Type': 'application/json' }

export function apiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path
  if (!path.startsWith('/api')) return path
  return `${API_BASE}${path}`
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(url), init)
  if (!response.ok) {
    const error = await parseError(response)
    throw new Error(error)
  }
  return response.json()
}

export async function parseError(response: Response) {
  try {
    const data = await response.json()
    return data.error || response.statusText
  } catch {
    return response.statusText
  }
}
