import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hermesAgentDir, hermesPythonBin } from './paths.js'

const eventPrefix = 'HC_EVENT\t'

export type HermesBridgeEvent = {
  type: string
  [key: string]: unknown
}

export type HermesBridgeResult = {
  exitCode: number | null
  finalResponse: string
  error?: string
  sessionId?: string
  stdout: string
  stderr: string
  events: HermesBridgeEvent[]
}

export function runHermesPythonBridge(params: {
  taskId: string
  prompt: string
  cwd: string
  resumeSessionId?: string
  maxTurns?: number
  model?: string
  provider?: string
  skills?: string[]
  enabledSkills?: string[]
  onEvent?: (event: HermesBridgeEvent) => void
  onStdout?: (chunk: string, accumulated: string) => void
  onStderr?: (chunk: string, accumulated: string) => void
  onProcess?: (process: ReturnType<typeof spawn>) => void
}): Promise<HermesBridgeResult> {
  const bridgePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'hermes_bridge.py')
  const args = [
    bridgePath,
    '--prompt',
    params.prompt,
    '--cwd',
    params.cwd,
    '--task-id',
    params.taskId,
    '--max-turns',
    String(params.maxTurns ?? 20)
  ]

  if (params.resumeSessionId) {
    args.push('--session-id', params.resumeSessionId)
  }
  if (params.model) {
    args.push('--model', params.model)
  }
  if (params.provider) {
    args.push('--provider', params.provider)
  }
  if (params.skills?.length) {
    args.push('--skills', params.skills.join(','))
  }
  if (params.enabledSkills?.length) {
    args.push('--enabled-skills', params.enabledSkills.join(','))
  }

  return new Promise((resolve) => {
    const child = spawn(hermesPythonBin, args, {
      cwd: hermesAgentDir,
      env: {
        ...process.env,
        HERMES_AGENT_DIR: hermesAgentDir,
        PYTHONUNBUFFERED: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    params.onProcess?.(child)

    let stdout = ''
    let stderr = ''
    let lineBuffer = ''
    let finalResponse = ''
    let bridgeError = ''
    let sessionId = params.resumeSessionId
    const events: HermesBridgeEvent[] = []

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    child.stdout.on('data', (chunk) => {
      stdout += chunk
      params.onStdout?.(chunk, stdout)
      lineBuffer += chunk
      const lines = lineBuffer.split(/\n/)
      lineBuffer = lines.pop() ?? ''
      for (const line of lines) {
        handleLine(line)
      }
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk
      params.onStderr?.(chunk, stderr)
    })

    child.on('close', (exitCode) => {
      if (lineBuffer) handleLine(lineBuffer)
      resolve({
        exitCode,
        finalResponse,
        error: bridgeError,
        sessionId,
        stdout,
        stderr,
        events
      })
    })

    child.on('error', (error) => {
      stderr += `\n${error.message}`
      resolve({
        exitCode: 1,
        finalResponse,
        error: bridgeError,
        sessionId,
        stdout,
        stderr,
        events
      })
    })

    function handleLine(line: string) {
      if (!line.startsWith(eventPrefix)) return
      try {
        const event = JSON.parse(line.slice(eventPrefix.length)) as HermesBridgeEvent
        events.push(event)
        if (event.type === 'task.completed') {
          finalResponse = typeof event.finalResponse === 'string' ? event.finalResponse : finalResponse
          sessionId = typeof event.sessionId === 'string' ? event.sessionId : sessionId
        }
        if (event.type === 'task.failed') {
          finalResponse = typeof event.finalResponse === 'string' ? event.finalResponse : finalResponse
          sessionId = typeof event.sessionId === 'string' ? event.sessionId : sessionId
          bridgeError = typeof event.error === 'string' ? event.error : bridgeError
        }
        params.onEvent?.(event)
      } catch {
        // Ignore malformed bridge lines; raw output remains available.
      }
    }
  })
}
