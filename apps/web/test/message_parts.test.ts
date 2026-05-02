import assert from 'node:assert/strict'
import { buildApprovalMessageParts, buildMessageParts } from '../src/features/chat/MessageParts'
import type { Task } from '../src/lib/api'

const fileListReply = [
  '能看到，你发来了 3 个文件：',
  '',
  '| # | 文件名 | 类型 |',
  '|---|--------|------|',
  '| 1 | `brief.pptx` | PPT 演示文稿 |',
  '| 2 | `data.xlsx` | Excel 表格 |',
  '| 3 | `screen.png` | 截图 |',
  '',
  '都在工作区里，我随时可以读取分析。'
].join('\n')

const fileParts = buildMessageParts({
  role: 'assistant',
  content: fileListReply,
  fileReferences: [
    { id: 'brief', name: 'brief.pptx', relativePath: 'brief.pptx', type: 'pptx' },
    { id: 'data', name: 'data.xlsx', relativePath: 'data.xlsx', type: 'xlsx' },
    { id: 'screen', name: 'screen.png', relativePath: 'screen.png', type: 'png' }
  ]
})

const assistantText = fileParts.find((part) => part.type === 'assistant_text')
assert.ok(assistantText)
assert.doesNotMatch(assistantText.source, /文件名/)
assert.match(assistantText.source, /能看到/)
assert.match(assistantText.source, /都在工作区/)

const fileCards = fileParts.find((part) => part.type === 'file_cards' && part.variant === 'references')
assert.ok(fileCards)
assert.deepEqual(
  fileCards.references.map((reference) => reference.name),
  ['brief.pptx', 'data.xlsx', 'screen.png']
)

const dataTableReply = [
  '下面是数据对比：',
  '',
  '| 指标 | 本周 | 上周 |',
  '|---|---:|---:|',
  '| 线索 | 120 | 96 |',
  '| 转化率 | 18% | 15% |'
].join('\n')

const dataParts = buildMessageParts({
  role: 'assistant',
  content: dataTableReply
})

assert.equal(dataParts.length, 1)
const dataText = dataParts[0]
assert.equal(dataText.type, 'assistant_text')
assert.match(dataText.source, /指标/)
assert.match(dataText.source, /转化率/)

const now = new Date().toISOString()
const approvalTask: Task = {
  id: 'task-approval',
  workspaceId: 'workspace',
  title: '审批测试',
  status: 'running',
  prompt: '运行命令',
  createdAt: now,
  updatedAt: now,
  messages: [],
  artifacts: [],
  events: [
    {
      id: 'approval-1',
      type: 'approval.request',
      createdAt: now,
      command: 'curl https://example.com',
      description: '请求访问外部地址'
    }
  ]
}

const approvalParts = buildApprovalMessageParts(approvalTask, true)
assert.equal(approvalParts.length, 1)
const approvalPart = approvalParts[0]
assert.equal(approvalPart.type, 'approval_card')
if (approvalPart.type !== 'approval_card') throw new Error('Expected approval card part')
assert.equal(approvalPart.busy, true)

const resolvedApprovalParts = buildApprovalMessageParts({
  ...approvalTask,
  events: [
    ...approvalTask.events!,
    { id: 'approval-resolved', type: 'approval.resolved', createdAt: now, choice: 'once' }
  ]
})
assert.equal(resolvedApprovalParts.length, 0)

console.log('Message parts test passed')
