import fs from 'node:fs'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { dataDir, hermesAgentDir, hermesBin } from './paths.js'
import {
  HermesMcpConfig,
  HermesMcpCategoryId,
  HermesMcpInstallRequest,
  HermesMcpInstallResult,
  HermesMcpManualConfigRequest,
  HermesMcpMarketplaceCandidate,
  HermesMcpMarketplaceResponse,
  HermesMcpRecommendationGroup,
  HermesMcpRecommendations,
  HermesMcpServer,
  HermesMcpServeLogEntry,
  HermesMcpServeStatus,
  HermesMcpTestResult,
  HermesMcpToolSelectionRequest,
  HermesMcpToolSelectionResult,
  HermesMcpUpdateResult,
  Task
} from './types.js'

const hermesConfigPath = '/Users/lucas/.hermes/config.yaml'
const recommendationsPath = path.join(dataDir, 'mcp-recommendations.json')
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

type GitHubRepo = {
  id: number
  name: string
  full_name: string
  html_url: string
  description?: string | null
  stargazers_count?: number
  language?: string | null
  updated_at?: string
  topics?: string[]
  owner?: {
    avatar_url?: string
  }
}

const mcpCategories: Record<HermesMcpCategoryId, { label: string; description: string }> = {
  file: { label: '文件与文档', description: '文件管理、目录检索、文档读取、格式转换。' },
  browser: { label: '浏览器自动化', description: '网页操作、截图、表单填写、前端测试。' },
  data: { label: '数据分析', description: 'CSV、Excel、数据库和业务分析。' },
  office: { label: '办公协作', description: '飞书、邮件、日历、审批、云文档等工作流。' },
  research: { label: '网页调研', description: '搜索、抓取、网页阅读、来源整理。' },
  vision: { label: '视觉理解', description: '图片、截图、OCR、视觉素材识别。' },
  memory: { label: '记忆知识库', description: '长期记忆、知识库、向量检索和上下文管理。' },
  dev: { label: '研发协作', description: 'GitHub、代码仓库、Issue、CI 和开发工具。' },
  automation: { label: '本机自动化', description: 'macOS、快捷指令、终端命令和系统工具。' },
  other: { label: '其他扩展', description: '尚未明确分类，但可能有用的 MCP 能力。' }
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

export function installHermesMcpServer(request: HermesMcpInstallRequest): Promise<HermesMcpInstallResult> {
  const installName = normalizeServerId(request.installName)
  const command = normalizeCommandName(request.suggestedCommand)
  const args = normalizeCommandArgs(request.suggestedArgs)

  if (!installName) {
    return Promise.reject(new Error('MCP 服务名称不合法'))
  }
  if (!command) {
    return Promise.reject(new Error('缺少可执行的启动命令，当前候选需要手动配置'))
  }
  if (readHermesMcpConfig().servers.some((server) => server.id === installName)) {
    return Promise.reject(new Error(`MCP 服务已存在：${installName}`))
  }

  const raw = fs.readFileSync(hermesConfigPath, 'utf8')
  const backupPath = backupHermesConfig(raw)
  const installArgs = ['mcp', 'add', installName, '--command', command]
  if (args.length) {
    installArgs.push('--args', ...args)
  }

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

export async function searchHermesMcpMarketplace(query = ''): Promise<HermesMcpMarketplaceResponse> {
  const normalizedQuery = query.trim().slice(0, 80)
  const searchTerms = normalizedQuery
    ? `${normalizedQuery} mcp server`
    : 'mcp server Model Context Protocol'
  const url = new URL('https://api.github.com/search/repositories')
  url.searchParams.set('q', `${searchTerms} in:name,description,readme`)
  url.searchParams.set('sort', 'stars')
  url.searchParams.set('order', 'desc')
  url.searchParams.set('per_page', '16')

  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Hermes-Cowork'
    }
  })

  if (!response.ok) {
    throw new Error(`GitHub marketplace search failed: ${response.status}`)
  }

  const body = await response.json() as { items?: GitHubRepo[] }
  const candidates = (body.items ?? [])
    .filter((repo) => looksLikeMcpRepo(repo))
    .map(toMarketplaceCandidate)
    .slice(0, 12)

  return {
    query: normalizedQuery,
    source: 'github',
    candidates,
    updatedAt: new Date().toISOString()
  }
}

export function readHermesMcpRecommendations(): HermesMcpRecommendations {
  if (fs.existsSync(recommendationsPath)) {
    return JSON.parse(fs.readFileSync(recommendationsPath, 'utf8')) as HermesMcpRecommendations
  }
  return emptyMcpRecommendations()
}

export async function refreshHermesMcpRecommendations(tasks: Task[]): Promise<HermesMcpRecommendations> {
  const signals = buildMcpRecommendationSignals(tasks)
  return buildMcpRecommendationsFromSignals(signals, false)
}

export async function refreshHermesMcpRecommendationsWithHermes(tasks: Task[]): Promise<HermesMcpRecommendations> {
  const ruleSignals = buildMcpRecommendationSignals(tasks)
  const aiSignals = await buildHermesMcpRecommendationSignals(tasks).catch(() => null)
  const signals = aiSignals
    ? {
        taskCount: ruleSignals.taskCount,
        keywords: [...new Set([...ruleSignals.keywords, ...aiSignals.keywords])].slice(0, 12),
        blockers: [...new Set([...ruleSignals.blockers, ...aiSignals.blockers])].slice(0, 12),
        queries: [...new Set([...aiSignals.queries, ...ruleSignals.queries])].slice(0, 10),
        aiSummary: aiSignals.summary
      }
    : ruleSignals
  return buildMcpRecommendationsFromSignals(signals, Boolean(aiSignals), aiSignals?.summary)
}

async function buildMcpRecommendationsFromSignals(
  signals: ReturnType<typeof buildMcpRecommendationSignals> & { aiSummary?: string },
  aiUsed: boolean,
  aiSummary?: string
) {
  const queryPlan = [...new Set([...signals.queries, ...defaultMcpRecommendationQueries()])].slice(0, 7)
  const candidateMap = new Map<string, HermesMcpMarketplaceCandidate>()

  for (const query of queryPlan) {
    try {
      const response = await searchHermesMcpMarketplace(query)
      for (const candidate of response.candidates) {
        if (!candidateMap.has(candidate.repo)) candidateMap.set(candidate.repo, candidate)
      }
    } catch {
      // Keep recommendations useful even if one GitHub query fails.
    }
  }

  const recommendations: HermesMcpRecommendations = {
    generatedAt: new Date().toISOString(),
    nextRunAt: nextRecommendationRunAt(),
    sourceSummary: `分析最近 ${signals.taskCount} 个任务，提取 ${signals.keywords.length} 个需求关键词。`,
    keywords: signals.keywords,
    blockers: signals.blockers,
    categories: groupMcpCandidates([...candidateMap.values()]),
    aiUsed,
    aiSummary
  }

  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(recommendationsPath, JSON.stringify(recommendations, null, 2), 'utf8')
  return recommendations
}

export function startMcpRecommendationScheduler(getTasks: () => Task[]) {
  let running = false
  setInterval(() => {
    const now = new Date()
    if (now.getHours() !== 0 || now.getMinutes() < 10 || now.getMinutes() > 25) return
    const stamp = now.toISOString().slice(0, 10)
    const previous = readHermesMcpRecommendations()
    if (previous.generatedAt?.slice(0, 10) === stamp) return
    if (running) return
    running = true
    void refreshHermesMcpRecommendations(getTasks()).finally(() => {
      running = false
    })
  }, 5 * 60 * 1000)
}

function normalizeServerId(serverId: string) {
  const safeServerId = serverId.trim()
  return /^[A-Za-z0-9._-]{1,120}$/.test(safeServerId) ? safeServerId : ''
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

function looksLikeMcpRepo(repo: GitHubRepo) {
  const text = `${repo.name} ${repo.full_name} ${repo.description ?? ''} ${(repo.topics ?? []).join(' ')}`.toLowerCase()
  return text.includes('mcp') || text.includes('model context protocol')
}

function classifyMcpText(value: string): HermesMcpCategoryId {
  const text = value.toLowerCase()
  if (text.includes('filesystem') || text.includes('file system') || text.includes('drive') || text.includes('pdf') || text.includes('document')) return 'file'
  if (text.includes('browser') || text.includes('playwright') || text.includes('puppeteer') || text.includes('chrome')) return 'browser'
  if (text.includes('database') || text.includes('sql') || text.includes('sqlite') || text.includes('postgres') || text.includes('csv') || text.includes('excel') || text.includes('spreadsheet')) return 'data'
  if (text.includes('lark') || text.includes('feishu') || text.includes('slack') || text.includes('mail') || text.includes('calendar') || text.includes('notion')) return 'office'
  if (text.includes('search') || text.includes('crawl') || text.includes('scrape') || text.includes('research') || text.includes('web')) return 'research'
  if (text.includes('vision') || text.includes('image') || text.includes('ocr') || text.includes('screenshot')) return 'vision'
  if (text.includes('memory') || text.includes('knowledge') || text.includes('vector') || text.includes('rag')) return 'memory'
  if (text.includes('github') || text.includes('gitlab') || text.includes('git') || text.includes('issue') || text.includes('pull request')) return 'dev'
  if (text.includes('shortcut') || text.includes('macos') || text.includes('terminal') || text.includes('shell') || text.includes('automation')) return 'automation'
  return 'other'
}

function groupMcpCandidates(candidates: HermesMcpMarketplaceCandidate[]): HermesMcpRecommendationGroup[] {
  return (Object.keys(mcpCategories) as HermesMcpCategoryId[])
    .map((id) => ({
      id,
      label: mcpCategories[id].label,
      description: mcpCategories[id].description,
      candidates: candidates
        .filter((candidate) => candidate.category === id)
        .sort((left, right) => right.stars - left.stars)
        .slice(0, 8)
    }))
    .filter((group) => group.candidates.length > 0)
}

function emptyMcpRecommendations(): HermesMcpRecommendations {
  return {
    generatedAt: '',
    nextRunAt: nextRecommendationRunAt(),
    sourceSummary: '还没有生成每日 MCP 推荐。',
    keywords: [],
    blockers: [],
    categories: []
  }
}

function nextRecommendationRunAt() {
  const next = new Date()
  next.setHours(24, 10, 0, 0)
  return next.toISOString()
}

function defaultMcpRecommendationQueries() {
  return [
    'filesystem mcp server',
    'browser automation mcp server',
    'data analysis csv excel mcp server',
    'web search research mcp server',
    'lark feishu office mcp server'
  ]
}

function buildMcpRecommendationSignals(tasks: Task[]) {
  const since = Date.now() - 36 * 60 * 60 * 1000
  const recentTasks = tasks.filter((task) => new Date(task.updatedAt || task.createdAt).getTime() >= since)
  const text = recentTasks
    .map((task) => [
      task.title,
      task.prompt,
      task.error,
      task.stderr,
      ...(task.tags ?? []),
      ...(task.events ?? []).map((event) => JSON.stringify(event).slice(0, 500))
    ].filter(Boolean).join(' '))
    .join('\n')
    .toLowerCase()

  const keywordRules: Array<[string, RegExp, string]> = [
    ['文件整理', /文件|目录|folder|file|pdf|word|markdown|doc|整理/, 'filesystem document mcp server'],
    ['数据分析', /数据|csv|excel|xlsx|表格|sql|sqlite|database|analysis/, 'data analysis csv excel database mcp server'],
    ['飞书办公', /飞书|lark|feishu|审批|日历|邮件|文档|base|多维表格/, 'lark feishu office mcp server'],
    ['网页调研', /网页|调研|搜索|github|search|research|crawl|scrape/, 'web search research mcp server'],
    ['浏览器自动化', /浏览器|点击|页面|截图|playwright|chrome|browser/, 'browser automation playwright mcp server'],
    ['视觉识别', /图片|截图|ocr|vision|image|识别/, 'vision ocr image mcp server'],
    ['代码协作', /代码|仓库|issue|pull request|github|gitlab|repo/, 'github repository mcp server'],
    ['知识库记忆', /记忆|知识库|向量|检索|memory|knowledge|rag/, 'memory knowledge base mcp server']
  ]

  const matched = keywordRules.filter(([, pattern]) => pattern.test(text))
  const blockers = extractBlockers(recentTasks)

  return {
    taskCount: recentTasks.length,
    keywords: matched.map(([label]) => label),
    blockers,
    queries: matched.map(([, , query]) => query)
  }
}

async function buildHermesMcpRecommendationSignals(tasks: Task[]) {
  const recentTasks = tasks
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 16)
  const compact = recentTasks.map((task) => ({
    title: task.title,
    status: task.status,
    prompt: task.prompt.slice(0, 500),
    tags: task.tags ?? [],
    error: task.error ?? '',
    stderr: task.stderr?.slice(0, 500) ?? '',
    events: (task.events ?? [])
      .filter((event) => event.isError || event.type?.toLowerCase().includes('error') || event.type?.toLowerCase().includes('tool'))
      .slice(-8)
      .map((event) => ({
        type: event.type,
        name: event.name,
        message: event.message,
        error: event.error
      }))
  }))

  const prompt = [
    '你是 Hermes Cowork 的本机能力推荐分析器。',
    '请根据下面的任务记录、失败信息、工具调用和用户需求，判断我还缺哪些 MCP 能力。',
    '你需要输出严格 JSON，不要输出 Markdown，不要解释。',
    'JSON 结构：{"summary":"一句中文总结","keywords":["中文需求词"],"blockers":["中文卡点"],"queries":["用于 GitHub 搜索 MCP server 的英文查询词"]}',
    '要求：queries 每条都包含 mcp server；优先覆盖文件、数据、飞书办公、网页调研、浏览器自动化、视觉、知识库、研发协作。',
    `任务记录：${JSON.stringify(compact)}`
  ].join('\n')

  const result = await new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve) => {
    execFile(
      hermesBin,
      ['chat', '--quiet', '--source', 'hermes-cowork-background', '--max-turns', '8', '-q', prompt],
      { cwd: hermesAgentDir, timeout: 180000 },
      (error, stdout, stderr) => {
        resolve({ stdout: stripAnsi(stdout), stderr: stripAnsi(stderr), exitCode: error ? 1 : 0 })
      }
    )
  })

  const parsed = parseHermesJsonObject(result.stdout || result.stderr)
  return {
    summary: stringArrayOrEmpty([parsed.summary])[0] ?? '',
    keywords: stringArrayOrEmpty(parsed.keywords).slice(0, 12),
    blockers: stringArrayOrEmpty(parsed.blockers).slice(0, 12),
    queries: stringArrayOrEmpty(parsed.queries)
      .map((query) => query.toLowerCase().includes('mcp') ? query : `${query} mcp server`)
      .slice(0, 10)
  }
}

function parseHermesJsonObject(value: string) {
  const cleaned = value.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Hermes 没有返回可解析的 JSON')
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
}

function stringArrayOrEmpty(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

function extractBlockers(tasks: Task[]) {
  const blockers = tasks
    .flatMap((task) => [
      task.error,
      task.stderr,
      ...(task.events ?? [])
        .filter((event) => event.isError || event.type?.toLowerCase().includes('error'))
        .map((event) => String(event.error ?? event.message ?? event.type))
    ])
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/\s+/g, ' ').trim().slice(0, 120))

  return [...new Set(blockers)].slice(0, 8)
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

function inferMarketplaceMetadata(repo: GitHubRepo, sourceDescription: string, npmPackage = '') {
  const text = `${repo.name} ${repo.full_name} ${sourceDescription} ${npmPackage} ${(repo.topics ?? []).join(' ')}`.toLowerCase()
  if (text.includes('filesystem') || text.includes('file system')) {
    return {
      description: '文件系统 MCP：让 Hermes 读取、搜索和管理授权目录内的本地文件。',
      iconUrl: makeMcpIconDataUrl('FS', '#2f7d62', '#e9fff5')
    }
  }
  if (text.includes('browser') || text.includes('playwright') || text.includes('puppeteer')) {
    return {
      description: '浏览器 MCP：让 Hermes 操作网页、抓取页面信息、截图并执行自动化测试。',
      iconUrl: makeMcpIconDataUrl('BR', '#4a86ff', '#eef4ff')
    }
  }
  if (text.includes('database') || text.includes('sql') || text.includes('sqlite') || text.includes('postgres')) {
    return {
      description: '数据库 MCP：让 Hermes 连接数据源、读取表结构并执行查询分析。',
      iconUrl: makeMcpIconDataUrl('DB', '#7a5a32', '#fff3dd')
    }
  }
  if (text.includes('memory') || text.includes('knowledge')) {
    return {
      description: '记忆与知识库 MCP：保存长期上下文、检索知识并辅助持续协作。',
      iconUrl: makeMcpIconDataUrl('KB', '#6d5df3', '#f0edff')
    }
  }
  if (text.includes('slack') || text.includes('lark') || text.includes('feishu') || text.includes('mail')) {
    return {
      description: '办公协作 MCP：连接消息、文档、日历或邮件系统，支撑日常工作流。',
      iconUrl: makeMcpIconDataUrl('OA', '#22b1c8', '#e7fbff')
    }
  }
  if (text.includes('github') || text.includes('gitlab') || text.includes('git')) {
    return {
      description: '代码协作 MCP：连接代码仓库、Issue 和变更记录，辅助研发工作。',
      iconUrl: makeMcpIconDataUrl('GH', '#24292f', '#eef1f4')
    }
  }
  return {
    description: 'MCP 扩展能力候选：可为 Hermes 增加新的工具连接，安装前需要确认启动命令和权限范围。',
    iconUrl: makeMcpIconDataUrl(mcpInitials(repo.name), '#4a86ff', '#eef4ff')
  }
}

function toMarketplaceCandidate(repo: GitHubRepo): HermesMcpMarketplaceCandidate {
  const installName = sanitizeInstallName(repo.name)
  const npmPackage = inferNpmPackage(repo)
  const confidence = npmPackage ? 'medium' : 'low'
  const sourceDescription = repo.description ?? 'GitHub 上的 MCP 服务候选项目，需要确认安装命令后再写入 Hermes。'
  const metadata = inferMarketplaceMetadata(repo, sourceDescription, npmPackage)
  const category = classifyMcpText(`${repo.name} ${repo.full_name} ${sourceDescription} ${npmPackage} ${(repo.topics ?? []).join(' ')}`)
  return {
    id: String(repo.id),
    name: repo.name,
    repo: repo.full_name,
    url: repo.html_url,
    description: metadata.description,
    sourceDescription,
    iconUrl: repo.owner?.avatar_url ?? metadata.iconUrl,
    category,
    categoryLabel: mcpCategories[category].label,
    stars: repo.stargazers_count ?? 0,
    language: repo.language ?? 'unknown',
    updatedAt: repo.updated_at ?? '',
    installName,
    suggestedCommand: npmPackage ? 'npx' : '',
    suggestedArgs: npmPackage ? ['-y', npmPackage] : [],
    confidence
  }
}

function inferNpmPackage(repo: GitHubRepo) {
  const name = repo.name.toLowerCase()
  if (repo.full_name === 'modelcontextprotocol/servers') return '@modelcontextprotocol/server-filesystem'
  if (name.startsWith('server-')) return `@modelcontextprotocol/${name}`
  if (name.startsWith('mcp-server-')) return repo.name
  if (name.endsWith('-mcp-server')) return repo.name
  return ''
}

function sanitizeInstallName(value: string) {
  return value
    .toLowerCase()
    .replace(/^mcp-server-/, '')
    .replace(/-mcp-server$/, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'mcp-server'
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
