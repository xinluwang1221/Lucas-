import { apiUrl, jsonHeaders, parseError, request } from '../../lib/http'
import type { Skill, SkillFile } from '../../lib/api'

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
