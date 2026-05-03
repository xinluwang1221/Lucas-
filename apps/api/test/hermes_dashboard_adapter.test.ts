import assert from 'node:assert/strict'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'

async function main() {
  const requests: Array<{ url: string; token: string | undefined }> = []
  const server = http.createServer((req, res) => handleFakeDashboard(req, res, requests))
  await listen(server)
  const address = server.address()
  assert.equal(typeof address, 'object')
  assert.ok(address)
  const baseUrl = `http://127.0.0.1:${address.port}`

  const previousUrl = process.env.HERMES_COWORK_DASHBOARD_URL
  const previousAutostart = process.env.HERMES_COWORK_DASHBOARD_AUTOSTART
  process.env.HERMES_COWORK_DASHBOARD_URL = baseUrl
  process.env.HERMES_COWORK_DASHBOARD_AUTOSTART = '0'

  const {
    extractDashboardSessionToken,
    readHermesDashboardAdapterStatus,
    requestHermesDashboardJson,
    resetHermesDashboardAdapterForTest
  } = await import('../src/hermes_dashboard.js')

  try {
    assert.equal(
      extractDashboardSessionToken('<script>window.__HERMES_SESSION_TOKEN__="fake-token";</script>'),
      'fake-token'
    )

    const status = await readHermesDashboardAdapterStatus()
    assert.equal(status.available, true)
    assert.equal(status.protectedApiReady, true)
    assert.equal(status.version, '0.11.0')
    assert.equal(status.configVersion, 16)
    assert.equal(status.latestConfigVersion, 22)
    assert.equal(status.gatewayState, 'running')
    assert.equal(status.activeSessions, 2)

    const skills = await requestHermesDashboardJson('/api/skills')
    assert.equal(skills.status, 200)
    assert.deepEqual(skills.body, {
      skills: [
        { name: 'documents', enabled: true },
        { name: 'spreadsheets', enabled: false }
      ]
    })
    const skillsRequest = requests.find((request) => request.url === '/api/skills')
    assert.equal(skillsRequest?.token, 'fake-token')

    const toolsets = await requestHermesDashboardJson('/api/tools/toolsets')
    assert.equal(toolsets.ok, true)
    assert.deepEqual(toolsets.body, { toolsets: [{ name: 'browser', enabled: true }] })

    console.log('Hermes dashboard adapter test passed')
  } finally {
    process.env.HERMES_COWORK_DASHBOARD_URL = previousUrl
    process.env.HERMES_COWORK_DASHBOARD_AUTOSTART = previousAutostart
    await resetHermesDashboardAdapterForTest()
    await close(server)
  }
}

function handleFakeDashboard(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
  requests: Array<{ url: string; token: string | undefined }>
) {
  requests.push({ url: req.url ?? '', token: req.headers['x-hermes-session-token'] as string | undefined })
  if (req.url === '/') {
    sendHtml(res, '<html><head><script>window.__HERMES_SESSION_TOKEN__="fake-token";</script></head></html>')
    return
  }
  if (req.url === '/api/status') {
    sendJson(res, {
      version: '0.11.0',
      release_date: '2026.4.23',
      config_version: 16,
      latest_config_version: 22,
      gateway_running: true,
      gateway_state: 'running',
      active_sessions: 2
    })
    return
  }
  if (req.headers['x-hermes-session-token'] !== 'fake-token') {
    sendJson(res, { detail: 'Unauthorized' }, 401)
    return
  }
  if (req.url === '/api/skills') {
    sendJson(res, {
      skills: [
        { name: 'documents', enabled: true },
        { name: 'spreadsheets', enabled: false }
      ]
    })
    return
  }
  if (req.url === '/api/tools/toolsets') {
    sendJson(res, { toolsets: [{ name: 'browser', enabled: true }] })
    return
  }
  sendJson(res, { detail: 'not found' }, 404)
}

function sendJson(res: ServerResponse<IncomingMessage>, body: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function sendHtml(res: ServerResponse<IncomingMessage>, body: string, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html' })
  res.end(body)
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
