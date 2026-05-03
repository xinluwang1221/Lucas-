import { apiUrl, jsonHeaders, parseError, request } from '../../lib/http'
import type { Skill, SkillFile, SkillHubInstallResult, SkillHubResponse, SkillHubSource } from '../../lib/api'

export async function listSkills(): Promise<Skill[]> {
  return request('/api/skills')
}

export async function toggleSkill(skillId: string, enabled: boolean) {
  return request(`/api/skills/${encodeURIComponent(skillId)}/toggle`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ enabled })
  })
}

export async function uploadSkill(file: File) {
  const form = new FormData()
  form.append('skill', file)
  return request('/api/skills/upload', {
    method: 'POST',
    body: form
  })
}

export async function searchSkillHub({
  query = '',
  source = 'all',
  page = 1,
  pageSize = 18
}: {
  query?: string
  source?: SkillHubSource
  page?: number
  pageSize?: number
} = {}): Promise<SkillHubResponse> {
  const params = new URLSearchParams({
    source,
    page: String(page),
    pageSize: String(pageSize)
  })
  if (query.trim()) params.set('q', query.trim())
  return request(`/api/skills/hub?${params.toString()}`)
}

export async function installSkillFromHub(identifier: string, category = ''): Promise<SkillHubInstallResult> {
  return request('/api/skills/hub/install', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ identifier, category })
  })
}

export async function listSkillFiles(skillId: string): Promise<SkillFile[]> {
  return request(`/api/skills/${encodeURIComponent(skillId)}/files`)
}

export async function readSkillFile(skillId: string, relativePath: string): Promise<string> {
  const response = await fetch(
    apiUrl(`/api/skills/${encodeURIComponent(skillId)}/files/content?path=${encodeURIComponent(relativePath)}`)
  )
  if (!response.ok) {
    const error = await parseError(response)
    throw new Error(error)
  }
  return response.text()
}
