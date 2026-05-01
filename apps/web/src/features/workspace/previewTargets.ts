import { artifactRawUrl, type Artifact, type WorkspaceFile } from '../../lib/api'
import type { FilePreviewTarget } from '../file-preview/FilePreviewPanel'
import { workspaceFileRawUrl } from './workspaceApi'

export function workspacePreviewTarget(file: WorkspaceFile, workspaceId: string): FilePreviewTarget {
  return {
    source: 'workspace',
    title: file.relativePath || file.name,
    name: file.name,
    relativePath: file.relativePath,
    path: file.path,
    type: file.type || 'file',
    size: file.size,
    timestamp: file.modifiedAt,
    workspaceId
  }
}

export function artifactPreviewTarget(artifact: Artifact): FilePreviewTarget {
  return {
    source: 'artifact',
    title: artifact.name,
    name: artifact.name,
    relativePath: artifact.relativePath,
    path: artifact.path,
    type: artifact.type || 'file',
    size: artifact.size,
    timestamp: artifact.createdAt,
    workspaceId: artifact.workspaceId,
    artifactId: artifact.id
  }
}

export function previewRawUrl(target: FilePreviewTarget) {
  if (target.source === 'artifact' && target.artifactId) return artifactRawUrl(target.artifactId)
  if (target.workspaceId) return workspaceFileRawUrl(target.workspaceId, target.relativePath)
  return undefined
}
