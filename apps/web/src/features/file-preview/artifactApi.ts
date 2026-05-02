import { apiUrl, parseError, request } from '../../lib/http'

export function artifactDownloadUrl(artifactId: string) {
  return apiUrl(`/api/artifacts/${artifactId}/download`)
}

export function artifactRawUrl(artifactId: string) {
  return apiUrl(`/api/artifacts/${artifactId}/raw`)
}

export function artifactQuickLookUrl(artifactId: string) {
  return apiUrl(`/api/artifacts/${artifactId}/quicklook`)
}

export async function revealArtifact(artifactId: string) {
  return request(`/api/artifacts/${artifactId}/reveal`, { method: 'POST' })
}

export async function openArtifact(artifactId: string) {
  return request(`/api/artifacts/${artifactId}/open`, { method: 'POST' })
}

export async function previewArtifact(artifactId: string): Promise<string> {
  const response = await fetch(apiUrl(`/api/artifacts/${artifactId}/preview`))
  if (!response.ok) {
    const error = await parseError(response)
    throw new Error(error)
  }
  return response.text()
}
