import type { AppState, Task } from '../../lib/api'

export function mergeStreamedTask(current: AppState, task: Task): AppState {
  const exists = current.tasks.some((item) => item.id === task.id)
  const tasks = exists
    ? current.tasks.map((item) => (item.id === task.id ? task : item))
    : [task, ...current.tasks]

  const mergedTaskMessages = dedupeByIdAndSort([
    ...current.messages.filter((message) => message.taskId !== task.id),
    ...(task.messages ?? [])
  ])
  const mergedTaskArtifacts = dedupeByIdAndSort([
    ...current.artifacts.filter((artifact) => artifact.taskId !== task.id),
    ...(task.artifacts ?? [])
  ])

  return {
    ...current,
    tasks,
    messages: mergedTaskMessages,
    artifacts: mergedTaskArtifacts
  }
}

function dedupeByIdAndSort<T extends { id: string; createdAt: string }>(items: T[]) {
  const records = new Map<string, T>()
  for (const item of items) {
    records.set(item.id, item)
  }
  return [...records.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}
