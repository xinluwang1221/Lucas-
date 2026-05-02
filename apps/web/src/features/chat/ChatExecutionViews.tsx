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
  onOpenArtifact,
  onOpenFileReference
}: {
  message: Message
  task: Task | undefined
  traceAfterMessageId?: string
  formatTime: (value: string) => string
  artifactCards?: Artifact[]
  fileReferences?: MarkdownFileReference[]
  onOpenAttachment?: (attachment: MessageAttachment) => void
  onOpenArtifact?: (artifact: Artifact) => void
  onOpenFileReference?: (reference: MarkdownFileReference) => void
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
          onOpenArtifact={onOpenArtifact}
          onOpenFileReference={onOpenFileReference}
        />
      </article>
      {task && task.status !== 'running' && message.id === traceAfterMessageId && (
        <MessagePartList parts={buildActivityGroupMessageParts(task)} formatTime={formatTime} />
      )}
    </>
  )
}
