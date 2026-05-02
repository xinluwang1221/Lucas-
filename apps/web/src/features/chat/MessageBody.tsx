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
  role: Message['role']
  content: string
  live?: boolean
  attachments?: MessageAttachment[]
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
  )
}
