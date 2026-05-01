import assert from 'node:assert/strict'
import fs from 'node:fs'
import { runHermesGatewayTask, shutdownHermesGateways } from '../src/hermes_gateway.js'
import { defaultWorkspacePath } from '../src/paths.js'

const timeoutMs = Number(process.env.HERMES_REAL_SMOKE_TIMEOUT_MS || 120_000)
const expected = process.env.HERMES_REAL_SMOKE_EXPECTED || 'COWORK_REAL_GATEWAY_OK'
const prompt = process.env.HERMES_REAL_SMOKE_PROMPT || `请只回复 ${expected}，不要解释。`
const workspacePath = process.env.HERMES_REAL_SMOKE_WORKSPACE || defaultWorkspacePath

async function main() {
  fs.mkdirSync(workspacePath, { recursive: true })

  const events: Array<{ type: string; summary?: unknown; text?: unknown }> = []
  const task = runHermesGatewayTask({
    taskId: `real-smoke-${Date.now()}`,
    prompt,
    cwd: workspacePath,
    model: process.env.HERMES_REAL_SMOKE_MODEL || undefined,
    provider: process.env.HERMES_REAL_SMOKE_PROVIDER || undefined,
    onEvent: (event) => {
      events.push({
        type: event.type,
        summary: event.summary,
        text: event.text
      })
    }
  })

  const timeout = sleep(timeoutMs).then(() => {
    throw new Error(`Real Hermes gateway smoke timed out after ${timeoutMs}ms`)
  })

  try {
    const result = await Promise.race([task, timeout])
    assert.equal(result.exitCode, 0, result.error || result.stderr || 'Hermes gateway smoke failed')
    assert.match(result.finalResponse || result.stdout, new RegExp(expected))
    console.log(JSON.stringify({
      exitCode: result.exitCode,
      sessionId: result.sessionId,
      finalResponse: result.finalResponse,
      eventCount: events.length,
      eventTypes: [...new Set(events.map((event) => event.type))]
    }, null, 2))
  } finally {
    await Promise.race([shutdownHermesGateways(), sleep(4000)])
    await task.catch(() => undefined)
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

void main().then(() => {
  process.exit(0)
}).catch((error) => {
  console.error(error)
  process.exit(1)
})
