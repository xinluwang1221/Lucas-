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
assert.equal(toolOnlySteps.length, 0)
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

const operationalTodoTask = taskWithEvents('completed', [
  {
    id: 'operational-todo',
    type: 'tool.completed',
    createdAt: now,
    name: 'todo',
    summary: '更新执行清单',
    todos: [
      { id: '1', content: '读取文件', status: 'completed' },
      { id: '2', content: '调用工具：MCP 调用', status: 'completed' },
      { id: '3', content: '调用工具：命令执行', status: 'completed' },
      { id: '4', content: '检索资料', status: 'completed' },
      { id: '5', content: '调用工具：工具调用', status: 'completed' },
      { id: '6', content: '读取文件', status: 'completed' },
      { id: '7', content: '调用工具：工具调用', status: 'completed' },
      { id: '8', content: '整理结果', status: 'completed' }
    ]
  }
])

const operationalSteps = taskStepItems(operationalTodoTask)
assert.equal(operationalSteps.length, 0)

const emptyProgress = taskProgressSummary(operationalTodoTask)
assert.equal(emptyProgress.currentLabel, '暂无任务拆解')
assert.equal(emptyProgress.totalCount, 0)

console.log('Task decomposition test passed')
