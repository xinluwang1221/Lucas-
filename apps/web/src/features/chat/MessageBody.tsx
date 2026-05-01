import type { Message } from '../../lib/api'
import { MarkdownContent } from '../markdown/MarkdownContent'

export function MessageBody({ role, content, live = false }: { role: Message['role']; content: string; live?: boolean }) {
  if (role === 'assistant') {
    return (
      <div className={live ? 'message-body message-markdown live-output' : 'message-body message-markdown'}>
        <MarkdownContent source={content} emptyText={live ? 'Hermes 正在组织答案...' : ''} />
      </div>
    )
  }
  return <div className="message-body">{content}</div>
}
