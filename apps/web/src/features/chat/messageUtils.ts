import type { Message, Task } from '../../lib/api'

export function latestUserMessageId(task?: Task) {
  return task?.messages.slice().reverse().find((message) => message.role === 'user')?.id
}

export function latestAssistantMessageId(task?: Task) {
  return task?.messages.slice().reverse().find((message) => message.role === 'assistant')?.id
}

export function visibleTaskMessages(task: Task) {
  if (task.status === 'running') return task.messages
  const latestUserMessage = task.messages.slice().reverse().find((message) => message.role === 'user')
  if (latestUserMessage) {
    const latestUserIndex = task.messages.findIndex((message) => message.id === latestUserMessage.id)
    return task.messages.slice(Math.max(0, latestUserIndex))
  }
  if (task.messages.length <= 4) return task.messages
  return task.messages.slice(-4)
}

export function hiddenTaskMessages(task: Task, visibleMessages: Message[]) {
  if (task.status === 'running') return []
  const visibleIds = new Set(visibleMessages.map((message) => message.id))
  return task.messages.filter((message) => !visibleIds.has(message.id))
}

export function taskResultText(task: Task) {
  const assistantMessage = task.messages.slice().reverse().find((message) => message.role === 'assistant')
  return task.executionView?.response || assistantMessage?.content || task.stdout || ''
}
