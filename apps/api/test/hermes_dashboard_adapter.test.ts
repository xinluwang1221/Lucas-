import assert from 'node:assert/strict'
import fs from 'node:fs'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'

type FakeRequest = {
  url: string
  method: string | undefined
  token: string | undefined
  body?: unknown
}

type FakeState = {
  config: {
    model: string
    platform_toolsets: {
      cli: string[]
    }
  }
}

async function main() {
  const requests: FakeRequest[] = []
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-cowork-dashboard-test-'))
  const fakeState: FakeState = {
    config: {
      model: 'mimo-v2.5-pro',
      platform_toolsets: {
        cli: ['hermes-cli', 'custom-mcp']
      }
    }
  }
  const server = http.createServer((req, res) => {
    void handleFakeDashboard(req, res, requests, fakeState)
  })
  await listen(server)
  const address = server.address()
  assert.equal(typeof address, 'object')
  assert.ok(address)
  const baseUrl = `http://127.0.0.1:${address.port}`

  const previousUrl = process.env.HERMES_COWORK_DASHBOARD_URL
  const previousAutostart = process.env.HERMES_COWORK_DASHBOARD_AUTOSTART
  const previousDataDir = process.env.HERMES_COWORK_DATA_DIR
  process.env.HERMES_COWORK_DASHBOARD_URL = baseUrl
  process.env.HERMES_COWORK_DASHBOARD_AUTOSTART = '0'
  process.env.HERMES_COWORK_DATA_DIR = dataDir

  const {
    extractDashboardSessionToken,
    readHermesDashboardAdapterStatus,
    requestHermesDashboardJson,
    resetHermesDashboardAdapterForTest
  } = await import('../src/hermes_dashboard.js')
  const { toggleHermesDashboardToolset } = await import('../src/hermes_toolsets.js')

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
    assert.deepEqual(toolsets.body, fakeToolsets(fakeState.config.platform_toolsets.cli))

    const toggleResult = await toggleHermesDashboardToolset('browser', false)
    const toggledToolset = toggleResult.toolset
    assert.equal(toggledToolset.name, 'browser')
    assert.equal(toggledToolset.enabled, false)
    assert.ok(fs.existsSync(toggleResult.backupPath))
    assert.deepEqual(fakeState.config.platform_toolsets.cli, ['custom-mcp', 'terminal'])
    const configUpdate = requests.find((request) => request.url === '/api/config' && request.method === 'PUT')
    assert.ok(configUpdate)
    assert.equal(configUpdate.token, 'fake-token')

    console.log('Hermes dashboard adapter test passed')
  } finally {
    process.env.HERMES_COWORK_DASHBOARD_URL = previousUrl
    process.env.HERMES_COWORK_DASHBOARD_AUTOSTART = previousAutostart
    process.env.HERMES_COWORK_DATA_DIR = previousDataDir
    await resetHermesDashboardAdapterForTest()
    await close(server)
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
}

async function handleFakeDashboard(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
  requests: FakeRequest[],
  fakeState: FakeState
) {
  const body = await readJsonBody(req)
  requests.push({
    url: req.url ?? '',
    method: req.method,
    token: req.headers['x-hermes-session-token'] as string | undefined,
    body
  })

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
    sendJson(res, fakeToolsets(fakeState.config.platform_toolsets.cli))
    return
  }
  if (req.url === '/api/config' && req.method === 'GET') {
    sendJson(res, fakeState.config)
    return
  }
  if (req.url === '/api/config' && req.method === 'PUT') {
    if (isRecord(body) && isRecord(body.config) && isRecord(body.config.platform_toolsets)) {
      const cli = body.config.platform_toolsets.cli
      if (Array.isArray(cli)) {
        fakeState.config.platform_toolsets.cli = cli.map((item) => String(item))
      }
    }
    sendJson(res, { ok: true })
    return
  }
  sendJson(res, { detail: 'not found' }, 404)
}

function fakeToolsets(cliEntries: string[]) {
  const hasComposite = cliEntries.includes('hermes-cli')
  const enabled = new Set(cliEntries)
  return [
    {
      name: 'browser',
      label: 'Browser',
      description: 'Browser automation',
      enabled: hasComposite || enabled.has('browser'),
      available: hasComposite || enabled.has('browser'),
      configured: true,
      tools: ['browser_navigate']
    },
    {
      name: 'terminal',
      label: 'Terminal',
      description: 'Terminal commands',
      enabled: hasComposite || enabled.has('terminal'),
      available: hasComposite || enabled.has('terminal'),
      configured: true,
      tools: ['terminal_run']
    }
  ]
}

function readJsonBody(req: IncomingMessage) {
  return new Promise<unknown>((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (!text) {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(text))
      } catch {
        resolve(text)
      }
    })
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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
