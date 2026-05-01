import { FileText } from 'lucide-react'
import type { Message } from '../../lib/api'
import { MarkdownContent } from '../markdown/MarkdownContent'

export function MessageBody({
  role,
  content,
  live = false,
  attachments = [],
  onOpenAttachment
}: {
  role: Message['role']
  content: string
  live?: boolean
  attachments?: NonNullable<Message['attachments']>
  onOpenAttachment?: (attachment: NonNullable<Message['attachments']>[number]) => void
}) {
  if (role === 'assistant') {
    return (
      <>
        <div className={live ? 'message-body message-markdown live-output' : 'message-body message-markdown'}>
          <MarkdownContent source={content} emptyText={live ? 'Hermes 正在组织答案...' : ''} />
        </div>
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

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
