import type { Artifact, Message, MessageAttachment } from '../../lib/api'
import type { MarkdownFileReference } from '../markdown/MarkdownContent'
import { buildMessageParts, MessagePartList } from './MessageParts'

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
  attachments?: MessageAttachment[]
  artifactCards?: Artifact[]
  fileReferences?: MarkdownFileReference[]
  onOpenAttachment?: (attachment: MessageAttachment) => void
  onOpenArtifact?: (artifact: Artifact) => void
  onOpenFileReference?: (reference: MarkdownFileReference) => void
}) {
  const parts = buildMessageParts({
    role,
    content,
    live,
    attachments,
    artifactCards,
    fileReferences
  })

  return (
    <MessagePartList
      parts={parts}
      fileReferences={fileReferences}
      onOpenAttachment={onOpenAttachment}
      onOpenArtifact={onOpenArtifact}
      onOpenFileReference={onOpenFileReference}
    />
  )
}
