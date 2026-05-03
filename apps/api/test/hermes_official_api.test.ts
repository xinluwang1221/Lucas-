import assert from 'node:assert/strict'
import fs from 'node:fs'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'

async function main() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-cowork-official-api-'))
  writeFakeHermesSource(testDir)

  const {
    inspectHermesOfficialApiSource,
    probeHermesOfficialApiServer
  } = await import('../src/hermes_official_api.js')

  const source = inspectHermesOfficialApiSource(testDir)
  const caps = new Map(source.capabilities.map((capability) => [capability.id, capability]))
  assert.equal(caps.get('runs_api')?.available, true)
  assert.equal(caps.get('run_stop')?.available, true)
  assert.equal(caps.get('jobs_api')?.available, true)
  assert.equal(caps.get('dashboard_sessions')?.available, true)
  assert.equal(caps.get('mcp_session_events')?.available, true)

  const requests: Array<{ url: string; authorization?: string }> = []
  const server = http.createServer((req, res) => {
    handleFakeOfficialApi(req, res, requests)
  })
  await listen(server)
  const address = server.address()
  assert.equal(typeof address, 'object')
  assert.ok(address)
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    const noAuth = await probeHermesOfficialApiServer({ baseUrl, timeoutMs: 1000 })
    assert.equal(noAuth.running, true)
    assert.equal(noAuth.authConfigured, false)
    assert.equal(noAuth.checks.find((check) => check.path === '/v1/models')?.status, 401)

    const withAuth = await probeHermesOfficialApiServer({ baseUrl, apiKey: 'sk-test', timeoutMs: 1000 })
    assert.equal(withAuth.running, true)
    assert.equal(withAuth.authConfigured, true)
    assert.deepEqual(withAuth.health, { status: 'ok' })
    assert.deepEqual(withAuth.models, { data: [{ id: 'hermes-agent' }] })
    assert.equal(
      requests.some((request) => request.url === '/v1/models' && request.authorization === 'Bearer sk-test'),
      true
    )

    console.log('Hermes official API adapter test passed')
  } finally {
    await close(server)
    fs.rmSync(testDir, { recursive: true, force: true })
  }
}

function writeFakeHermesSource(agentDir: string) {
  fs.mkdirSync(path.join(agentDir, 'website/docs/user-guide/features'), { recursive: true })
  fs.mkdirSync(path.join(agentDir, 'gateway/platforms'), { recursive: true })
  fs.mkdirSync(path.join(agentDir, 'hermes_cli'), { recursive: true })
  fs.writeFileSync(path.join(agentDir, 'website/docs/user-guide/features/api-server.md'), `
POST /v1/chat/completions
POST /v1/responses
POST /v1/runs
GET /v1/runs/{run_id}/events
POST /v1/runs/{run_id}/stop
GET /api/jobs
previous_response_id conversation_history image_url input_image data:image/
`, 'utf8')
  fs.writeFileSync(path.join(agentDir, 'gateway/platforms/api_server.py'), `
def _handle_chat_completions(): pass
def _handle_responses(): pass
def _handle_runs(): pass
def _handle_run_events(): pass
def _handle_stop_run(): pass
def _handle_create_job(): pass
def _handle_run_job(): pass
class ResponseStore: pass
message.delta tool.started tool.completed reasoning.available
`, 'utf8')
  fs.writeFileSync(path.join(agentDir, 'hermes_cli/web_server.py'), `
@app.get("/api/sessions")
@app.get("/api/sessions/{session_id}/messages")
@app.get("/api/logs")
@app.get("/api/analytics/usage")
@app.get("/api/skills")
@app.get("/api/tools/toolsets")
`, 'utf8')
  fs.writeFileSync(path.join(agentDir, 'mcp_serve.py'), 'events_poll events_wait permissions_respond', 'utf8')
}

function handleFakeOfficialApi(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
  requests: Array<{ url: string; authorization?: string }>
) {
  requests.push({
    url: req.url ?? '',
    authorization: req.headers.authorization
  })
  if (req.url === '/health') {
    sendJson(res, { status: 'ok' })
    return
  }
  if (req.url === '/health/detailed') {
    sendJson(res, { status: 'ok', active_sessions: 1 })
    return
  }
  if (req.url === '/v1/models') {
    if (req.headers.authorization !== 'Bearer sk-test') {
      sendJson(res, { error: 'invalid key' }, 401)
      return
    }
    sendJson(res, { data: [{ id: 'hermes-agent' }] })
    return
  }
  sendJson(res, { error: 'not found' }, 404)
}

function sendJson(res: ServerResponse<IncomingMessage>, body: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function listen(server: http.Server) {
  return new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
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

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
