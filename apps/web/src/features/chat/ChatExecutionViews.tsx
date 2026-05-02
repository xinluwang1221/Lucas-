import { MessageBody } from './MessageBody'
import type { MarkdownFileReference } from '../markdown/MarkdownContent'
import { buildActivityGroupMessageParts, MessagePartList } from './MessageParts'
import type { Artifact, Message, MessageAttachment, Task } from '../../lib/api'

export function FragmentWithTrace({
  message,
  task,
  traceAfterMessageId,
  formatTime,
  artifactCards = [],
  fileReferences = [],
  onOpenAttachment,
  onOpenAttachmentNative,
  onRevealAttachment,
  onUseAttachment,
  onOpenArtifact,
  onOpenArtifactNative,
  onRevealArtifact,
  onUseArtifact,
  onOpenFileReference,
  onOpenFileReferenceNative,
  onRevealFileReference,
  onUseFileReference
}: {
  message: Message
  task: Task | undefined
  traceAfterMessageId?: string
  formatTime: (value: string) => string
  artifactCards?: Artifact[]
  fileReferences?: MarkdownFileReference[]
  onOpenAttachment?: (attachment: MessageAttachment) => void
  onOpenAttachmentNative?: (attachment: MessageAttachment) => void
  onRevealAttachment?: (attachment: MessageAttachment) => void
  onUseAttachment?: (attachment: MessageAttachment) => void
  onOpenArtifact?: (artifact: Artifact) => void
  onOpenArtifactNative?: (artifact: Artifact) => void
  onRevealArtifact?: (artifact: Artifact) => void
  onUseArtifact?: (artifact: Artifact) => void
  onOpenFileReference?: (reference: MarkdownFileReference) => void
  onOpenFileReferenceNative?: (reference: MarkdownFileReference) => void
  onRevealFileReference?: (reference: MarkdownFileReference) => void
  onUseFileReference?: (reference: MarkdownFileReference) => void
}) {
  return (
    <>
      <article className={`message ${message.role}`}>
        <div className="message-meta">
          {message.role === 'user' ? '你' : 'Hermes'}
          <span>{formatTime(message.createdAt)}</span>
        </div>
        <MessageBody
          role={message.role}
          content={message.content}
          attachments={message.attachments}
          artifactCards={message.role === 'assistant' ? artifactCards : []}
          fileReferences={fileReferences}
          onOpenAttachment={onOpenAttachment}
          onOpenAttachmentNative={onOpenAttachmentNative}
          onRevealAttachment={onRevealAttachment}
          onUseAttachment={onUseAttachment}
          onOpenArtifact={onOpenArtifact}
          onOpenArtifactNative={onOpenArtifactNative}
          onRevealArtifact={onRevealArtifact}
          onUseArtifact={onUseArtifact}
          onOpenFileReference={onOpenFileReference}
          onOpenFileReferenceNative={onOpenFileReferenceNative}
          onRevealFileReference={onRevealFileReference}
          onUseFileReference={onUseFileReference}
        />
      </article>
      {task && task.status !== 'running' && message.id === traceAfterMessageId && (
        <MessagePartList parts={buildActivityGroupMessageParts(task)} formatTime={formatTime} />
      )}
    </>
  )
}
