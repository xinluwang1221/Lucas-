import assert from 'node:assert/strict'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

type ExecutionEvent = {
  type: string
  choice?: string
  command?: string
}

type Task = {
  id: string
  status: string
  liveResponse?: string
  executionView?: { response?: string }
  events?: ExecutionEvent[]
  messages?: Array<{ role: string; content: string }>
}

const rootDir = path.resolve(import.meta.dirname, '../../..')
const tsxBin = path.join(rootDir, 'node_modules', '.bin', 'tsx')

async function main() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-cowork-connection-'))
  const fakeAgentDir = path.join(testDir, 'fake-hermes-agent')
  const dataDir = path.join(testDir, 'data')
  const workspaceDir = path.join(testDir, 'workspace')
  fs.mkdirSync(workspaceDir, { recursive: true })
  writeFakeGateway(fakeAgentDir)

  const port = 19000 + Math.floor(Math.random() * 2000)
  const baseUrl = `http://127.0.0.1:${port}`
  const server = spawn(tsxBin, ['apps/api/src/server.ts'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      HERMES_COWORK_RUNTIME: 'gateway',
      HERMES_COWORK_DATA_DIR: dataDir,
      HERMES_COWORK_WORKSPACE_DIR: workspaceDir,
      HERMES_AGENT_DIR: fakeAgentDir,
      HERMES_PYTHON_BIN: process.env.HERMES_TEST_PYTHON_BIN || '/usr/bin/python3',
      HERMES_BIN: path.join(fakeAgentDir, 'bin', 'hermes')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const output = captureProcessOutput(server)

  try {
    await waitForHealth(baseUrl, output)

    const created = await requestJson<Task>(baseUrl, '/api/tasks', {
      method: 'POST',
      body: {
        workspaceId: 'default',
        prompt: '测试 Hermes 消息连接：请先请求命令审批，再继续返回结果。',
        modelId: 'auto',
        skillNames: []
      }
    })
    assert.equal(created.status, 'running')

    const pending = await waitForTaskFromStream(baseUrl, created.id, (task) =>
      Boolean(task.events?.some((event) => event.type === 'approval.request'))
    )
    assert.equal(pending.status, 'running')
    assert.match(pending.liveResponse ?? pending.executionView?.response ?? '', /收到/)
    const approval = pending.events?.find((event) => event.type === 'approval.request')
    assert.match(String(approval?.command ?? ''), /curl -s/)

    const invalidApproval = await fetch(`${baseUrl}/api/tasks/${created.id}/approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice: 'bad-choice' })
    })
    assert.equal(invalidApproval.status, 400)

    await requestJson(baseUrl, `/api/tasks/${created.id}/approval`, {
      method: 'POST',
      body: { choice: 'once' }
    })

    const completed = await waitForTaskFromStream(baseUrl, created.id, (task) => task.status === 'completed')
    assert.equal(completed.status, 'completed')
    assert.ok(completed.events?.some((event) => event.type === 'approval.resolved' && event.choice === 'once'))
    assert.match(completed.executionView?.response ?? '', /Cowork gateway 测试完成/)
    assert.ok(completed.messages?.some((message) => message.role === 'assistant' && /Cowork gateway 测试完成/.test(message.content)))

    const lateApproval = await fetch(`${baseUrl}/api/tasks/${created.id}/approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice: 'once' })
    })
    assert.equal(lateApproval.status, 409)

    console.log('Hermes message connection test passed')
  } finally {
    server.kill('SIGTERM')
    await waitForProcessExit(server)
    fs.rmSync(testDir, { recursive: true, force: true })
  }
}

function writeFakeGateway(agentDir: string) {
  const gatewayDir = path.join(agentDir, 'tui_gateway')
  fs.mkdirSync(gatewayDir, { recursive: true })
  fs.mkdirSync(path.join(agentDir, 'bin'), { recursive: true })
  fs.writeFileSync(path.join(gatewayDir, '__init__.py'), '', 'utf8')
  fs.writeFileSync(path.join(agentDir, 'bin', 'hermes'), '#!/bin/sh\necho fake hermes\n', { mode: 0o755 })
  fs.writeFileSync(path.join(gatewayDir, 'entry.py'), fakeGatewaySource(), 'utf8')
}

function fakeGatewaySource() {
  return String.raw`
import json
import sys
import threading
import time

SESSION_ID = "gw-test-session"
SESSION_KEY = "fake-hermes-session"
approval_ready = threading.Event()
approval_choice = {"value": ""}

def write(frame):
    sys.stdout.write(json.dumps(frame, ensure_ascii=False) + "\n")
    sys.stdout.flush()

def response(req_id, result=None, error=None):
    frame = {"jsonrpc": "2.0", "id": req_id}
    if error:
        frame["error"] = {"code": -32000, "message": error}
    else:
        frame["result"] = result or {}
    write(frame)

def event(event_type, payload=None, session_id=SESSION_ID):
    write({
        "jsonrpc": "2.0",
        "method": "event",
        "params": {
            "type": event_type,
            "session_id": session_id,
            "payload": payload or {},
        },
    })

def run_turn():
    time.sleep(0.08)
    event("message.delta", {"text": "收到。"})
    time.sleep(0.08)
    event("approval.request", {
        "command": "curl -s https://example.test/package.json",
        "description": "测试命令需要用户确认",
    })
    if not approval_ready.wait(5):
        event("error", {"message": "approval timeout"})
        return
    if approval_choice["value"] == "deny":
        event("message.complete", {"text": "用户拒绝执行命令。", "status": "error"})
        return
    event("tool.start", {"tool_id": "tool-1", "name": "terminal", "context": {"command": "curl -s https://example.test/package.json"}})
    time.sleep(0.04)
    event("tool.complete", {"tool_id": "tool-1", "name": "terminal", "summary": "命令已执行"})
    time.sleep(0.04)
    event("message.delta", {"text": "审批已通过。"})
    time.sleep(0.04)
    event("message.complete", {
        "text": "收到。审批已通过。Cowork gateway 测试完成。",
        "status": "complete",
        "usage": {
            "context_used": 120,
            "context_max": 1000,
            "context_percent": 12,
            "input": 50,
            "output": 20,
            "calls": 1,
        },
    })

event("gateway.ready", {}, None)

for raw in sys.stdin:
    try:
        request = json.loads(raw)
    except Exception:
        continue
    method = request.get("method")
    params = request.get("params") or {}
    req_id = request.get("id")
    if method == "session.create":
        response(req_id, {"session_id": SESSION_ID})
    elif method == "session.resume":
        response(req_id, {"session_id": SESSION_ID, "resumed": SESSION_KEY})
    elif method == "session.title":
        response(req_id, {"session_key": SESSION_KEY})
    elif method == "config.set":
        response(req_id, {"ok": True})
    elif method == "prompt.submit":
        approval_ready.clear()
        approval_choice["value"] = ""
        response(req_id, {"ok": True})
        threading.Thread(target=run_turn, daemon=True).start()
    elif method == "approval.respond":
        approval_choice["value"] = params.get("choice", "")
        response(req_id, {"resolved": True})
        threading.Timer(0.05, approval_ready.set).start()
    elif method in ("session.close", "session.interrupt"):
        response(req_id, {"ok": True})
    else:
        response(req_id, {"ok": True})
`
}

function captureProcessOutput(child: ChildProcessWithoutNullStreams) {
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    stdout = keepTail(`${stdout}${String(chunk)}`)
  })
  child.stderr.on('data', (chunk) => {
    stderr = keepTail(`${stderr}${String(chunk)}`)
  })
  return {
    tail: () => `stdout:\n${stdout}\nstderr:\n${stderr}`
  }
}

function keepTail(value: string, maxLength = 8000) {
  return value.length <= maxLength ? value : value.slice(value.length - maxLength)
}

async function waitForHealth(baseUrl: string, output: { tail: () => string }) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 10_000) {
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await sleep(100)
  }
  throw new Error(`API server did not start.\n${output.tail()}`)
}

async function requestJson<T = unknown>(
  baseUrl: string,
  pathName: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${pathName} failed with ${response.status}: ${text}`)
  }
  return data as T
}

async function waitForTaskFromStream(
  baseUrl: string,
  taskId: string,
  predicate: (task: Task) => boolean,
  timeoutMs = 8000
) {
  const controller = new AbortController()
  const response = await fetch(`${baseUrl}/api/tasks/${taskId}/stream`, { signal: controller.signal })
  assert.ok(response.ok)
  assert.ok(response.body)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const startedAt = Date.now()

  try {
    while (Date.now() - startedAt < timeoutMs) {
      const remaining = timeoutMs - (Date.now() - startedAt)
      const read = await Promise.race([
        reader.read(),
        sleep(Math.max(1, remaining)).then(() => ({ done: true, value: undefined }))
      ])
      if (read.done) break
      buffer += decoder.decode(read.value, { stream: true })

      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const task = parseTaskSseFrame(frame)
        if (task && predicate(task)) return task
        boundary = buffer.indexOf('\n\n')
      }
    }
  } finally {
    controller.abort()
    reader.releaseLock()
  }

  throw new Error(`Timed out waiting for task ${taskId}`)
}

function parseTaskSseFrame(frame: string): Task | null {
  let event = ''
  const data: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice('event:'.length).trim()
    if (line.startsWith('data:')) data.push(line.slice('data:'.length).trim())
  }
  if (event !== 'task' || !data.length) return null
  return JSON.parse(data.join('\n')).task as Task
}

function waitForProcessExit(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null || child.killed) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 3000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
