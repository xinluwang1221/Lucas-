import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspaceFile, WorkspaceTree } from '../../lib/api'
import { listWorkspaceFiles, listWorkspaceTree } from './workspaceApi'

type UseWorkspaceFilesParams = {
  selectedWorkspaceId: string
  refreshKey: unknown
  onWorkspaceChange?: () => void
}

export function useWorkspaceFiles({
  selectedWorkspaceId,
  refreshKey,
  onWorkspaceChange
}: UseWorkspaceFilesParams) {
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([])
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceTree | null>(null)
  const [workspaceTreePath, setWorkspaceTreePath] = useState('')
  const [workspaceFileQuery, setWorkspaceFileQuery] = useState('')
  const workspaceTreePathRef = useRef(workspaceTreePath)
  const onWorkspaceChangeRef = useRef(onWorkspaceChange)

  useEffect(() => {
    workspaceTreePathRef.current = workspaceTreePath
  }, [workspaceTreePath])

  useEffect(() => {
    onWorkspaceChangeRef.current = onWorkspaceChange
  }, [onWorkspaceChange])

  const refreshWorkspaceFiles = useCallback(async () => {
    if (!selectedWorkspaceId) return
    try {
      const [files, tree] = await Promise.all([
        listWorkspaceFiles(selectedWorkspaceId),
        listWorkspaceTree(selectedWorkspaceId, workspaceTreePathRef.current)
      ])
      setWorkspaceFiles(files)
      setWorkspaceTree(tree)
    } catch {
      setWorkspaceFiles([])
      setWorkspaceTree(null)
    }
  }, [selectedWorkspaceId])

  useEffect(() => {
    if (!selectedWorkspaceId) return
    void listWorkspaceFiles(selectedWorkspaceId)
      .then(setWorkspaceFiles)
      .catch(() => setWorkspaceFiles([]))
  }, [selectedWorkspaceId, refreshKey])

  useEffect(() => {
    setWorkspaceTreePath('')
    setWorkspaceFileQuery('')
    onWorkspaceChangeRef.current?.()
  }, [selectedWorkspaceId])

  useEffect(() => {
    if (!selectedWorkspaceId) return
    void listWorkspaceTree(selectedWorkspaceId, workspaceTreePath)
      .then(setWorkspaceTree)
      .catch(() => setWorkspaceTree(null))
  }, [selectedWorkspaceId, workspaceTreePath, refreshKey])

  return {
    workspaceFiles,
    workspaceTree,
    workspaceTreePath,
    setWorkspaceTreePath,
    workspaceFileQuery,
    setWorkspaceFileQuery,
    refreshWorkspaceFiles
  }
}
