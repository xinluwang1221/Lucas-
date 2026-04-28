import { spawn } from 'node:child_process'
import { hermesBin } from './paths.js'

export type HermesRunResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  sessionId?: string
  responseText: string
}

export type RunningProcess = {
  taskId: string
  child: ReturnType<typeof spawn>
}

const sessionPatterns = [
  /Session ID:\s*([a-zA-Z0-9_.:-]+)/i,
  /session[_\s-]?id["']?\s*[:=]\s*["']?([a-zA-Z0-9_.:-]+)/i
]

export function runHermesCli(params: {
  prompt: string
  cwd: string
  resumeSessionId?: string
  maxTurns?: number
  onStdout?: (chunk: string, accumulated: string) => void
  onStderr?: (chunk: string, accumulated: string) => void
  onProcess?: (process: RunningProcess['child']) => void
}): Promise<HermesRunResult> {
  const args = [
    'chat',
    '--quiet',
    '--source',
    'web-frontend',
    '--max-turns',
    String(params.maxTurns ?? 20),
    '-q',
    params.prompt
  ]

  if (params.resumeSessionId) {
    args.splice(1, 0, '--resume', params.resumeSessionId)
  }

  return new Promise((resolve) => {
    const child = spawn(hermesBin, args, {
      cwd: params.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    params.onProcess?.(child)

    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      params.onStdout?.(chunk, stdout)
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      params.onStderr?.(chunk, stderr)
    })
    child.on('close', (exitCode) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode,
        sessionId: extractSessionId(`${stdout}\n${stderr}`),
        responseText: cleanHermesOutput(stdout)
      })
    })
    child.on('error', (error) => {
      resolve({
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        exitCode: 1,
        responseText: cleanHermesOutput(stdout)
      })
    })
  })
}

function extractSessionId(output: string) {
  for (const pattern of sessionPatterns) {
    const match = output.match(pattern)
    if (match?.[1]) return match[1]
  }
  return undefined
}

export function cleanHermesOutput(output: string) {
  const lines = output
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim()
      if (!trimmed) return true
      if (/^session_id:/i.test(trimmed)) return false
      if (/^[╭╰╮╯│─\s⚕Hermes]+$/.test(trimmed)) return false
      return true
    })

  return lines.join('\n').trim()
}
