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

  function clearDropzone() {
    dragDepthRef.current = 0
    setIsDraggingFiles(false)
  }

  function shouldIgnoreEvent(event: ReactDragEvent<HTMLElement>) {
    const target = event.target
    return target instanceof Element && Boolean(target.closest('.composer'))
  }

  function handleDragEnter(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    if (shouldIgnoreEvent(event)) {
      clearDropzone()
      return
    }
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDraggingFiles(true)
  }

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return
    if (shouldIgnoreEvent(event)) {
      clearDropzone()
      return
    }
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
    if (shouldIgnoreEvent(event)) {
      clearDropzone()
      return
    }
    event.preventDefault()
    clearDropzone()
    onUploadFiles(Array.from(event.dataTransfer.files))
  }

  return {
    isDraggingFiles,
    clearDropzone,
    dropzoneHandlers: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop
    }
  }
}
