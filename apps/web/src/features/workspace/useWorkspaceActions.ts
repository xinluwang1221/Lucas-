import { useState } from 'react'
import type { Artifact } from '../../lib/api'
import { openArtifact, revealArtifact } from '../file-preview/artifactApi'
import type { FilePreviewTarget } from '../file-preview/FilePreviewPanel'
import {
  addWorkspace,
  deleteWorkspace,
  pickWorkspaceDirectory,
  openWorkspaceFile,
  revealWorkspace,
  revealWorkspaceFile,
  updateWorkspace,
  uploadFile,
  type Workspace,
  type WorkspaceFile
} from './workspaceApi'

type WorkspaceTaskRef = {
  workspaceId: string
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}

function isPickerCancel(message: string) {
  return message.includes('取消')
}

export function useWorkspaceActions({
  workspaces,
  tasks,
  selectedWorkspace,
  refreshAppState,
  refreshWorkspaceFiles,
  resetWorkspaceTree,
  openWorkspace,
  openTaskComposer,
  appendPrompt,
  onError
}: {
  workspaces: Workspace[]
  tasks: WorkspaceTaskRef[]
  selectedWorkspace: Workspace | undefined
  refreshAppState: () => Promise<void>
  refreshWorkspaceFiles: () => Promise<void>
  resetWorkspaceTree: () => void
  openWorkspace: (workspaceId: string) => void
  openTaskComposer: () => void
  appendPrompt: (snippet: string) => void
  onError: (message: string | null) => void
}) {
  const [workspacePicking, setWorkspacePicking] = useState(false)
  const [workspaceUpdatingId, setWorkspaceUpdatingId] = useState<string | null>(null)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)

  async function handleAuthorizeWorkspace() {
    if (workspacePicking) return
    setWorkspacePicking(true)
    onError(null)
    try {
      const picked = await pickWorkspaceDirectory()
      const workspace = await addWorkspace(picked.name, picked.path)
      openWorkspace(workspace.id)
      await refreshAppState()
    } catch (cause) {
      const message = errorMessage(cause)
      if (!isPickerCancel(message)) onError(message)
    } finally {
      setWorkspacePicking(false)
    }
  }

  async function handleRenameWorkspace(workspace: Workspace) {
    const name = window.prompt('重命名工作区', workspace.name)?.trim()
    if (!name || name === workspace.name) return
    setWorkspaceUpdatingId(workspace.id)
    onError(null)
    try {
      await updateWorkspace(workspace.id, { name })
      await refreshAppState()
    } catch (cause) {
      onError(errorMessage(cause))
    } finally {
      setWorkspaceUpdatingId(null)
    }
  }

  async function handleReauthorizeWorkspace(workspace: Workspace) {
    if (workspacePicking) return
    setWorkspacePicking(true)
    setWorkspaceUpdatingId(workspace.id)
    onError(null)
    try {
      const picked = await pickWorkspaceDirectory()
      await updateWorkspace(workspace.id, { path: picked.path, name: picked.name })
      openWorkspace(workspace.id)
      resetWorkspaceTree()
      await refreshAppState()
    } catch (cause) {
      const message = errorMessage(cause)
      if (!isPickerCancel(message)) onError(message)
    } finally {
      setWorkspacePicking(false)
      setWorkspaceUpdatingId(null)
    }
  }

  async function handleRemoveWorkspace(workspace: Workspace) {
    if (workspace.id === 'default') {
      onError('Default Workspace 是 Cowork 的兜底工作区，不能移除。你可以点“重新授权文件夹”把它指向新的本机目录。')
      return
    }
    const workspaceTaskCount = tasks.filter((task) => task.workspaceId === workspace.id).length
    const confirmed = window.confirm(`移除工作区“${workspace.name}”？这只会移除 Cowork 中的工作区和 ${workspaceTaskCount} 个会话记录，不会删除真实文件。`)
    if (!confirmed) return
    setWorkspaceUpdatingId(workspace.id)
    onError(null)
    try {
      await deleteWorkspace(workspace.id)
      const fallbackWorkspaceId = workspaces.find((item) => item.id !== workspace.id)?.id ?? 'default'
      openWorkspace(fallbackWorkspaceId)
      await refreshAppState()
    } catch (cause) {
      onError(errorMessage(cause))
    } finally {
      setWorkspaceUpdatingId(null)
    }
  }

  async function handleUploadFiles(files: File[]) {
    if (!selectedWorkspace) {
      onError('请先选择一个授权工作区。')
      return
    }
    const uploadableFiles = files.filter((file) => file.size >= 0)
    if (!uploadableFiles.length) return
    onError(null)
    setUploadNotice(`正在上传 ${uploadableFiles.length} 个文件到 ${selectedWorkspace.name}...`)
    try {
      for (const file of uploadableFiles) {
        await uploadFile(selectedWorkspace.id, file)
      }
      await refreshAppState()
      await refreshWorkspaceFiles()
      setUploadNotice(`已上传 ${uploadableFiles.length} 个文件到 ${selectedWorkspace.name}`)
    } catch (cause) {
      setUploadNotice(null)
      onError(errorMessage(cause))
    }
  }

  async function handleRevealWorkspace(workspace = selectedWorkspace) {
    if (!workspace) return
    onError(null)
    try {
      await revealWorkspace(workspace.id)
    } catch (cause) {
      onError(errorMessage(cause))
    }
  }

  async function handleRevealWorkspaceFile(file: WorkspaceFile) {
    if (!selectedWorkspace) return
    onError(null)
    try {
      await revealWorkspaceFile(selectedWorkspace.id, file.relativePath)
    } catch (cause) {
      onError(errorMessage(cause))
    }
  }

  async function handleRevealPreviewTarget(target: FilePreviewTarget) {
    onError(null)
    try {
      if (target.source === 'artifact' && target.artifactId) {
        await revealArtifact(target.artifactId)
      } else if (target.workspaceId) {
        await revealWorkspaceFile(target.workspaceId, target.relativePath)
      }
    } catch (cause) {
      onError(errorMessage(cause))
    }
  }

  async function handleOpenPreviewTarget(target: FilePreviewTarget) {
    onError(null)
    try {
      if (target.source === 'artifact' && target.artifactId) {
        await openArtifact(target.artifactId)
      } else if (target.workspaceId) {
        await openWorkspaceFile(target.workspaceId, target.relativePath)
      }
    } catch (cause) {
      onError(errorMessage(cause))
    }
  }

  async function handleRevealArtifact(artifact: Artifact) {
    onError(null)
    try {
      await revealArtifact(artifact.id)
    } catch (cause) {
      onError(errorMessage(cause))
    }
  }

  function handleUsePreviewTarget(target: FilePreviewTarget) {
    const label = target.source === 'artifact' ? '任务产物' : '当前工作区文件'
    const ref = target.relativePath || target.name
    appendPrompt(`请使用${label}「${ref}」作为上下文。`)
    openTaskComposer()
  }

  return {
    workspacePicking,
    workspaceUpdatingId,
    uploadNotice,
    handleAuthorizeWorkspace,
    handleRenameWorkspace,
    handleReauthorizeWorkspace,
    handleRemoveWorkspace,
    handleUploadFiles,
    handleRevealWorkspace,
    handleRevealWorkspaceFile,
    handleRevealPreviewTarget,
    handleOpenPreviewTarget,
    handleRevealArtifact,
    handleUsePreviewTarget
  }
}
