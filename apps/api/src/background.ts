import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { dataDir, rootDir } from './paths.js'
import { BackgroundServiceStatus } from './types.js'

const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents')
const logsDir = path.join(dataDir, 'logs')
const apiLabel = 'com.hermes-cowork.api'
const dailyLabel = 'com.hermes-cowork.daily-mcp-ai'
const apiPlistPath = path.join(launchAgentsDir, `${apiLabel}.plist`)
const dailyPlistPath = path.join(launchAgentsDir, `${dailyLabel}.plist`)

export function getBackgroundServiceStatus(): BackgroundServiceStatus {
  return {
    api: {
      installed: fs.existsSync(apiPlistPath),
      loaded: isLaunchAgentLoaded(apiLabel),
      plistPath: apiPlistPath
    },
    dailyMcp: {
      installed: fs.existsSync(dailyPlistPath),
      loaded: isLaunchAgentLoaded(dailyLabel),
      plistPath: dailyPlistPath
    },
    logsDir
  }
}

export function installBackgroundServices(): BackgroundServiceStatus {
  fs.mkdirSync(launchAgentsDir, { recursive: true })
  fs.mkdirSync(logsDir, { recursive: true })
  fs.writeFileSync(apiPlistPath, buildApiPlist(), 'utf8')
  fs.writeFileSync(dailyPlistPath, buildDailyMcpPlist(), 'utf8')
  loadLaunchAgent(apiPlistPath)
  loadLaunchAgent(dailyPlistPath)
  return getBackgroundServiceStatus()
}

export function uninstallBackgroundServices(): BackgroundServiceStatus {
  unloadLaunchAgent(apiPlistPath)
  unloadLaunchAgent(dailyPlistPath)
  if (fs.existsSync(apiPlistPath)) fs.unlinkSync(apiPlistPath)
  if (fs.existsSync(dailyPlistPath)) fs.unlinkSync(dailyPlistPath)
  return getBackgroundServiceStatus()
}

function buildApiPlist() {
  return plist(apiLabel, {
    runAtLoad: true,
    keepAlive: true,
    command: `cd ${shellQuote(rootDir)} && /usr/bin/env npm run background:api`,
    stdout: path.join(logsDir, 'background-api.out.log'),
    stderr: path.join(logsDir, 'background-api.err.log')
  })
}

function buildDailyMcpPlist() {
  return plist(dailyLabel, {
    runAtLoad: false,
    keepAlive: false,
    hour: 0,
    minute: 10,
    command: `cd ${shellQuote(rootDir)} && /usr/bin/env npm run mcp:recommend:ai`,
    stdout: path.join(logsDir, 'daily-mcp-ai.out.log'),
    stderr: path.join(logsDir, 'daily-mcp-ai.err.log')
  })
}

function plist(label: string, options: {
  runAtLoad: boolean
  keepAlive: boolean
  command: string
  stdout: string
  stderr: string
  hour?: number
  minute?: number
}) {
  const calendar = typeof options.hour === 'number' && typeof options.minute === 'number'
    ? `
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${options.hour}</integer>
    <key>Minute</key>
    <integer>${options.minute}</integer>
  </dict>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>${escapeXml(options.command)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(rootDir)}</string>
  <key>RunAtLoad</key>
  <${options.runAtLoad ? 'true' : 'false'}/>
  <key>KeepAlive</key>
  <${options.keepAlive ? 'true' : 'false'}/>
  ${calendar}
  <key>StandardOutPath</key>
  <string>${escapeXml(options.stdout)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(options.stderr)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${escapeXml(path.join(os.homedir(), '.local', 'bin'))}</string>
  </dict>
</dict>
</plist>
`
}

function loadLaunchAgent(plistPath: string) {
  try {
    execFileSync('launchctl', ['unload', plistPath], { stdio: 'ignore' })
  } catch {
    // It is fine if the agent was not loaded yet.
  }
  execFileSync('launchctl', ['load', plistPath], { stdio: 'ignore' })
}

function unloadLaunchAgent(plistPath: string) {
  try {
    execFileSync('launchctl', ['unload', plistPath], { stdio: 'ignore' })
  } catch {
    // It is fine if the agent is already unloaded.
  }
}

function isLaunchAgentLoaded(label: string) {
  try {
    const output = execFileSync('launchctl', ['list'], { encoding: 'utf8' })
    return output.includes(label)
  } catch {
    return false
  }
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
