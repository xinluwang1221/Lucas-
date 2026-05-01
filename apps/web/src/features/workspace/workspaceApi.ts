import type {
  PickedWorkspaceDirectory,
  Workspace,
  WorkspaceFile,
  WorkspaceTree
} from '../../lib/api'
import { apiUrl, jsonHeaders, parseError, request } from '../../lib/http'

export type {
  PickedWorkspaceDirectory,
  Workspace,
  WorkspaceFile,
  WorkspaceTree,
  WorkspaceTreeEntry
} from '../../lib/api'

export async function addWorkspace(name: string, path: string): Promise<Workspace> {
  return request('/api/workspaces', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ name, path })
  })
}

export async function pickWorkspaceDirectory(): Promise<PickedWorkspaceDirectory> {
  return request('/api/system/pick-directory', { method: 'POST' })
}

export async function updateWorkspace(workspaceId: string, payload: { name?: string; path?: string }): Promise<Workspace> {
  return request(`/api/workspaces/${workspaceId}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  })
}

export async function deleteWorkspace(workspaceId: string): Promise<{ ok: boolean; removedTaskCount: number }> {
  return request(`/api/workspaces/${workspaceId}`, { method: 'DELETE' })
}

export async function uploadFile(workspaceId: string, file: File): Promise<WorkspaceFile> {
  const form = new FormData()
  form.append('file', file)
  return request(`/api/workspaces/${workspaceId}/files`, {
    method: 'POST',
    body: form
  })
}

export async function listWorkspaceFiles(workspaceId: string): Promise<WorkspaceFile[]> {
  return request(`/api/workspaces/${workspaceId}/files`)
}

export async function listWorkspaceTree(workspaceId: string, relativePath = ''): Promise<WorkspaceTree> {
  const query = relativePath ? `?path=${encodeURIComponent(relativePath)}` : ''
  return request(`/api/workspaces/${workspaceId}/tree${query}`)
}

export async function revealWorkspace(workspaceId: string) {
  return request(`/api/workspaces/${workspaceId}/reveal`, { method: 'POST' })
}

export async function revealWorkspaceFile(workspaceId: string, relativePath: string) {
  return request(`/api/workspaces/${workspaceId}/files/reveal`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ path: relativePath })
  })
}

export function workspaceFileRawUrl(workspaceId: string, relativePath: string) {
  return apiUrl(`/api/workspaces/${workspaceId}/files/raw?path=${encodeURIComponent(relativePath)}`)
}

export async function previewWorkspaceFile(workspaceId: string, relativePath: string): Promise<string> {
  const response = await fetch(
    apiUrl(`/api/workspaces/${workspaceId}/files/preview?path=${encodeURIComponent(relativePath)}`)
  )
  if (!response.ok) {
    const error = await parseError(response)
    throw new Error(error)
  }
  return response.text()
}
