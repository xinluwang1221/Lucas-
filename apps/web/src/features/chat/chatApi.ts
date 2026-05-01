import { apiUrl, jsonHeaders, request } from '../../lib/http'
import type { Task } from '../../lib/api'

export async function createTask(
  workspaceId: string,
  prompt: string,
  modelId?: string,
  skillNames: string[] = []
): Promise<Task> {
  return request('/api/tasks', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ workspaceId, prompt, modelId, skillNames })
  })
}

export type SendTaskMessageResponse = {
  ok: true
  task: Task
}

export async function sendTaskMessage(
  taskId: string,
  prompt: string,
  modelId?: string,
  skillNames: string[] = []
): Promise<SendTaskMessageResponse> {
  return request<SendTaskMessageResponse>(`/api/tasks/${taskId}/messages`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ prompt, modelId, skillNames })
  })
}

export async function stopTask(taskId: string) {
  return request(`/api/tasks/${taskId}/stop`, { method: 'POST' })
}

export async function deleteTask(taskId: string) {
  return request(`/api/tasks/${taskId}`, { method: 'DELETE' })
}

export async function pinTask(taskId: string, pinned: boolean) {
  return request(`/api/tasks/${taskId}/pin`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ pinned })
  })
}

export async function archiveTask(taskId: string, archived: boolean) {
  return request(`/api/tasks/${taskId}/archive`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ archived })
  })
}

export async function setTaskTags(taskId: string, tags: string[]) {
  return request(`/api/tasks/${taskId}/tags`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ tags })
  })
}

export function taskExportUrl(taskId: string) {
  return apiUrl(`/api/tasks/${taskId}/export.md`)
}

export function taskStreamUrl(taskId: string) {
  return apiUrl(`/api/tasks/${encodeURIComponent(taskId)}/stream`)
}

export function tasksExportUrl(taskIds: string[]) {
  const params = new URLSearchParams()
  if (taskIds.length) params.set('ids', taskIds.join(','))
  return apiUrl(`/api/tasks/export.md${params.toString() ? `?${params.toString()}` : ''}`)
}
