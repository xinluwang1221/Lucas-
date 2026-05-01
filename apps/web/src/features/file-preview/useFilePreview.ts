import { useCallback, useEffect, useRef, useState } from 'react'
import { previewArtifact } from './artifactApi'
import type { Artifact, WorkspaceFile } from '../../lib/api'
import { previewWorkspaceFile } from '../workspace/workspaceApi'
import { artifactPreviewTarget, previewRawUrl, workspacePreviewTarget } from '../workspace/previewTargets'
import {
  isInlinePreviewKind,
  previewKind,
  type FilePreviewState,
  type FilePreviewTarget
} from './FilePreviewPanel'

type UseFilePreviewParams = {
  selectedWorkspaceId?: string
  onOpen?: () => void
  onError?: (message: string | null) => void
}

export function useFilePreview({ selectedWorkspaceId, onOpen, onError }: UseFilePreviewParams) {
  const [filePreview, setFilePreview] = useState<FilePreviewState | null>(null)
  const selectedWorkspaceIdRef = useRef(selectedWorkspaceId)
  const onOpenRef = useRef(onOpen)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    selectedWorkspaceIdRef.current = selectedWorkspaceId
  }, [selectedWorkspaceId])

  useEffect(() => {
    onOpenRef.current = onOpen
  }, [onOpen])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const closeFilePreview = useCallback(() => setFilePreview(null), [])

  const setLoadingPreview = useCallback((target: FilePreviewTarget) => {
    const kind = previewKind(target.title)
    const rawUrl = previewRawUrl(target)
    setFilePreview({
      target,
      title: target.title,
      body: '',
      kind,
      rawUrl,
      status: 'loading'
    })
    return { kind, rawUrl }
  }, [])

  const setReadyPreview = useCallback((target: FilePreviewTarget, body = '') => {
    const kind = previewKind(target.title)
    const rawUrl = previewRawUrl(target)
    setFilePreview({
      target,
      title: target.title,
      body,
      kind,
      rawUrl,
      status: 'ready'
    })
  }, [])

  const setErrorPreview = useCallback((target: FilePreviewTarget, message: string) => {
    const kind = previewKind(target.title)
    const rawUrl = previewRawUrl(target)
    setFilePreview({
      target,
      title: target.title,
      body: '',
      kind,
      rawUrl,
      status: message.includes('暂不支持') ? 'unsupported' : 'error',
      error: message
    })
  }, [])

  const openArtifactPreview = useCallback(
    async (artifact: Artifact) => {
      const target = artifactPreviewTarget(artifact)
      onErrorRef.current?.(null)
      onOpenRef.current?.()
      const { kind, rawUrl } = setLoadingPreview(target)
      if (isInlinePreviewKind(kind) && rawUrl) {
        setReadyPreview(target)
        return
      }
      try {
        setReadyPreview(target, await previewArtifact(artifact.id))
      } catch (cause) {
        setErrorPreview(target, cause instanceof Error ? cause.message : String(cause))
      }
    },
    [setErrorPreview, setLoadingPreview, setReadyPreview]
  )

  const openWorkspaceFilePreview = useCallback(
    async (file: WorkspaceFile, workspaceId = selectedWorkspaceIdRef.current) => {
      if (!workspaceId) return
      const target = workspacePreviewTarget(file, workspaceId)
      onErrorRef.current?.(null)
      onOpenRef.current?.()
      const { kind, rawUrl } = setLoadingPreview(target)
      if (isInlinePreviewKind(kind) && rawUrl) {
        setReadyPreview(target)
        return
      }
      try {
        setReadyPreview(target, await previewWorkspaceFile(workspaceId, file.relativePath))
      } catch (cause) {
        setErrorPreview(target, cause instanceof Error ? cause.message : String(cause))
      }
    },
    [setErrorPreview, setLoadingPreview, setReadyPreview]
  )

  return {
    filePreview,
    closeFilePreview,
    openArtifactPreview,
    openWorkspaceFilePreview
  }
}
