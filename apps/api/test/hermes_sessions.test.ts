import assert from 'node:assert/strict'
import fs from 'node:fs'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { resetHermesDashboardAdapterForTest } from '../src/hermes_dashboard.js'
import { normalizeHermesSessionId, readHermesSessionDetail, readHermesSessionDetailWithOfficial, readHermesSessions, readHermesSessionsWithOfficial } from '../src/hermes_sessions.js'
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
    assert.equal(normalizeHermesSessionId('session_20260503_010203_000001.json'), '20260503_010203_000001')
    assert.equal(normalizeHermesSessionId('20260503_010203_000001.json'), '20260503_010203_000001')

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
    assert.equal(fullTextFiltered.sessions[0].searchMatches?.[0]?.source, 'local-transcript')
    assert.match(fullTextFiltered.sessions[0].searchMatches?.[0]?.snippet ?? '', /映射 Cowork/)
    assert.deepEqual(fullTextFiltered.search?.sources, [{
      id: 'local-transcript',
      label: '本地 transcript',
      status: 'searched',
      matched: 1
    }])

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

    const fakeDashboard = http.createServer(handleFakeDashboard)
    await listen(fakeDashboard)
    const address = fakeDashboard.address()
    assert.equal(typeof address, 'object')
    assert.ok(address)
    const previousDashboardUrl = process.env.HERMES_COWORK_DASHBOARD_URL
    const previousDashboardAutostart = process.env.HERMES_COWORK_DASHBOARD_AUTOSTART
    process.env.HERMES_COWORK_DASHBOARD_URL = `http://127.0.0.1:${address.port}`
    process.env.HERMES_COWORK_DASHBOARD_AUTOSTART = '0'

    try {
      const dashboardList = await readHermesSessionsWithOfficial(state, { sessionsDir, titleOverrides, limit: 10 })
      const mergedSession = dashboardList.sessions.find((session) => session.id === '20260503_010203_000001')
      assert.ok(mergedSession)
      assert.equal(mergedSession.dataSource, 'merged')
      assert.equal(mergedSession.title, 'Hermes 官方标题')
      assert.equal(mergedSession.platform, 'cli')
      assert.equal(mergedSession.toolCallCount, 3)
      assert.equal(mergedSession.inputTokens, 1200)
      assert.equal(mergedSession.outputTokens, 300)
      assert.equal(mergedSession.isActive, true)
      assert.equal(mergedSession.lineageRootId, 'root_20260503_010203_000000')

      const officialSearch = await readHermesSessionsWithOfficial(state, { sessionsDir, query: '官方全文', limit: 10 })
      assert.equal(officialSearch.sessions.length, 1)
      assert.equal(officialSearch.sessions[0].id, '20260503_010203_000001')
      assert.match(officialSearch.sessions[0].searchMatches?.[0]?.snippet ?? '', /官方全文命中/)
      assert.equal(officialSearch.sessions[0].searchMatches?.[0]?.source, 'official-dashboard')
      assert.deepEqual(officialSearch.search?.sources, [
        {
          id: 'local-transcript',
          label: '本地 transcript',
          status: 'searched',
          matched: 0
        },
        {
          id: 'official-dashboard',
          label: 'Hermes 官方全文索引',
          status: 'searched',
          matched: 1
        }
      ])

      const officialDetail = await readHermesSessionDetailWithOfficial(state, '20260503_010203_000001', { sessionsDir, titleOverrides })
      assert.ok(officialDetail)
      assert.equal(officialDetail.session.dataSource, 'merged')
      assert.equal(officialDetail.messages.length, 2)
      assert.equal(officialDetail.messages[0].content, '官方用户消息')
      assert.equal(officialDetail.messages[1].reasoning, '官方推理')
    } finally {
      process.env.HERMES_COWORK_DASHBOARD_URL = previousDashboardUrl
      process.env.HERMES_COWORK_DASHBOARD_AUTOSTART = previousDashboardAutostart
      await resetHermesDashboardAdapterForTest()
      await close(fakeDashboard)
    }

    console.log('Hermes sessions parser test passed')
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

async function handleFakeDashboard(req: IncomingMessage, res: ServerResponse<IncomingMessage>) {
  if (req.url === '/') {
    sendHtml(res, '<html><head><script>window.__HERMES_SESSION_TOKEN__="fake-token";</script></head></html>')
    return
  }
  if (req.url === '/api/status') {
    sendJson(res, { version: '0.11.0' })
    return
  }
  if (req.headers['x-hermes-session-token'] !== 'fake-token') {
    sendJson(res, { detail: 'Unauthorized' }, 401)
    return
  }
  if (req.url?.startsWith('/api/sessions?')) {
    sendJson(res, {
      sessions: [fakeDashboardSession()],
      total: 1,
      limit: 20,
      offset: 0
    })
    return
  }
  if (req.url?.startsWith('/api/sessions/search?')) {
    sendJson(res, {
      results: [{
        session_id: '20260503_010203_000001',
        snippet: '这里是 Hermes 官方全文命中片段',
        role: 'assistant',
        source: 'cli',
        model: 'mimo-v2.5-pro'
      }]
    })
    return
  }
  if (req.url === '/api/sessions/20260503_010203_000001') {
    sendJson(res, fakeDashboardSession())
    return
  }
  if (req.url === '/api/sessions/20260503_010203_000001/messages') {
    sendJson(res, {
      session_id: '20260503_010203_000001',
      messages: [
        { id: 1, role: 'user', content: '官方用户消息', timestamp: 1777760524 },
        { id: 2, role: 'assistant', content: '官方助手消息', reasoning_content: '官方推理', finish_reason: 'stop', timestamp: 1777760525 }
      ]
    })
    return
  }
  sendJson(res, { detail: 'not found' }, 404)
}

function fakeDashboardSession() {
  return {
    id: '20260503_010203_000001',
    source: 'cli',
    model: 'mimo-v2.5-pro',
    title: 'Hermes 官方 Dashboard 标题',
    started_at: 1777760523,
    last_active: 1777761123,
    ended_at: null,
    end_reason: null,
    message_count: 2,
    tool_call_count: 3,
    total_input_tokens: 1200,
    total_output_tokens: 300,
    preview: '官方 Dashboard preview',
    is_active: true,
    _lineage_root_id: 'root_20260503_010203_000000'
  }
}

function listen(server: http.Server) {
  return new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
}

function close(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function sendJson(res: ServerResponse<IncomingMessage>, body: unknown, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function sendHtml(res: ServerResponse<IncomingMessage>, body: string, status = 200) {
  res.writeHead(status, { 'content-type': 'text/html' })
  res.end(body)
}
