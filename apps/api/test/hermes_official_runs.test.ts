import assert from 'node:assert/strict'
import http from 'node:http'
import {
  normalizeOfficialRunEvent,
  officialRunsCoverage,
  parseOfficialRunsSseChunk,
  runHermesOfficialRunsTask,
  stopHermesOfficialRun
} from '../src/hermes_official_runs.js'

async function main() {
  const serverState = {
    startHeaders: {} as Record<string, string | string[] | undefined>,
    stopHeaders: {} as Record<string, string | string[] | undefined>,
    startBody: undefined as unknown,
    stopped: false
  }
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/v1/runs') {
      serverState.startHeaders = req.headers
      serverState.startBody = JSON.parse(await readRequest(req))
      res.writeHead(202, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ run_id: 'run_test_1', status: 'started' }))
      return
    }
    if (req.method === 'GET' && req.url === '/v1/runs/run_test_1/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache'
      })
      res.write(sse({ event: 'message.delta', run_id: 'run_test_1', delta: '你好，' }))
      res.write(sse({ event: 'reasoning.available', run_id: 'run_test_1', text: '正在整理计划' }))
      res.write(sse({ event: 'tool.started', run_id: 'run_test_1', tool: 'web_search', preview: '查询 Hermes Runs API' }))
      await sleep(15)
      res.write(sse({ event: 'tool.completed', run_id: 'run_test_1', tool: 'web_search', duration: 0.42, error: false }))
      res.write(sse({
        event: 'run.completed',
        run_id: 'run_test_1',
        output: '你好，Runs API smoke 完成。',
        usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 }
      }))
      res.end(': stream closed\n\n')
      return
    }
    if (req.method === 'POST' && req.url === '/v1/runs/run_test_1/stop') {
      serverState.stopHeaders = req.headers
      serverState.stopped = true
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ run_id: 'run_test_1', status: 'stopping' }))
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })

  try {
    const baseUrl = await listen(server)
    const events: Array<{ type: string; [key: string]: unknown }> = []
    const result = await runHermesOfficialRunsTask({
      taskId: 'task_1',
      prompt: '验证 Runs API',
      cwd: '/tmp/workspace',
      resumeSessionId: 'session_1',
      conversationHistory: [{ role: 'user', content: '上一轮问题' }],
      model: 'mimo-v2.5-pro',
      provider: 'xiaomi',
      instructions: '只用一句中文回答。',
      baseUrl,
      apiKey: 'test-key',
      timeoutMs: 1000,
      onEvent: (event) => events.push(event)
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.sessionId, 'session_1')
    assert.equal(result.stdout, '你好，')
    assert.equal(result.finalResponse, '你好，Runs API smoke 完成。')
    assert.equal(serverState.startHeaders.authorization, 'Bearer test-key')
    assert.deepEqual(serverState.startBody, {
      input: '验证 Runs API',
      session_id: 'session_1',
      conversation_history: [{ role: 'user', content: '上一轮问题' }],
      instructions: '只用一句中文回答。',
      model: 'mimo-v2.5-pro',
      provider: 'xiaomi',
      cwd: '/tmp/workspace',
      workdir: '/tmp/workspace'
    })
    assert.ok(events.some((event) => event.type === 'message.delta' && event.text === '你好，'))
    assert.ok(events.some((event) => event.type === 'status' && event.kind === 'reasoning'))
    assert.ok(events.some((event) => event.type === 'tool.started' && event.name === 'web_search'))
    assert.ok(events.some((event) => event.type === 'tool.completed' && event.name === 'web_search'))
    assert.ok(events.some((event) => event.type === 'context.updated'))
    assert.ok(events.some((event) => event.type === 'task.completed' && event.finalResponse === '你好，Runs API smoke 完成。'))

    await stopHermesOfficialRun({ baseUrl, runId: 'run_test_1', apiKey: 'test-key', timeoutMs: 1000 })
    assert.equal(serverState.stopped, true)
    assert.equal(serverState.stopHeaders.authorization, 'Bearer test-key')

    const parsed = parseOfficialRunsSseChunk('event: message.delta\ndata: {"event":"message.delta","delta":"OK"}\n')
    assert.equal(parsed?.delta, 'OK')
    assert.deepEqual(normalizeOfficialRunEvent({ event: 'run.failed', run_id: 'run_bad', error: 'boom' })[0], {
      type: 'task.failed',
      error: 'boom',
      sessionId: 'run_bad',
      runtime: 'official-runs-api',
      runId: 'run_bad',
      rawEvent: 'run.failed'
    })

    const coverage = officialRunsCoverage()
    assert.equal(coverage.canCreateRun, true)
    assert.equal(coverage.canBindWorkspace, false)
    assert.equal(coverage.canApproveCommands, false)
    assert.equal(coverage.canClarify, false)
    assert.ok(coverage.gaps.some((gap) => gap.includes('workdir')))

    console.log('Hermes official Runs API adapter test passed')
  } finally {
    await closeServer(server)
  }
}

function sse(value: unknown) {
  return `data: ${JSON.stringify(value)}\n\n`
}

function readRequest(req: http.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function listen(server: http.Server) {
  return new Promise<string>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('No test server address')
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}

function closeServer(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
