import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readHermesSessionDetail, readHermesSessions } from '../src/hermes_sessions.js'
import type { AppState } from '../src/types.js'

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-cowork-sessions-'))
  const sessionsDir = path.join(tempRoot, 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })

  fs.writeFileSync(path.join(sessionsDir, 'session_20260503_010203_000001.json'), JSON.stringify({
    session_id: '20260503_010203_000001',
    model: 'mimo-v2.5-pro',
    provider: 'xiaomi',
    platform: 'cli',
    base_url: 'https://api.example.com/v1',
    session_start: '2026-05-03T01:02:03',
    last_updated: '2026-05-03T01:12:03',
    tools: ['skill_view', { name: 'web_search' }],
    messages: [
      {
        role: 'user',
        content: '[Hermes Cowork 工作区提示：如果任务需要多步执行，请先调用 todo 工具。]\n\n帮我整理 Hermes 会话能力'
      },
      {
        role: 'assistant',
        reasoning_content: '先读取 session 文件，再映射 Cowork 任务。',
        content: '已经整理完成。',
        finish_reason: 'stop'
      }
    ]
  }), 'utf8')

  fs.writeFileSync(path.join(sessionsDir, 'session_20260502_000000_000002.json'), JSON.stringify({
    session_id: '20260502_000000_000002',
    model: 'deepseek-v4-pro',
    platform: 'gateway',
    last_updated: '2026-05-02T00:00:00',
    messages: [{ role: 'user', content: '无关任务' }]
  }), 'utf8')

  const state: AppState = {
    workspaces: [{ id: 'workspace_1', name: 'Default Workspace', path: tempRoot, createdAt: '2026-05-03T00:00:00.000Z' }],
    tasks: [{
      id: 'task_1',
      workspaceId: 'workspace_1',
      title: '会话能力梳理',
      status: 'completed',
      prompt: '帮我整理 Hermes 会话能力',
      hermesSessionId: '20260503_010203_000001',
      createdAt: '2026-05-03T00:00:00.000Z',
      updatedAt: '2026-05-03T01:12:03.000Z'
    }],
    messages: [],
    artifacts: [],
    skillSettings: {},
    modelSettings: { selectedModelId: 'mimo-v2.5-pro', customModels: [] }
  }

  try {
    const titleOverrides = new Map([['20260503_010203_000001', 'Hermes 官方标题']])
    const list = readHermesSessions(state, { sessionsDir, titleOverrides })
    assert.equal(list.sessions.length, 2)
    assert.equal(list.total, 2)
    assert.equal(list.sessions[0].id, '20260503_010203_000001')
    assert.equal(list.sessions[0].title, 'Hermes 官方标题')
    assert.equal(list.sessions[0].linkedTaskTitle, '会话能力梳理')
    assert.deepEqual(list.sessions[0].linkedWorkspaceIds, ['workspace_1'])
    assert.deepEqual(list.sessions[0].tools, ['skill_view', 'web_search'])
    assert.equal(list.sessions[0].messageCount, 2)

    const filtered = readHermesSessions(state, { sessionsDir, query: 'xiaomi' })
    assert.equal(filtered.sessions.length, 1)
    assert.equal(filtered.sessions[0].model, 'mimo-v2.5-pro')

    const fullTextFiltered = readHermesSessions(state, { sessionsDir, query: '映射 Cowork' })
    assert.equal(fullTextFiltered.sessions.length, 1)
    assert.equal(fullTextFiltered.sessions[0].id, '20260503_010203_000001')
    assert.equal(fullTextFiltered.sessions[0].searchMatches?.length, 1)
    assert.match(fullTextFiltered.sessions[0].searchMatches?.[0]?.snippet ?? '', /映射 Cowork/)

    const detail = readHermesSessionDetail(state, 'session_20260503_010203_000001.json', { sessionsDir, titleOverrides })
    assert.ok(detail)
    assert.equal(detail.session.title, 'Hermes 官方标题')
    assert.equal(detail.messages.length, 2)
    assert.equal(detail.messages[0].role, 'user')
    assert.equal(detail.messages[0].content, '帮我整理 Hermes 会话能力')
    assert.equal(detail.messages[1].reasoning, '先读取 session 文件，再映射 Cowork 任务。')
    assert.equal(detail.messages[1].finishReason, 'stop')

    const missing = readHermesSessionDetail(state, 'missing', { sessionsDir })
    assert.equal(missing, null)

    console.log('Hermes sessions parser test passed')
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
