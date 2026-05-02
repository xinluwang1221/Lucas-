import { FileArchive, FileText } from 'lucide-react'
import type { Artifact, Message } from '../../lib/api'
import { MarkdownContent, type MarkdownFileReference } from '../markdown/MarkdownContent'

export function MessageBody({
  role,
  content,
  live = false,
  attachments = [],
  artifactCards = [],
  fileReferences = [],
  onOpenAttachment,
  onOpenArtifact,
  onOpenFileReference
}: {
  role: Message['role']
  content: string
  live?: boolean
  attachments?: NonNullable<Message['attachments']>
  artifactCards?: Artifact[]
  fileReferences?: MarkdownFileReference[]
  onOpenAttachment?: (attachment: NonNullable<Message['attachments']>[number]) => void
  onOpenArtifact?: (artifact: Artifact) => void
  onOpenFileReference?: (reference: MarkdownFileReference) => void
}) {
  if (role === 'assistant') {
    return (
      <>
        <div className={live ? 'message-body message-markdown live-output' : 'message-body message-markdown'}>
          <MarkdownContent
            source={content}
            emptyText={live ? 'Hermes 正在组织答案...' : ''}
            fileReferences={fileReferences}
            onOpenFileReference={onOpenFileReference}
          />
        </div>
        <MessageArtifactList artifacts={artifactCards} onOpenArtifact={onOpenArtifact} />
        <MessageAttachmentList attachments={attachments} onOpenAttachment={onOpenAttachment} />
      </>
    )
  }
  return (
    <>
      <div className="message-body">{content}</div>
      <MessageAttachmentList attachments={attachments} onOpenAttachment={onOpenAttachment} />
    </>
  )
}

export function MessageAttachmentList({
  attachments,
  onOpenAttachment
}: {
  attachments?: NonNullable<Message['attachments']>
  onOpenAttachment?: (attachment: NonNullable<Message['attachments']>[number]) => void
}) {
  if (!attachments?.length) return null
  return (
    <div className="message-attachment-list" aria-label="消息附件">
      {attachments.map((attachment) => (
        <button
          type="button"
          key={attachment.id}
          title={`打开附件：${attachment.relativePath}`}
          onClick={() => onOpenAttachment?.(attachment)}
        >
          <FileText size={14} />
          <span>{attachment.name}</span>
          <em>{formatBytes(attachment.size)}</em>
        </button>
      ))}
    </div>
  )
}

export function MessageArtifactList({
  artifacts,
  onOpenArtifact
}: {
  artifacts?: Artifact[]
  onOpenArtifact?: (artifact: Artifact) => void
}) {
  if (!artifacts?.length) return null
  return (
    <div className="message-attachment-list message-output-file-list" aria-label="Hermes 输出文件">
      {artifacts.map((artifact) => (
        <button
          type="button"
          key={artifact.id}
          title={`打开输出文件：${artifact.relativePath}`}
          onClick={() => onOpenArtifact?.(artifact)}
        >
          <FileArchive size={14} />
          <span>{artifact.name}</span>
          <em>{formatBytes(artifact.size)}</em>
        </button>
      ))}
    </div>
  )
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
