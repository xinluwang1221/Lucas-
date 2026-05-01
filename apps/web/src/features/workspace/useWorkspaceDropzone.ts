import { useRef, useState, type DragEvent as ReactDragEvent } from 'react'

function hasDraggedFiles(event: ReactDragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes('Files')
}

export function useWorkspaceDropzone({
  canDropFiles,
  onUploadFiles
}: {
  canDropFiles: boolean
  onUploadFiles: (files: File[]) => void
}) {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const dragDepthRef = useRef(0)

  function handleDragEnter(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDraggingFiles(true)
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = canDropFiles ? 'copy' : 'none'
    setIsDraggingFiles(true)
  }

  function handleDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDraggingFiles(false)
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDraggingFiles(false)
    onUploadFiles(Array.from(event.dataTransfer.files))
  }

  return {
    isDraggingFiles,
    dropzoneHandlers: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop
    }
  }
}
