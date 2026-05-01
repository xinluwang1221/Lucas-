import assert from 'node:assert/strict'
import { taskProgressSummary, taskStepItems } from '../src/features/chat/executionTraceModel'
import type { ExecutionEvent, Task } from '../src/lib/api'

const now = new Date().toISOString()

function taskWithEvents(status: Task['status'], events: ExecutionEvent[]): Task {
  return {
    id: `task-${status}`,
    workspaceId: 'default',
    title: '测试任务拆解',
    status,
    prompt: '请调研 Hermes 的 MCP 能力并形成后续开发建议。',
    events,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    messages: [],
    artifacts: []
  }
}

const toolOnlyTask = taskWithEvents('running', [
  {
    id: 'tool-start',
    type: 'tool.started',
    createdAt: now,
    name: 'mimo-web-search',
    summary: '搜索 Hermes MCP 文档'
  },
  {
    id: 'tool-done',
    type: 'tool.completed',
    createdAt: now,
    name: 'mimo-web-search',
    summary: '搜索完成',
    result: '找到 3 个网页'
  }
])

const toolOnlySteps = taskStepItems(toolOnlyTask)
assert.equal(toolOnlySteps.length, 1)
assert.equal(toolOnlySteps[0].label, '等待 Hermes 规划')
assert.doesNotMatch(toolOnlySteps.map((step) => step.label).join('\n'), /工具|搜索|读取/)

const todoTask = taskWithEvents('running', [
  {
    id: 'todo-done',
    type: 'tool.completed',
    createdAt: now,
    name: 'todo',
    summary: '规划 3 个步骤',
    todos: [
      { id: '1', content: '确认用户目标与约束', status: 'completed' },
      { id: '2', content: '调研 Hermes MCP 能力', status: 'in_progress' },
      { id: '3', content: '整理开发建议', status: 'pending' }
    ]
  }
])

const todoSteps = taskStepItems(todoTask)
assert.deepEqual(
  todoSteps.map((step) => [step.label, step.status]),
  [
    ['确认用户目标与约束', 'done'],
    ['调研 Hermes MCP 能力', 'running'],
    ['整理开发建议', 'pending']
  ]
)

const progress = taskProgressSummary(todoTask)
assert.equal(progress.doneCount, 1)
assert.equal(progress.totalCount, 3)
assert.equal(progress.currentLabel, '调研 Hermes MCP 能力')

console.log('Task decomposition test passed')
