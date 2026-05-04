import fs from 'node:fs'
import path from 'node:path'
import { execFile, execFileSync, spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { dataDir, hermesAgentDir, hermesBin } from './paths.js'
import {
  HermesMcpConfig,
  HermesMcpInstallResult,
  HermesMcpLoginResult,
  HermesMcpManualConfigRequest,
  HermesMcpNativeCapabilities,
  HermesMcpNativeCommand,
  HermesMcpServer,
  HermesMcpServeLogEntry,
  HermesMcpServeStatus,
  HermesMcpTestResult,
  HermesMcpToolSelectionRequest,
  HermesMcpToolSelectionResult,
  HermesMcpUpdateResult
} from './types.js'

const hermesConfigPath = '/Users/lucas/.hermes/config.yaml'
const serveCommand = [hermesBin, 'mcp', 'serve', '-v']
let mcpServeProcess: ChildProcessWithoutNullStreams | null = null
let mcpServeStartedAt: string | undefined
let mcpServeStoppedAt: string | undefined
let mcpServeExitCode: number | null | undefined
let mcpServeSignal: string | null | undefined
const mcpServeLogs: HermesMcpServeLogEntry[] = []

type RawMcpServer = {
  command?: string
  args: string[]
  url?: string
  auth?: string
  headerKeys: string[]
  envKeys: string[]
  enabled?: boolean
  includeTools?: string[]
  excludeTools?: string[]
}

export function readHermesMcpConfig(): HermesMcpConfig {
  const raw = fs.readFileSync(hermesConfigPath, 'utf8')
  const servers = parseMcpServers(raw)
  return {
    configPath: hermesConfigPath,
    servers,
    updatedAt: new Date().toISOString()
  }
}

export function readHermesMcpNativeCapabilities(): HermesMcpNativeCapabilities {
  const config = readHermesMcpConfig()
  const generalHelp = readHermesMcpHelp(['mcp', '--help'])
  const addHelp = readHermesMcpHelp(['mcp', 'add', '--help'])
  const configureHelp = readHermesMcpHelp(['mcp', 'configure', '--help'])
  const loginHelp = readHermesMcpHelp(['mcp', 'login', '--help'])
  const serveHelp = readHermesMcpHelp(['mcp', 'serve', '--help'])
  const presets = readMcpPresetNames()
  const generalText = generalHelp.text

  const commands: HermesMcpNativeCommand[] = [
    {
      id: 'add',
      label: '添加服务',
      description: '支持 stdio command、HTTP/SSE URL、OAuth/Header、env 和 preset。',
      available: generalHelp.ok && hasMcpCommand(generalText, 'add') && /--command/.test(addHelp.text) && /--url/.test(addHelp.text),
      evidence: mcpEvidence('hermes mcp add --help', addHelp, ['--command', '--url', '--auth', '--preset']),
      coworkStatus: 'covered',
      coworkEntry: '技能页 MCP 添加表单、设置页 MCP 本地服务'
    },
    {
      id: 'list',
      label: '读取服务',
      description: '读取当前 Hermes MCP 服务配置和启用状态。',
      available: generalHelp.ok && (hasMcpCommand(generalText, 'list') || hasMcpCommand(generalText, 'ls')),
      evidence: mcpEvidence('hermes mcp --help', generalHelp, ['list', 'ls']),
      coworkStatus: 'covered',
      coworkEntry: '技能页 MCP 服务列表'
    },
    {
      id: 'test',
      label: '连接测试',
      description: '测试单个 MCP 服务连接，并读取可发现的工具。',
      available: generalHelp.ok && hasMcpCommand(generalText, 'test'),
      evidence: mcpEvidence('hermes mcp --help', generalHelp, ['test']),
      coworkStatus: 'covered',
      coworkEntry: '设置页 MCP 服务测试'
    },
    {
      id: 'configure',
      label: '服务配置',
      description: '进入 Hermes 原生配置流程，适合补全 OAuth、Header 或服务参数。',
      available: generalHelp.ok && hasMcpCommand(generalText, 'configure') && configureHelp.ok,
      evidence: mcpEvidence('hermes mcp configure --help', configureHelp, ['name']),
      coworkStatus: 'partial',
      coworkEntry: 'Cowork 已支持编辑配置和工具范围，尚未包装原生命令交互'
    },
    {
      id: 'login',
      label: 'OAuth 登录',
      description: '对支持 OAuth 的 MCP 服务重新登录或刷新授权。',
      available: generalHelp.ok && hasMcpCommand(generalText, 'login') && loginHelp.ok,
      evidence: mcpEvidence('hermes mcp login --help', loginHelp, ['name']),
      coworkStatus: 'covered',
      coworkEntry: '设置页 OAuth MCP 重新授权按钮'
    },
    {
      id: 'serve',
      label: 'Hermes Server',
      description: '把 Hermes 自身作为 MCP Server 暴露给其他客户端。',
      available: generalHelp.ok && hasMcpCommand(generalText, 'serve') && /--accept-hooks/.test(serveHelp.text),
      evidence: mcpEvidence('hermes mcp serve --help', serveHelp, ['--accept-hooks']),
      coworkStatus: 'covered',
      coworkEntry: '设置页 Hermes Server 启停'
    },
    {
      id: 'remove',
      label: '删除服务',
      description: '从 Hermes MCP 配置中移除服务。',
      available: generalHelp.ok && (hasMcpCommand(generalText, 'remove') || hasMcpCommand(generalText, 'rm')),
      evidence: mcpEvidence('hermes mcp --help', generalHelp, ['remove', 'rm']),
      coworkStatus: 'covered',
      coworkEntry: '设置页 MCP 删除'
    }
  ]

  const notes = [
    presets.length
      ? `当前固定 Hermes 内核包含 ${presets.length} 个 preset：${presets.slice(0, 6).join('、')}${presets.length > 6 ? '…' : ''}。`
      : '当前固定 Hermes 内核暴露 --preset 参数，但 preset registry 为空；Cowork 不再维护自建 MCP 市场。',
    commands.some((command) => command.id === 'login' && command.available)
      ? 'Hermes MCP OAuth login 已接入设置页；只有 auth=oauth 的 HTTP/SSE 服务会显示重新授权按钮。'
      : '未检测到可用的 MCP OAuth login 命令。',
    `${config.servers.length} 个 MCP 服务来自 ${config.configPath}，启停、工具范围和删除会写回 Hermes 配置。`
  ]

  return {
    hermesBin,
    configPath: config.configPath,
    serverCount: config.servers.length,
    enabledServerCount: config.servers.filter((server) => server.enabled).length,
    presetCount: presets.length,
    presets,
    commands,
    notes,
    updatedAt: new Date().toISOString()
  }
}

export function loginHermesMcpServer(serverId: string): Promise<HermesMcpLoginResult> {
  const safeServerId = normalizeServerId(serverId)
  if (!safeServerId) {
    return Promise.reject(new Error('MCP 服务名称不合法'))
  }

  const server = readHermesMcpConfig().servers.find((item) => item.id === safeServerId)
  if (!server) {
    return Promise.reject(new Error(`MCP 服务不存在：${safeServerId}`))
  }
  if (!server.url || server.auth !== 'oauth') {
    return Promise.reject(new Error('该 MCP 服务不是 OAuth 认证的 HTTP/SSE 服务，不能执行重新授权。'))
  }

  const started = Date.now()
  return new Promise((resolve) => {
    execFile(hermesBin, ['mcp', 'login', safeServerId], { cwd: hermesAgentDir, timeout: 180000 }, (error, stdout, stderr) => {
      const elapsedMs = Date.now() - started
      const output = redactSecrets(stripAnsi(`${stdout}\n${stderr}`.trim()))
      const failedByOutput = /authentication failed|not configured for oauth|has no url|not found in config/i.test(output)
      const ok = !error && !failedByOutput && /authenticated/i.test(output)
      resolve({
        serverId: safeServerId,
        ok,
        elapsedMs,
        output,
        error: ok ? undefined : redactSecrets(stripAnsi(`${error?.message ?? ''}\n${stderr}`.trim())) || output || 'Hermes MCP OAuth 登录失败',
        config: readHermesMcpConfig(),
        loggedInAt: new Date().toISOString()
      })
    })
  })
}

export function setHermesMcpServerEnabled(serverId: string, enabled: boolean): HermesMcpConfig {
  const safeServerId = normalizeServerId(serverId)
  if (!safeServerId) {
    throw new Error('invalid server id')
  }

  const raw = fs.readFileSync(hermesConfigPath, 'utf8')
  const lines = raw.replace(/\r/g, '').split('\n')
  const range = findServerRange(lines, safeServerId)
  if (!range) {
    throw new Error(`mcp server not found: ${safeServerId}`)
  }

  const nextLines = [...lines]
  const enabledLineIndex = findEnabledLine(nextLines, range.start + 1, range.end)
  const nextEnabledLine = `    enabled: ${enabled ? 'true' : 'false'}`

  if (enabledLineIndex >= 0) {
    nextLines[enabledLineIndex] = nextEnabledLine
  } else {
    nextLines.splice(range.start + 1, 0, nextEnabledLine)
  }

  backupHermesConfig(raw)
  fs.writeFileSync(hermesConfigPath, nextLines.join('\n'), 'utf8')
  return readHermesMcpConfig()
}

export function configureHermesMcpServer(request: HermesMcpManualConfigRequest): Promise<HermesMcpInstallResult> {
  const installName = normalizeServerId(request.name)
  const transport = request.transport
  const command = normalizeCommandName(request.command ?? '')
  const url = normalizeMcpUrl(request.url ?? '')
  const args = normalizeCommandArgs(request.args ?? [])
  const env = normalizeEnvEntries(request.env ?? [])
  const auth = normalizeMcpAuth(request.auth)
  const authHeaderName = normalizeHeaderName(request.authHeaderName ?? '')
  const authHeaderValue = normalizeHeaderValue(request.authHeaderValue ?? '')
  const preset = normalizePresetName(request.preset ?? '')

  if (!installName) {
    return Promise.reject(new Error('MCP 服务名称不合法'))
  }
  if (readHermesMcpConfig().servers.some((server) => server.id === installName)) {
    return Promise.reject(new Error(`MCP 服务已存在：${installName}`))
  }

  if (preset) {
    const installArgs = ['mcp', 'add', installName, '--preset', preset]
    return runHermesMcpAdd(installName, `preset:${preset}`, [], installArgs)
  }

  if (transport === 'stdio') {
    if (!command) return Promise.reject(new Error('stdio MCP 需要填写启动命令'))
    const installArgs = ['mcp', 'add', installName, '--command', command]
    if (args.length) installArgs.push('--args', ...args)
    if (env.length) installArgs.push('--env', ...env)
    return runHermesMcpAdd(installName, command, args, installArgs)
  } else {
    if (!url) return Promise.reject(new Error('HTTP/SSE MCP 需要填写有效 URL'))
    if (auth === 'header' && (!authHeaderName || !authHeaderValue)) {
      return Promise.reject(new Error('Header 认证需要填写 Header 名称和值，建议使用 Bearer ${ENV_KEY} 形式'))
    }
    if (auth === 'none') {
      return runHermesMcpAdd(installName, url, [], ['mcp', 'add', installName, '--url', url])
    }
    return createHermesMcpServerDirectly({
      name: installName,
      transport,
      command: '',
      args: [],
      url,
      enabled: true,
      env: [],
      auth,
      authHeaderName,
      authHeaderValue,
      preservedEnv: [],
      preservedHeaders: [],
      preservedAuth: [],
      preservedTools: []
    })
  }
}

export function removeHermesMcpServer(serverId: string): Promise<HermesMcpConfig> {
  const safeServerId = normalizeServerId(serverId)
  if (!safeServerId) {
    return Promise.reject(new Error('MCP 服务名称不合法'))
  }
  if (!readHermesMcpConfig().servers.some((server) => server.id === safeServerId)) {
    return Promise.reject(new Error(`MCP 服务不存在：${safeServerId}`))
  }

  const raw = fs.readFileSync(hermesConfigPath, 'utf8')
  backupHermesConfig(raw)
  return new Promise((resolve, reject) => {
    execFile(hermesBin, ['mcp', 'remove', safeServerId], { cwd: hermesAgentDir, timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(redactSecrets(stripAnsi(`${error.message}\n${stderr}`.trim())) || 'Hermes MCP 删除失败'))
        return
      }
      resolve(readHermesMcpConfig())
    })
  })
}

export async function updateHermesMcpServer(serverId: string, request: HermesMcpManualConfigRequest): Promise<HermesMcpUpdateResult> {
  const safeServerId = normalizeServerId(serverId)
  const transport = request.transport
  const command = normalizeCommandName(request.command ?? '')
  const url = normalizeMcpUrl(request.url ?? '')
  const args = normalizeCommandArgs(request.args ?? [])
  const env = normalizeEnvEntries(request.env ?? [])
  const auth = normalizeMcpAuth(request.auth)
  const authHeaderName = normalizeHeaderName(request.authHeaderName ?? '')
  const authHeaderValue = normalizeHeaderValue(request.authHeaderValue ?? '')

  if (!safeServerId) throw new Error('MCP 服务名称不合法')
  if (transport === 'stdio' && !command) throw new Error('stdio MCP 需要填写启动命令')
  if (transport !== 'stdio' && !url) throw new Error('HTTP/SSE MCP 需要填写有效 URL')
  if (transport !== 'stdio' && auth === 'header' && !authHeaderValue) {
    const existingHasHeader = readHermesMcpConfig().servers.find((server) => server.id === safeServerId)?.auth === 'header'
    if (!existingHasHeader) throw new Error('Header 认证需要填写 Header 值，建议使用 Bearer ${ENV_KEY} 形式')
  }

  const raw = fs.readFileSync(hermesConfigPath, 'utf8')
  const lines = raw.replace(/\r/g, '').split('\n')
  const range = findServerRange(lines, safeServerId)
  if (!range) throw new Error(`MCP 服务不存在：${safeServerId}`)

  const existing = parseMcpServers(raw).find((server) => server.id === safeServerId)
  const preservedEnabled = existing?.enabled ?? true
  const preservedTools = extractYamlFieldBlock(lines, range, 'tools')
  const preservedEnv = extractYamlFieldBlock(lines, range, 'env')
  const preservedHeaders = extractYamlFieldBlock(lines, range, 'headers')
  const preservedAuth = extractYamlFieldBlock(lines, range, 'auth')
  const nextBlock = buildMcpServerBlock({
    name: safeServerId,
    transport,
    command,
    args,
    url,
    enabled: preservedEnabled,
    env,
    auth,
    authHeaderName,
    authHeaderValue,
    preservedEnv,
    preservedHeaders,
    preservedAuth,
    preservedTools
  })
  const backupPath = backupHermesConfig(raw)
  const nextLines = [...lines.slice(0, range.start), ...nextBlock, ...lines.slice(range.end)]
  fs.writeFileSync(hermesConfigPath, nextLines.join('\n'), 'utf8')
  const config = readHermesMcpConfig()
  const testResult = await testHermesMcpServer(safeServerId)
  return {
    ok: true,
    serverId: safeServerId,
    config,
    testResult,
    backupPath,
    updatedAt: new Date().toISOString()
  }
}

function runHermesMcpAdd(
  installName: string,
  command: string,
  args: string[],
  installArgs: string[]
): Promise<HermesMcpInstallResult> {
  const raw = fs.readFileSync(hermesConfigPath, 'utf8')
  const backupPath = backupHermesConfig(raw)

  return new Promise((resolve, reject) => {
    execFile(hermesBin, installArgs, { cwd: hermesAgentDir, timeout: 120000 }, async (error, stdout, stderr) => {
      const output = redactSecrets(stripAnsi(`${stdout}\n${stderr}`.trim()))
      if (error) {
        reject(new Error(redactSecrets(stripAnsi(`${error.message}\n${stderr}`.trim())) || 'Hermes MCP 安装失败'))
        return
      }

      const config = readHermesMcpConfig()
      if (!config.servers.some((server) => server.id === installName)) {
        reject(new Error('Hermes 命令已完成，但配置中没有发现新增 MCP 服务'))
        return
      }

      const testResult = await testHermesMcpServer(installName)
      resolve({
        ok: true,
        installName,
        command,
        args,
        output,
        backupPath,
        config,
        testResult,
        installedAt: new Date().toISOString()
      })
    })
  })
}

async function createHermesMcpServerDirectly(options: {
  name: string
  transport: HermesMcpManualConfigRequest['transport']
  command: string
  args: string[]
  url: string
  enabled: boolean
  env: string[]
  auth: 'none' | 'oauth' | 'header'
  authHeaderName: string
  authHeaderValue: string
  preservedEnv: string[]
  preservedHeaders: string[]
  preservedAuth: string[]
  preservedTools: string[]
}): Promise<HermesMcpInstallResult> {
  const raw = fs.readFileSync(hermesConfigPath, 'utf8')
  const block = buildMcpServerBlock(options)
  const backupPath = backupHermesConfig(raw)
  const nextRaw = appendMcpServerBlock(raw, block)
  fs.writeFileSync(hermesConfigPath, nextRaw, 'utf8')
  const config = readHermesMcpConfig()
  const testResult = await testHermesMcpServer(options.name)
  return {
    ok: true,
    installName: options.name,
    command: options.command || options.url,
    args: options.args,
    output: '已写入 Hermes MCP 配置。',
    backupPath,
    config,
    testResult,
    installedAt: new Date().toISOString()
  }
}

function parseMcpServers(raw: string): HermesMcpServer[] {
  const lines = raw.replace(/\r/g, '').split('\n')
  const startIndex = lines.findIndex((line) => line.trim() === 'mcp_servers:')
  if (startIndex === -1) return []

  const rawServers = new Map<string, RawMcpServer>()
  let currentName = ''
  let currentField = ''

  for (const line of lines.slice(startIndex + 1)) {
    if (/^\S/.test(line)) break
    if (!line.trim()) continue

    const serverMatch = line.match(/^ {2}([^:\s][^:]*):\s*$/)
    if (serverMatch) {
      currentName = serverMatch[1].trim()
      currentField = ''
      rawServers.set(currentName, { args: [], headerKeys: [], envKeys: [] })
      continue
    }

    if (!currentName) continue
    const server = rawServers.get(currentName)
    if (!server) continue

    const fieldMatch = line.match(/^ {4}([A-Za-z0-9_-]+):\s*(.*)$/)
    if (fieldMatch) {
      currentField = fieldMatch[1]
      const value = unquoteYamlScalar(fieldMatch[2] ?? '')
      if (currentField === 'command') server.command = value
      if (currentField === 'url') server.url = value
      if (currentField === 'auth') server.auth = value
      if (currentField === 'enabled') server.enabled = !['false', '0', 'no'].includes(value.toLowerCase())
      if (currentField === 'args' && value.startsWith('[') && value.endsWith(']')) {
        server.args = value
          .slice(1, -1)
          .split(',')
          .map((item) => unquoteYamlScalar(item))
          .filter(Boolean)
      }
      continue
    }

    const listMatch = line.match(/^ {4}-\s*(.*)$/)
    if (listMatch && currentField === 'args') {
      server.args.push(unquoteYamlScalar(listMatch[1] ?? ''))
      continue
    }

    const envMatch = line.match(/^ {6}([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/)
    if (envMatch && currentField === 'env') {
      server.envKeys.push(envMatch[1])
      continue
    }

    const headerMatch = line.match(/^ {6}([^:\s][^:]*):\s*(.*)$/)
    if (headerMatch && currentField === 'headers') {
      server.headerKeys.push(headerMatch[1].trim())
      continue
    }

    const toolListMatch = line.match(/^ {8}-\s*(.*)$/)
    if (toolListMatch && currentField === 'tools.include') {
      server.includeTools = [...(server.includeTools ?? []), unquoteYamlScalar(toolListMatch[1] ?? '')]
      continue
    }
    if (toolListMatch && currentField === 'tools.exclude') {
      server.excludeTools = [...(server.excludeTools ?? []), unquoteYamlScalar(toolListMatch[1] ?? '')]
      continue
    }

    const toolFieldMatch = line.match(/^ {6}(include|exclude):\s*(.*)$/)
    if (toolFieldMatch && currentField === 'tools') {
      currentField = `tools.${toolFieldMatch[1]}`
      const value = unquoteYamlScalar(toolFieldMatch[2] ?? '')
      if (value.startsWith('[') && value.endsWith(']')) {
        const tools = value
          .slice(1, -1)
          .split(',')
          .map((item) => unquoteYamlScalar(item))
          .filter(Boolean)
        if (toolFieldMatch[1] === 'include') server.includeTools = tools
        if (toolFieldMatch[1] === 'exclude') server.excludeTools = tools
      }
    }
  }

  return [...rawServers.entries()].map(([name, server]) => normalizeMcpServer(name, server))
}

function normalizeMcpServer(name: string, server: RawMcpServer): HermesMcpServer {
  const issues: string[] = []
  const transport = server.url ? inferUrlTransport(server.url) : server.command ? 'stdio' : 'unknown'
  const metadata = inferMcpMetadata(name, server)

  if (!server.command && !server.url) {
    issues.push('缺少 command 或 url')
  }
  if (server.command && !server.command.trim()) {
    issues.push('command 为空')
  }
  if (server.url && !/^https?:\/\//.test(server.url)) {
    issues.push('url 格式可能不正确')
  }

  return {
    id: name,
    name,
    description: metadata.description,
    iconUrl: metadata.iconUrl,
    transport,
    command: server.command,
    args: server.args.filter(Boolean),
    url: server.url,
    auth: normalizeParsedMcpAuth(server),
    headerKeys: [...new Set(server.headerKeys)],
    envKeys: [...new Set(server.envKeys)],
    hasSecrets: server.envKeys.length > 0 || server.headerKeys.length > 0,
    enabled: server.enabled ?? true,
    toolMode: summarizeToolMode(server),
    includeTools: server.includeTools ?? [],
    excludeTools: server.excludeTools ?? [],
    status: issues.length ? 'incomplete' : 'configured',
    issues
  }
}

function normalizeParsedMcpAuth(server: RawMcpServer): HermesMcpServer['auth'] {
  const auth = (server.auth ?? '').trim().toLowerCase()
  if (auth === 'oauth') return 'oauth'
  if (auth === 'header') return 'header'
  if (auth === 'none' || auth === '') return server.headerKeys.length ? 'header' : 'none'
  return 'unknown'
}

export function setHermesMcpServerTools(serverId: string, request: HermesMcpToolSelectionRequest): HermesMcpToolSelectionResult {
  const safeServerId = normalizeServerId(serverId)
  const mode = request.mode
  const tools = normalizeToolNames(request.tools)
  if (!safeServerId) throw new Error('MCP 服务名称不合法')
  if (!['all', 'include', 'exclude'].includes(mode)) throw new Error('工具范围模式不合法')
  if (mode !== 'all' && tools.length === 0) throw new Error('至少选择一个工具，或切换为全部工具')

  const raw = fs.readFileSync(hermesConfigPath, 'utf8')
  const lines = raw.replace(/\r/g, '').split('\n')
  const range = findServerRange(lines, safeServerId)
  if (!range) throw new Error(`MCP 服务不存在：${safeServerId}`)

  const toolsRange = findYamlFieldRange(lines, range, 'tools')
  const nextToolsBlock = buildMcpToolsBlock(mode, tools)
  const backupPath = backupHermesConfig(raw)
  const nextLines = toolsRange
    ? [...lines.slice(0, toolsRange.start), ...nextToolsBlock, ...lines.slice(toolsRange.end)]
    : [...lines.slice(0, range.end), ...nextToolsBlock, ...lines.slice(range.end)]
  fs.writeFileSync(hermesConfigPath, nextLines.join('\n'), 'utf8')

  return {
    ok: true,
    serverId: safeServerId,
    mode,
    tools,
    config: readHermesMcpConfig(),
    backupPath,
    updatedAt: new Date().toISOString()
  }
}

export function getHermesMcpServeStatus(): HermesMcpServeStatus {
  return {
    running: Boolean(mcpServeProcess),
    pid: mcpServeProcess?.pid,
    command: serveCommand,
    cwd: hermesAgentDir,
    startedAt: mcpServeStartedAt,
    stoppedAt: mcpServeStoppedAt,
    exitCode: mcpServeExitCode,
    signal: mcpServeSignal,
    logs: [...mcpServeLogs],
    updatedAt: new Date().toISOString()
  }
}

export function startHermesMcpServe(): HermesMcpServeStatus {
  if (mcpServeProcess) return getHermesMcpServeStatus()

  mcpServeStartedAt = new Date().toISOString()
  mcpServeStoppedAt = undefined
  mcpServeExitCode = undefined
  mcpServeSignal = undefined
  appendMcpServeLog('system', `启动 ${serveCommand.join(' ')}`)

  const child = spawn(hermesBin, ['mcp', 'serve', '-v'], {
    cwd: hermesAgentDir,
    env: process.env,
    stdio: 'pipe'
  })
  mcpServeProcess = child

  child.stdout.on('data', (chunk) => appendMcpServeLog('stdout', String(chunk)))
  child.stderr.on('data', (chunk) => appendMcpServeLog('stderr', String(chunk)))
  child.on('error', (error) => {
    appendMcpServeLog('system', `启动失败：${error.message}`)
    if (mcpServeProcess === child) {
      mcpServeProcess = null
      mcpServeStoppedAt = new Date().toISOString()
    }
  })
  child.on('exit', (code, signal) => {
    appendMcpServeLog('system', `进程已退出${typeof code === 'number' ? `，代码 ${code}` : ''}${signal ? `，信号 ${signal}` : ''}`)
    if (mcpServeProcess === child) mcpServeProcess = null
    mcpServeStoppedAt = new Date().toISOString()
    mcpServeExitCode = code
    mcpServeSignal = signal
  })

  return getHermesMcpServeStatus()
}

export function stopHermesMcpServe(): HermesMcpServeStatus {
  if (!mcpServeProcess) return getHermesMcpServeStatus()
  appendMcpServeLog('system', '请求停止 hermes mcp serve')
  mcpServeProcess.kill('SIGTERM')
  return getHermesMcpServeStatus()
}

export function testHermesMcpServer(serverId: string): Promise<HermesMcpTestResult> {
  const safeServerId = normalizeServerId(serverId)
  if (!safeServerId) {
    return Promise.resolve({
      serverId,
      ok: false,
      elapsedMs: 0,
      output: '',
      error: 'invalid server id',
      testedAt: new Date().toISOString()
    })
  }

  const started = Date.now()
  return new Promise((resolve) => {
    execFile(hermesBin, ['mcp', 'test', safeServerId], { cwd: hermesAgentDir, timeout: 45000 }, (error, stdout, stderr) => {
      const elapsedMs = Date.now() - started
      const output = redactSecrets(stripAnsi(`${stdout}\n${stderr}`.trim()))
      const toolCount = parseToolCount(output)
      const tools = parseToolList(output)
      resolve({
        serverId: safeServerId,
        ok: !error && /Connected/i.test(output),
        elapsedMs,
        toolCount,
        tools,
        output,
        error: error ? redactSecrets(stripAnsi(`${error.message}\n${stderr}`.trim())) : undefined,
        testedAt: new Date().toISOString()
      })
    })
  })
}

function normalizeServerId(serverId: string) {
  const safeServerId = serverId.trim()
  return /^[A-Za-z0-9._-]{1,120}$/.test(safeServerId) ? safeServerId : ''
}

function readHermesMcpHelp(args: string[]) {
  try {
    const output = execFileSync(hermesBin, args, {
      cwd: hermesAgentDir,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return { ok: true, text: redactSecrets(stripAnsi(output)) }
  } catch (error) {
    const commandError = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string }
    const output = `${bufferishToString(commandError.stdout)}\n${bufferishToString(commandError.stderr)}`.trim()
    return {
      ok: false,
      text: redactSecrets(stripAnsi(output || commandError.message || 'Hermes MCP help 读取失败'))
    }
  }
}

function bufferishToString(value: Buffer | string | undefined) {
  if (!value) return ''
  return Buffer.isBuffer(value) ? value.toString('utf8') : value
}

function hasMcpCommand(helpText: string, command: string) {
  return new RegExp(`\\b${command}\\b`).test(helpText)
}

function mcpEvidence(command: string, help: { ok: boolean; text: string }, tokens: string[]) {
  if (!help.ok) return `${command} 未读取成功：${help.text.slice(0, 120)}`
  const found = tokens.filter((token) => help.text.includes(token))
  return `${command}${found.length ? ` · 检测到 ${found.join(' / ')}` : ''}`
}

function readMcpPresetNames() {
  const sourcePath = path.join(hermesAgentDir, 'hermes_cli', 'mcp_config.py')
  if (!fs.existsSync(sourcePath)) return []
  const source = fs.readFileSync(sourcePath, 'utf8')
  const match = source.match(/_MCP_PRESETS[\s\S]*?=\s*{([\s\S]*?)\n}\n/)
  if (!match) return []
  return [...match[1].matchAll(/^\s{4}["']([^"']+)["']\s*:/gm)]
    .map((item) => item[1])
    .filter(Boolean)
    .sort()
}

function normalizeCommandName(command: string) {
  const safeCommand = command.trim()
  return /^[A-Za-z0-9._/@+-]{1,120}$/.test(safeCommand) ? safeCommand : ''
}

function normalizeCommandArgs(args: unknown) {
  if (!Array.isArray(args)) return []
  return args
    .map((arg) => String(arg).trim())
    .filter(Boolean)
    .filter((arg) => arg.length <= 240 && !/[\r\n\0]/.test(arg))
    .slice(0, 40)
}

function normalizeMcpUrl(value: string) {
  const url = value.trim()
  if (!/^https?:\/\/[^\s]+$/i.test(url)) return ''
  return url.slice(0, 500)
}

function normalizeEnvEntries(entries: unknown) {
  if (!Array.isArray(entries)) return []
  return entries
    .map((entry) => String(entry).trim())
    .filter((entry) => /^[A-Za-z_][A-Za-z0-9_]*=.+$/.test(entry) && !/[\r\n\0]/.test(entry))
    .slice(0, 40)
}

function normalizeMcpAuth(value: unknown): 'none' | 'oauth' | 'header' {
  const auth = String(value ?? 'none').trim().toLowerCase()
  if (auth === 'oauth') return 'oauth'
  if (auth === 'header') return 'header'
  return 'none'
}

function normalizePresetName(value: unknown) {
  const preset = String(value ?? '').trim()
  if (!preset) return ''
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(preset)) return ''
  return preset
}

function normalizeHeaderName(value: unknown) {
  const header = String(value ?? '').trim()
  if (!header) return ''
  if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,80}$/.test(header)) return ''
  return header
}

function normalizeHeaderValue(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[\r\n\0]/g, '')
    .slice(0, 500)
}

function normalizeToolNames(entries: unknown) {
  if (!Array.isArray(entries)) return []
  return [...new Set(entries
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0 && entry.length <= 160 && !/[\r\n\0]/.test(entry))
    .slice(0, 200))]
}

function buildMcpServerBlock(options: {
  name: string
  transport: HermesMcpManualConfigRequest['transport']
  command: string
  args: string[]
  url: string
  enabled: boolean
  env: string[]
  auth: 'none' | 'oauth' | 'header'
  authHeaderName: string
  authHeaderValue: string
  preservedEnv: string[]
  preservedHeaders: string[]
  preservedAuth: string[]
  preservedTools: string[]
}) {
  const lines = [`  ${options.name}:`, `    enabled: ${options.enabled ? 'true' : 'false'}`]
  if (options.transport === 'stdio') {
    lines.push(`    command: ${quoteYaml(options.command)}`)
    if (options.args.length) {
      lines.push('    args:')
      for (const arg of options.args) lines.push(`      - ${quoteYaml(arg)}`)
    } else {
      lines.push('    args: []')
    }
    if (options.env.length) {
      lines.push('    env:')
      for (const entry of options.env) {
        const [key, ...rest] = entry.split('=')
        lines.push(`      ${key}: ${quoteYaml(rest.join('='))}`)
      }
    } else if (options.preservedEnv.length) {
      lines.push(...options.preservedEnv)
    }
  } else {
    lines.push(`    url: ${quoteYaml(options.url)}`)
    if (options.auth === 'oauth') {
      lines.push('    auth: "oauth"')
    } else if (options.auth === 'header') {
      if (options.authHeaderName && options.authHeaderValue) {
        lines.push('    headers:')
        lines.push(`      ${options.authHeaderName}: ${quoteYaml(options.authHeaderValue)}`)
      } else if (options.preservedHeaders.length) {
        lines.push(...options.preservedHeaders)
      }
    }
  }
  if (options.preservedTools.length) lines.push(...options.preservedTools)
  return lines
}

function buildMcpToolsBlock(mode: HermesMcpToolSelectionRequest['mode'], tools: string[]) {
  if (mode === 'all') return []
  const lines = ['    tools:', `      ${mode}:`]
  for (const tool of tools) lines.push(`        - ${quoteYaml(tool)}`)
  return lines
}

function extractYamlFieldBlock(lines: string[], range: { start: number; end: number }, field: string) {
  const fieldRange = findYamlFieldRange(lines, range, field)
  return fieldRange ? lines.slice(fieldRange.start, fieldRange.end) : []
}

function appendMcpServerBlock(raw: string, block: string[]) {
  const normalized = raw.replace(/\r/g, '')
  const lines = normalized.split('\n')
  const startIndex = lines.findIndex((line) => line.trim() === 'mcp_servers:')
  if (startIndex === -1) {
    const suffix = normalized.endsWith('\n') ? '' : '\n'
    return `${normalized}${suffix}mcp_servers:\n${block.join('\n')}\n`
  }

  let insertAt = lines.length
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^\S/.test(lines[index]) && lines[index].trim()) {
      insertAt = index
      break
    }
  }

  const nextLines = [...lines.slice(0, insertAt), ...block, ...lines.slice(insertAt)]
  return nextLines.join('\n')
}

function findYamlFieldRange(lines: string[], range: { start: number; end: number }, field: string) {
  const start = lines.findIndex((line, index) => index > range.start && index < range.end && line.match(new RegExp(`^ {4}${field}:`)))
  if (start === -1) return null
  let end = range.end
  for (let index = start + 1; index < range.end; index += 1) {
    if (/^ {4}[A-Za-z0-9_-]+:/.test(lines[index])) {
      end = index
      break
    }
  }
  return { start, end }
}

function quoteYaml(value: string) {
  return JSON.stringify(value)
}

function findServerRange(lines: string[], serverId: string) {
  const startIndex = lines.findIndex((line) => line.trim() === 'mcp_servers:')
  if (startIndex === -1) return null

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^\S/.test(line)) break
    const match = line.match(/^ {2}([^:\s][^:]*):\s*$/)
    if (!match || match[1].trim() !== serverId) continue

    let end = lines.length
    for (let next = index + 1; next < lines.length; next += 1) {
      const nextLine = lines[next]
      if (/^\S/.test(nextLine)) {
        end = next
        break
      }
      if (/^ {2}([^:\s][^:]*):\s*$/.test(nextLine)) {
        end = next
        break
      }
    }
    return { start: index, end }
  }

  return null
}

function findEnabledLine(lines: string[], start: number, end: number) {
  for (let index = start; index < end; index += 1) {
    if (/^ {4}enabled:\s*/.test(lines[index])) return index
  }
  return -1
}

function backupHermesConfig(raw: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${hermesConfigPath}.cowork-backup-${stamp}`
  fs.writeFileSync(backupPath, raw, 'utf8')
  return backupPath
}

function inferUrlTransport(url: string): HermesMcpServer['transport'] {
  if (url.includes('/sse')) return 'sse'
  return 'http'
}

function summarizeToolMode(server: RawMcpServer) {
  if (server.includeTools?.length) return `${server.includeTools.length} selected`
  if (server.excludeTools?.length) return `-${server.excludeTools.length} excluded`
  return 'all'
}

function unquoteYamlScalar(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const withoutComment = trimmed.replace(/\s+#.*$/, '')
  return withoutComment.replace(/^['"]|['"]$/g, '')
}

function stripAnsi(value: string) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
}

function redactSecrets(value: string) {
  return value
    .replace(/(tp|sk)-[A-Za-z0-9_-]{12,}/g, '$1-***')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer ***')
}

function appendMcpServeLog(stream: HermesMcpServeLogEntry['stream'], text: string) {
  const cleanText = redactSecrets(stripAnsi(text)).trim()
  if (!cleanText) return
  mcpServeLogs.push({
    createdAt: new Date().toISOString(),
    stream,
    text: cleanText.slice(0, 4000)
  })
  while (mcpServeLogs.length > 120) mcpServeLogs.shift()
}

function parseToolCount(value: string) {
  const match = value.match(/Tools discovered:\s*(\d+)/i)
  return match ? Number(match[1]) : undefined
}

function parseToolList(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .map((line) => line.match(/^([A-Za-z0-9_.:-]{2,})\s{2,}(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      name: match[1],
      description: match[2].trim()
    }))
    .filter((tool) => !['Transport:', 'Auth:'].includes(tool.name))
    .slice(0, 80)
}

function inferMcpMetadata(name: string, server: RawMcpServer) {
  const haystack = `${name} ${server.command ?? ''} ${server.args.join(' ')} ${server.url ?? ''}`.toLowerCase()
  if (haystack.includes('playwright')) {
    return {
      description: '浏览器自动化能力：打开网页、点击元素、填写表单、截图，并支持端到端测试。',
      iconUrl: 'https://playwright.dev/img/playwright-logo.svg'
    }
  }
  if (haystack.includes('csv') || haystack.includes('excel') || haystack.includes('spreadsheet')) {
    return {
      description: '表格分析能力：读取 CSV/表格文件，做字段识别、数据清洗、统计汇总和分析输出。',
      iconUrl: makeMcpIconDataUrl('CSV', '#2f7d62', '#e9fff5')
    }
  }
  if (haystack.includes('vision') || haystack.includes('image') || haystack.includes('ocr')) {
    return {
      description: '视觉理解能力：读取图片、截图或视觉素材，提取文字、结构和关键信息。',
      iconUrl: makeMcpIconDataUrl('VI', '#6d5df3', '#f0edff')
    }
  }
  if (haystack.includes('web-search') || haystack.includes('search') || haystack.includes('browser-search')) {
    return {
      description: '网页调研能力：联网搜索资料、读取网页结果，并把来源整理给 Hermes 使用。',
      iconUrl: makeMcpIconDataUrl('WS', '#1f78b4', '#e9f6ff')
    }
  }
  if (haystack.includes('chrome') || haystack.includes('devtools')) {
    return {
      description: 'Chrome 调试能力：读取页面结构、控制台、网络请求和性能信息，辅助排查前端问题。',
      iconUrl: 'https://www.google.com/s2/favicons?domain=developer.chrome.com&sz=64'
    }
  }
  if (haystack.includes('apple') || haystack.includes('shortcut')) {
    return {
      description: 'macOS 快捷指令能力：调用本机快捷指令，把 Hermes 和系统自动化流程连接起来。',
      iconUrl: 'https://www.google.com/s2/favicons?domain=apple.com&sz=64'
    }
  }
  if (haystack.includes('lark') || haystack.includes('feishu')) {
    return {
      description: '飞书工作流能力：连接云文档、消息、日历、审批等飞书工具，支撑办公自动化。',
      iconUrl: 'https://www.google.com/s2/favicons?domain=feishu.cn&sz=64'
    }
  }
  if (haystack.includes('filesystem') || haystack.includes('file-system')) {
    return {
      description: '文件系统能力：读取、搜索和管理授权目录内的本地文件。',
      iconUrl: makeMcpIconDataUrl('FS', '#2f7d62', '#e9fff5')
    }
  }
  if (haystack.includes('sqlite')) {
    return {
      description: 'SQLite 数据库能力：查询和维护本机 SQLite 数据库，适合轻量数据分析。',
      iconUrl: 'https://www.google.com/s2/favicons?domain=sqlite.org&sz=64'
    }
  }
  if (haystack.includes('postgres')) {
    return {
      description: 'PostgreSQL 数据库能力：连接数据库执行查询、读取结构并辅助数据分析。',
      iconUrl: 'https://www.google.com/s2/favicons?domain=postgresql.org&sz=64'
    }
  }
  if (haystack.includes('github')) {
    return {
      description: 'GitHub 协作能力：读取仓库、Issue、Pull Request 和代码上下文。',
      iconUrl: 'https://www.google.com/s2/favicons?domain=github.com&sz=64'
    }
  }
  if (haystack.includes('time')) {
    return {
      description: '时间能力：提供时区换算、当前时间和日期处理工具。',
      iconUrl: makeMcpIconDataUrl('TM', '#6d5df3', '#f0edff')
    }
  }
  return {
    description: `${server.command ? `通过 ${server.command} 启动的` : '已配置的'}本机 MCP 服务，为 Hermes 提供扩展工具能力。`,
    iconUrl: makeMcpIconDataUrl(mcpInitials(name), '#4a86ff', '#eef4ff')
  }
}

function mcpInitials(name: string) {
  return name
    .split(/[-_\s]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2) || 'M'
}

function makeMcpIconDataUrl(label: string, color: string, background: string) {
  const safeLabel = label.replace(/[^A-Z0-9]/gi, '').slice(0, 2) || 'M'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${background}"/><rect x="11" y="16" width="42" height="33" rx="8" fill="${color}" opacity="0.16"/><path d="M18 25h12l4 5h12v17H18z" fill="${color}"/><text x="32" y="43" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="white">${safeLabel}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
