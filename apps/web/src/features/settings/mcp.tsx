import {
  CheckCircle2,
  ChevronDown,
  Info,
  KeyRound,
  Loader2,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  Wrench,
  XCircle
} from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  type HermesMcpConfig,
  type HermesMcpLoginResult,
  type HermesMcpManualConfigRequest,
  type HermesMcpNativeCapabilities,
  type HermesMcpNativeCommand,
  type HermesMcpServeStatus,
  type HermesMcpTestResult
} from '../../lib/api'
import { getHermesMcpNativeCapabilities } from './mcpApi'

export type McpScope = 'local' | 'serve' | 'cloud'

export function ConnectorsView({
  connectors,
  configPath,
  error,
  onOpenSettings,
  onOpenNativeAdd
}: {
  connectors: HermesMcpConfig['servers']
  configPath?: string
  error: string | null
  onOpenSettings: () => void
  onOpenNativeAdd: () => void
}) {
  const enabledCount = connectors.filter((connector) => connector.enabled).length
  const [nativeCapabilities, setNativeCapabilities] = useState<HermesMcpNativeCapabilities | null>(null)
  const [nativeCapabilityError, setNativeCapabilityError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getHermesMcpNativeCapabilities()
      .then((result) => {
        if (cancelled) return
        setNativeCapabilities(result)
        setNativeCapabilityError(null)
      })
      .catch((failure) => {
        if (cancelled) return
        setNativeCapabilities(null)
        setNativeCapabilityError(failure instanceof Error ? failure.message : String(failure))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="connectors-panel">
      <div className="connector-summary">
        <div>
          <strong>{connectors.length}</strong>
          <span>已安装 MCP 服务</span>
        </div>
        <div>
          <strong>{enabledCount}</strong>
          <span>已启用</span>
        </div>
        <div>
          <strong>{configPath ? 'Hermes' : '未连接'}</strong>
          <span>{configPath ?? '暂未读取到 MCP 配置'}</span>
        </div>
      </div>

      <div className="mcp-ecosystem-panel">
        <div>
          <span className="section-kicker">Hermes 原生生态</span>
          <strong>原生 MCP 管理</strong>
          <p>这里直接读取 Hermes MCP 配置。新增服务会走 `hermes mcp add`，测试、工具开关和删除也写回 Hermes，不再维护 Cowork 自建市场。</p>
        </div>
        <div className="mcp-ecosystem-grid">
          <span><b>{connectors.length}</b> 本机服务</span>
          <span><b>{enabledCount}</b> 已启用</span>
          <span><b>{configPath ? '已连接' : '未连接'}</b> 配置文件</span>
        </div>
        <p className="mcp-ecosystem-copy">官方入口包括 preset、stdio command、HTTP/SSE URL、OAuth/Header、env。需要安装新服务时，从这里打开原生添加表单。</p>
        <div className="mcp-ecosystem-actions">
          <button className="settings-link-button" onClick={onOpenNativeAdd}><Plus size={13} /> 添加 MCP</button>
          <button className="settings-link-button" onClick={onOpenSettings}>打开 MCP 管理</button>
        </div>
      </div>

      <McpNativeCapabilityPanel
        capabilities={nativeCapabilities}
        error={nativeCapabilityError}
        onOpenSettings={onOpenSettings}
        onOpenNativeAdd={onOpenNativeAdd}
      />

      {error && <div className="settings-error-line">{error}</div>}

      <div className="connector-list">
        {!connectors.length && <p className="muted-copy">暂未读取到 MCP 服务。可以用 Hermes 原生添加表单配置 preset、stdio 或 HTTP/SSE 服务。</p>}
        {connectors.map((connector) => (
          <article className={connector.enabled ? 'connector-card enabled' : 'connector-card'} key={connector.id}>
            <div className="connector-icon">
              {connector.iconUrl ? <img src={connector.iconUrl} alt="" /> : <Plug size={18} />}
            </div>
            <div className="connector-body">
              <div className="connector-head">
                <strong>{connector.name}</strong>
                <span>{connector.enabled ? '已启用' : '已停用'}</span>
              </div>
              <p>{connector.description || connector.command || connector.url || '这个 MCP 服务来自 Hermes 配置。'}</p>
              <div className="connector-meta">
                <em>{connector.transport.toUpperCase()}</em>
                <em>{connector.status === 'configured' ? '配置完整' : '需要补全'}</em>
                {connector.auth !== 'none' && <em>{connector.auth}</em>}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="connector-footer">
        <span>详细测试、工具级开关、编辑和删除仍在 MCP 设置页中完成。</span>
        <button className="settings-link-button" onClick={onOpenSettings}>打开 MCP 管理</button>
      </div>
    </div>
  )
}

function McpNativeCapabilityPanel({
  capabilities,
  error,
  onOpenSettings,
  onOpenNativeAdd
}: {
  capabilities: HermesMcpNativeCapabilities | null
  error: string | null
  onOpenSettings: () => void
  onOpenNativeAdd: () => void
}) {
  if (error) {
    return (
      <div className="mcp-native-panel">
        <div className="mcp-native-head">
          <div>
            <span className="section-kicker">官方 MCP 能力</span>
            <strong>读取 Hermes 原生命令失败</strong>
            <p>{error}</p>
          </div>
          <button className="settings-link-button" onClick={onOpenSettings}>打开 MCP 管理</button>
        </div>
      </div>
    )
  }

  if (!capabilities) {
    return (
      <div className="mcp-native-panel">
        <div className="mcp-native-loading"><Loader2 size={16} className="spin" /> 正在读取 Hermes MCP 原生命令</div>
      </div>
    )
  }

  const coveredCount = capabilities.commands.filter((command) => command.coworkStatus === 'covered').length
  const availableCount = capabilities.commands.filter((command) => command.available).length
  const missingCommands = capabilities.commands.filter((command) => command.coworkStatus !== 'covered')

  return (
    <div className="mcp-native-panel">
      <div className="mcp-native-head">
        <div>
          <span className="section-kicker">官方 MCP 能力</span>
          <strong>Hermes 原生命令覆盖</strong>
          <p>这里按本机 Hermes CLI 实际暴露的 MCP 命令显示 Cowork 覆盖状态，不再用自建市场模拟生态。</p>
        </div>
        <div className="mcp-native-actions">
          <button className="settings-link-button" onClick={onOpenNativeAdd}><Plus size={13} /> 添加 MCP</button>
          <button className="settings-link-button" onClick={onOpenSettings}>管理服务</button>
        </div>
      </div>

      <div className="mcp-native-summary">
        <span><b>{availableCount}</b> Hermes 命令可用</span>
        <span><b>{coveredCount}</b> Cowork 已覆盖</span>
        <span><b>{capabilities.serverCount}</b> 本机服务</span>
        <span><b>{capabilities.presetCount}</b> preset</span>
      </div>

      <div className="mcp-native-command-grid">
        {capabilities.commands.map((command) => (
          <McpNativeCommandCard command={command} key={command.id} />
        ))}
      </div>

      <div className="mcp-native-notes">
        <strong>{missingCommands.length ? '后续需要补齐' : '当前核心操作已覆盖'}</strong>
        <div>
          {capabilities.notes.map((note) => <span key={note}>{note}</span>)}
        </div>
      </div>
    </div>
  )
}

function McpNativeCommandCard({ command }: { command: HermesMcpNativeCommand }) {
  return (
    <article className={`mcp-native-command ${command.coworkStatus}`}>
      <div>
        <strong>{command.label}</strong>
        <span className={`mcp-native-status ${command.coworkStatus}`}>{mcpNativeStatusLabel(command.coworkStatus)}</span>
      </div>
      <p>{command.description}</p>
      <small>{command.coworkEntry}</small>
      <em>{command.available ? command.evidence : `Hermes 未暴露：${command.evidence}`}</em>
    </article>
  )
}

function mcpNativeStatusLabel(status: HermesMcpNativeCommand['coworkStatus']) {
  if (status === 'covered') return '已接入'
  if (status === 'partial') return '部分接入'
  return '待补齐'
}

export function McpSettingsSection({
  mcpScope,
  hermesMcp,
  mcpError,
  mcpTestResults,
  mcpLoginResults,
  mcpTestingId,
  mcpLoggingInId,
  mcpUpdatingId,
  mcpDeletingId,
  mcpToolUpdatingId,
  mcpServeStatus,
  mcpServeUpdating,
  mcpServeError,
  onMcpScopeChange,
  onToggleMcpServer,
  onRefreshMcp,
  onTestMcpServer,
  onLoginMcpServer,
  onEditMcpServer,
  onSetMcpToolSelection,
  onDeleteMcpServer,
  onOpenManualMcp,
  onToggleMcpServe,
  onRefreshMcpServe
}: {
  mcpScope: McpScope
  hermesMcp: HermesMcpConfig | null
  mcpError: string | null
  mcpTestResults: Record<string, HermesMcpTestResult>
  mcpLoginResults: Record<string, HermesMcpLoginResult>
  mcpTestingId: string | null
  mcpLoggingInId: string | null
  mcpUpdatingId: string | null
  mcpDeletingId: string | null
  mcpToolUpdatingId: string | null
  mcpServeStatus: HermesMcpServeStatus | null
  mcpServeUpdating: boolean
  mcpServeError: string | null
  onMcpScopeChange: (value: McpScope) => void
  onToggleMcpServer: (serverId: string, enabled: boolean) => void
  onRefreshMcp: () => void
  onTestMcpServer: (serverId: string) => void
  onLoginMcpServer: (serverId: string) => void
  onEditMcpServer: (server: HermesMcpConfig['servers'][number]) => void
  onSetMcpToolSelection: (serverId: string, mode: 'all' | 'include' | 'exclude', tools: string[]) => void
  onDeleteMcpServer: (serverId: string) => void
  onOpenManualMcp: () => void
  onToggleMcpServe: (enabled: boolean) => void
  onRefreshMcpServe: () => void
}) {
  const [expandedMcpId, setExpandedMcpId] = useState<string | null>(null)
  const mcpServers = hermesMcp?.servers ?? []

  return (
    <div className="settings-section-content">
      <h2>MCP</h2>
      <SettingsSubtabs
        value={mcpScope}
        options={[['local', '本地服务'], ['serve', 'Hermes Server'], ['cloud', '云端']]}
        onChange={(value) => onMcpScopeChange(value as McpScope)}
      />

      {mcpScope === 'local' && (
        <SettingsCard>
          <div className="settings-card-header">
            <div>
              <strong>MCP 服务管理</strong>
              <span>
                读取 Hermes 的 MCP 服务配置
                {hermesMcp?.configPath ? ` · ${hermesMcp.configPath}` : ''}
              </span>
            </div>
            <div className="settings-card-actions">
              <button className="icon-button" title="刷新 MCP 状态" onClick={onRefreshMcp}><RefreshCw size={14} /></button>
              <div className="mcp-add-menu">
                <button className="dark-mini-button"><Plus size={14} /> 添加 <ChevronDown size={13} /></button>
                <div className="mcp-add-popover">
                  <button onClick={onOpenManualMcp}>Hermes 原生添加</button>
                </div>
              </div>
            </div>
          </div>
          {mcpError && <div className="settings-error-line">{mcpError}</div>}
          {!mcpError && (
            <div className="settings-source-line">
              <span>真实 Hermes 配置</span>
              <strong>{mcpServers.length} 个服务</strong>
              <em>只读预览，敏感环境变量已隐藏</em>
            </div>
          )}
          <div className="mcp-server-list">
            {mcpServers.length === 0 && !mcpError && (
              <div className="mcp-empty-state">Hermes 配置中暂未发现 MCP 服务。</div>
            )}
            {mcpServers.map((server) => (
              <div className="mcp-server-item" key={server.id}>
                <div className="mcp-server-row">
                  <button
                    className="mcp-expand-button"
                    onClick={() => setExpandedMcpId((current) => current === server.id ? null : server.id)}
                    title="展开 MCP 配置详情"
                  >
                    <ChevronDown size={14} />
                  </button>
                  <McpIcon name={server.name} iconUrl={server.iconUrl} />
                  <div className="mcp-server-main">
                    <strong>{server.name}</strong>
                    <span>{mcpServerSummary(server)}</span>
                  </div>
                  {server.status === 'configured' ? <CheckCircle2 size={13} className="ready-mark" /> : <XCircle size={13} className="error-mark" />}
                  <button
                    className="settings-test-button"
                    onClick={() => onTestMcpServer(server.id)}
                    disabled={mcpTestingId === server.id}
                  >
                    {mcpTestingId === server.id ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
                    测试
                  </button>
                  {server.auth === 'oauth' && (
                    <button
                      className="settings-oauth-button"
                      onClick={() => onLoginMcpServer(server.id)}
                      disabled={mcpLoggingInId === server.id}
                      title="调用 hermes mcp login 重新授权"
                    >
                      {mcpLoggingInId === server.id ? <Loader2 size={13} className="spin" /> : <KeyRound size={13} />}
                      重新授权
                    </button>
                  )}
                  <button
                    className="settings-edit-button"
                    onClick={() => onEditMcpServer(server)}
                    disabled={mcpUpdatingId === server.id}
                    title="编辑 MCP 服务"
                  >
                    {mcpUpdatingId === server.id ? <Loader2 size={13} className="spin" /> : <Wrench size={13} />}
                  </button>
                  <button
                    className="settings-delete-button"
                    onClick={() => onDeleteMcpServer(server.id)}
                    disabled={mcpDeletingId === server.id}
                    title="删除 MCP 服务"
                  >
                    {mcpDeletingId === server.id ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                  </button>
                  <div className="mcp-toggle-wrap" title="写回 Hermes config.yaml 的 enabled 字段">
                    {mcpUpdatingId === server.id && <Loader2 size={13} className="spin" />}
                    <SettingsToggle checked={server.enabled} onChange={(value) => onToggleMcpServer(server.id, value)} disabled={mcpUpdatingId === server.id} />
                  </div>
                </div>
                {expandedMcpId === server.id && (
                  <McpServerDetails
                    server={server}
                    testResult={mcpTestResults[server.id]}
                    loginResult={mcpLoginResults[server.id]}
                    isUpdatingTools={mcpToolUpdatingId === server.id}
                    onSetToolSelection={(mode, tools) => onSetMcpToolSelection(server.id, mode, tools)}
                    onTest={() => onTestMcpServer(server.id)}
                  />
                )}
              </div>
            ))}
          </div>
        </SettingsCard>
      )}

      {mcpScope === 'serve' && (
        <SettingsCard>
          <div className="settings-card-header">
            <div>
              <strong>Hermes 作为 MCP Server</strong>
              <span>覆盖 `hermes mcp serve -v`，用于把 Hermes 对话能力通过 stdio 暴露给其他 MCP Client。</span>
            </div>
            <div className="settings-card-actions">
              <button className="icon-button" title="刷新 serve 状态" onClick={onRefreshMcpServe}><RefreshCw size={14} /></button>
              <button
                className={mcpServeStatus?.running ? 'settings-danger-button' : 'dark-mini-button'}
                onClick={() => onToggleMcpServe(!mcpServeStatus?.running)}
                disabled={mcpServeUpdating}
              >
                {mcpServeUpdating ? <Loader2 size={13} className="spin" /> : mcpServeStatus?.running ? <Square size={13} /> : <Play size={13} />}
                {mcpServeStatus?.running ? '停止 serve' : '启动 serve'}
              </button>
            </div>
          </div>
          {mcpServeError && <div className="settings-error-line">{mcpServeError}</div>}
          <McpServePanel status={mcpServeStatus} />
        </SettingsCard>
      )}

      {mcpScope === 'cloud' && (
        <SettingsCard>
          <div className="settings-card-header">
            <div>
              <strong>云端 MCP</strong>
              <span>预留给未来远程 Hermes 或云端运行环境。当前版本只管理本机 Hermes。</span>
            </div>
          </div>
          <div className="mcp-empty-state">云端 MCP 暂未接入。后续可以在这里管理云端服务、远程凭据和团队共享配置。</div>
        </SettingsCard>
      )}
    </div>
  )
}

export function ManualMcpModal({
  mode = 'create',
  initialServer,
  isSaving,
  onClose,
  onSubmit
}: {
  mode?: 'create' | 'edit'
  initialServer?: HermesMcpConfig['servers'][number] | null
  isSaving: boolean
  onClose: () => void
  onSubmit: (config: HermesMcpManualConfigRequest) => void
}) {
  const initialTransport = initialServer?.transport === 'http' || initialServer?.transport === 'sse' ? initialServer.transport : 'stdio'
  const isEdit = mode === 'edit'
  const [name, setName] = useState(initialServer?.name ?? '')
  const [transport, setTransport] = useState<'stdio' | 'http' | 'sse'>(initialTransport)
  const [command, setCommand] = useState(initialServer?.command ?? '')
  const [argsText, setArgsText] = useState(initialServer?.args.join(' ') ?? '')
  const [url, setUrl] = useState(initialServer?.url ?? '')
  const [envText, setEnvText] = useState('')
  const [auth, setAuth] = useState<'none' | 'oauth' | 'header'>(initialServer?.auth === 'oauth' || initialServer?.auth === 'header' ? initialServer.auth : 'none')
  const [authHeaderName, setAuthHeaderName] = useState(initialServer?.headerKeys[0] ?? 'Authorization')
  const [authHeaderValue, setAuthHeaderValue] = useState('')
  const [preset, setPreset] = useState('')

  useEffect(() => {
    if (!initialServer) return
    setName(initialServer.name)
    setTransport(initialServer.transport === 'http' || initialServer.transport === 'sse' ? initialServer.transport : 'stdio')
    setCommand(initialServer.command ?? '')
    setArgsText(initialServer.args.join(' '))
    setUrl(initialServer.url ?? '')
    setEnvText('')
    setAuth(initialServer.auth === 'oauth' || initialServer.auth === 'header' ? initialServer.auth : 'none')
    setAuthHeaderName(initialServer.headerKeys[0] ?? 'Authorization')
    setAuthHeaderValue('')
    setPreset('')
  }, [initialServer])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit({
      name: name.trim(),
      transport,
      command: command.trim(),
      args: splitShellLike(argsText),
      url: url.trim(),
      env: envText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      auth,
      authHeaderName: authHeaderName.trim(),
      authHeaderValue: authHeaderValue.trim(),
      preset: isEdit ? undefined : preset.trim()
    })
  }

  return (
    <form className="modal manual-mcp-modal" onSubmit={handleSubmit}>
      <div className="modal-headline">
        <div>
          <h2>{isEdit ? '编辑 MCP' : '手动配置 MCP'}</h2>
          <p>{isEdit ? '修改已安装 MCP 的连接配置。保存前会自动备份 Hermes 配置，保存后自动测试连接。' : '通过 Hermes 原生命令添加 MCP，写入前会自动备份配置，成功后自动测试连接。'}</p>
        </div>
        <button type="button" className="settings-close inline" onClick={onClose} aria-label="关闭手动配置">
          <XCircle size={18} />
        </button>
      </div>
      <label>
        服务名称
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如 filesystem 或 my-mcp"
          disabled={isEdit}
        />
      </label>
      <label>
        连接方式
        <select value={transport} onChange={(event) => setTransport(event.target.value as 'stdio' | 'http' | 'sse')}>
          <option value="stdio">本机命令 stdio</option>
          <option value="http">HTTP URL</option>
          <option value="sse">SSE URL</option>
        </select>
      </label>
      {!isEdit && (
        <label>
          Hermes preset
          <input
            value={preset}
            onChange={(event) => setPreset(event.target.value)}
            placeholder="可选；对应 hermes mcp add --preset"
          />
          <span className="manual-mcp-note">填写 preset 时会优先按 Hermes 内置 preset 添加；留空则使用下面的命令或 URL。</span>
        </label>
      )}
      {transport === 'stdio' ? (
        <>
          <label>
            启动命令
            <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="npx / node / python" />
          </label>
          <label>
            参数
            <input value={argsText} onChange={(event) => setArgsText(event.target.value)} placeholder="-y @modelcontextprotocol/server-filesystem /path" />
          </label>
          <label>
            环境变量
            <textarea
              value={envText}
              onChange={(event) => setEnvText(event.target.value)}
              placeholder={isEdit ? '留空则保留原环境变量；填写 KEY=value 会替换原 env。' : 'KEY=value\nTOKEN=...'}
            />
          </label>
        </>
      ) : (
        <>
          <label>
            服务 URL
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/sse" />
          </label>
          <label>
            认证方式
            <select value={auth} onChange={(event) => setAuth(event.target.value as 'none' | 'oauth' | 'header')}>
              <option value="none">无认证</option>
              <option value="oauth">OAuth</option>
              <option value="header">Header</option>
            </select>
          </label>
          {auth === 'header' && (
            <div className="manual-mcp-grid">
              <label>
                Header 名称
                <input value={authHeaderName} onChange={(event) => setAuthHeaderName(event.target.value)} placeholder="Authorization" />
              </label>
              <label>
                Header 值
                <input
                  value={authHeaderValue}
                  onChange={(event) => setAuthHeaderValue(event.target.value)}
                  placeholder={isEdit ? '留空保留原 headers' : 'Bearer ${MY_MCP_TOKEN}'}
                />
              </label>
            </div>
          )}
          <span className="manual-mcp-note">Header 值建议写成环境变量占位符，例如 Bearer ${'{'}MY_MCP_TOKEN{'}'}；界面只回显 Header 名称，不读取密钥。</span>
        </>
      )}
      <div className="modal-actions">
        <button type="button" className="ghost-button" onClick={onClose}>取消</button>
        <button className="send-button" disabled={isSaving || !name.trim()}>
          {isSaving ? <Loader2 size={15} className="spin" /> : isEdit ? <Wrench size={15} /> : <Plus size={15} />}
          {isEdit ? '保存并测试' : '添加并测试'}
        </button>
      </div>
    </form>
  )
}

function SettingsCard({ children }: { children: ReactNode }) {
  return <div className="settings-card">{children}</div>
}

function SettingsSubtabs({
  value,
  options,
  onChange
}: {
  value: string
  options: Array<[string, string]>
  onChange: (value: string) => void
}) {
  return (
    <div className="settings-subtabs">
      {options.map(([id, label]) => (
        <button className={value === id ? 'active' : ''} key={id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function SettingsToggle({
  checked,
  disabled = false,
  onChange
}: {
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      className={checked ? 'settings-toggle active' : 'settings-toggle'}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

function McpServePanel({ status }: { status: HermesMcpServeStatus | null }) {
  const logs = status?.logs ?? []
  return (
    <div className="mcp-serve-panel">
      <div className="mcp-serve-grid">
        <div>
          <span>运行状态</span>
          <strong>{status?.running ? '运行中' : '未运行'}</strong>
        </div>
        <div>
          <span>进程 PID</span>
          <strong>{status?.pid ?? '无'}</strong>
        </div>
        <div>
          <span>启动命令</span>
          <strong>{status?.command.join(' ') ?? 'hermes mcp serve -v'}</strong>
        </div>
        <div>
          <span>工作目录</span>
          <strong>{status?.cwd ?? 'Hermes Agent 目录'}</strong>
        </div>
      </div>
      <div className="mcp-serve-note">
        <Info size={14} />
        这是 stdio MCP Server：外部 MCP Client 通常需要配置同一条启动命令，而不是连接一个 HTTP 端口。这里的启动按钮用于本机诊断和日志观察。
      </div>
      <div className="mcp-serve-logs">
        <div>
          <strong>最近日志</strong>
          <span>{logs.length ? `${logs.length} 条` : '暂无日志'}</span>
        </div>
        <pre>{logs.length ? logs.slice(-20).map((entry) => `[${entry.stream}] ${entry.text}`).join('\n') : '启动后会显示 Hermes MCP serve 的 stdout/stderr。'}</pre>
      </div>
    </div>
  )
}

function McpServerDetails({
  server,
  testResult,
  loginResult,
  isUpdatingTools,
  onSetToolSelection,
  onTest
}: {
  server: HermesMcpConfig['servers'][number]
  testResult?: HermesMcpTestResult
  loginResult?: HermesMcpLoginResult
  isUpdatingTools: boolean
  onSetToolSelection: (mode: 'all' | 'include' | 'exclude', tools: string[]) => void
  onTest: () => void
}) {
  const tools = testResult?.tools ?? []
  const toolNames = tools.map((tool) => tool.name)
  const activeToolNames = selectedMcpToolNames(server, toolNames)

  function updateTool(toolName: string, enabled: boolean) {
    const next = new Set(activeToolNames)
    if (enabled) next.add(toolName)
    else next.delete(toolName)
    if (next.size === 0) return
    onSetToolSelection('include', [...next])
  }

  return (
    <div className="mcp-server-details">
      <InfoGrid items={[
        ['功能描述', server.description || inferMcpDescription(server)],
        ['传输方式', mcpTransportLabel(server.transport)],
        ['启动命令', server.command ?? server.url ?? '未配置'],
        ['命令参数', server.args.length ? server.args.join(' ') : '无'],
        ['认证方式', mcpAuthLabel(server)],
        ['请求 Header', server.headerKeys.length ? `${server.headerKeys.join(', ')}（值已隐藏）` : '无'],
        ['环境变量', server.envKeys.length ? `${server.envKeys.join(', ')}（值已隐藏）` : '无'],
        ['工具范围', mcpToolModeLabel(server.toolMode)],
        ['启用状态', server.enabled ? '已启用' : '已停用']
      ]} />
      {loginResult && (
        <div className={loginResult.ok ? 'mcp-login-result ok' : 'mcp-login-result failed'}>
          <div>
            <strong>{loginResult.ok ? '授权完成' : '授权失败'}</strong>
            <span>{loginResult.elapsedMs}ms · {new Date(loginResult.loggedInAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <pre>{loginResult.output || loginResult.error || 'Hermes 没有返回 OAuth 登录输出。'}</pre>
        </div>
      )}
      {testResult && (
        <div className={testResult.ok ? 'mcp-test-result ok' : 'mcp-test-result failed'}>
          <div>
            <strong>{testResult.ok ? '连接成功' : '连接失败'}</strong>
            <span>
              {testResult.elapsedMs}ms
              {typeof testResult.toolCount === 'number' ? ` · ${testResult.toolCount} 个工具` : ''}
            </span>
          </div>
          <pre>{testResult.output || testResult.error || 'Hermes 没有返回测试输出。'}</pre>
          {testResult.tools?.length ? (
            <div className="mcp-tool-list">
              <div className="mcp-tool-list-head">
                <div>
                  <strong>发现的工具</strong>
                  <span>对应 Hermes 的 tools.include / tools.exclude 配置，新会话生效。</span>
                </div>
                <div className="mcp-tool-actions">
                  {isUpdatingTools && <Loader2 size={13} className="spin" />}
                  <button
                    className="settings-test-button"
                    onClick={() => onSetToolSelection('all', [])}
                    disabled={isUpdatingTools || activeToolNames.length === toolNames.length}
                  >
                    全部启用
                  </button>
                  <button
                    className="settings-test-button"
                    onClick={() => onSetToolSelection('include', activeToolNames)}
                    disabled={isUpdatingTools || activeToolNames.length === toolNames.length}
                  >
                    保存选择
                  </button>
                </div>
              </div>
              {testResult.tools.map((tool) => (
                <div className="mcp-tool-row" key={tool.name}>
                  <SettingsToggle
                    checked={activeToolNames.includes(tool.name)}
                    disabled={isUpdatingTools || (activeToolNames.length === 1 && activeToolNames.includes(tool.name))}
                    onChange={(checked) => updateTool(tool.name, checked)}
                  />
                  <code>{tool.name}</code>
                  <em>{tool.description}</em>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {!testResult && (
        <div className="mcp-tool-empty">
          <span>先测试一次 MCP，Hermes Cowork 会读取服务返回的工具列表，然后就可以逐个开关。</span>
          <button className="settings-test-button" onClick={onTest}>
            <Play size={13} />
            测试并发现工具
          </button>
        </div>
      )}
    </div>
  )
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="settings-info-grid">
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  )
}

function McpIcon({ name, iconUrl }: { name: string; iconUrl?: string }) {
  return (
    <span className="mcp-logo">
      {iconUrl && (
        <img
          src={iconUrl}
          alt=""
          onError={(event) => {
            event.currentTarget.style.display = 'none'
            const fallback = event.currentTarget.nextElementSibling
            if (fallback instanceof HTMLElement) fallback.hidden = false
          }}
        />
      )}
      <span hidden={Boolean(iconUrl)}>{mcpLogo(name)}</span>
    </span>
  )
}

function mcpLogo(name: string) {
  return name
    .split(/[-_\s]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2) || 'M'
}

function mcpServerSummary(server: HermesMcpConfig['servers'][number]) {
  const issues = server.issues.length ? ` · ${server.issues.join('、')}` : ''
  return `${server.description || inferMcpDescription(server)}${issues}`
}

function inferMcpDescription(server: HermesMcpConfig['servers'][number]) {
  const text = `${server.name} ${server.command ?? ''} ${server.args.join(' ')} ${server.url ?? ''}`.toLowerCase()
  if (text.includes('csv') || text.includes('excel') || text.includes('spreadsheet')) {
    return '表格分析能力：读取 CSV/表格文件，做字段识别、数据清洗、统计汇总和分析输出。'
  }
  if (text.includes('sqlite')) {
    return 'SQLite 数据库能力：查询和维护本机 SQLite 数据库，适合轻量数据分析。'
  }
  if (text.includes('vision') || text.includes('image') || text.includes('ocr')) {
    return '视觉理解能力：读取图片、截图或视觉素材，提取文字、结构和关键信息。'
  }
  if (text.includes('web-search') || text.includes('search')) {
    return '网页调研能力：联网搜索资料、读取网页结果，并把来源整理给 Hermes 使用。'
  }
  if (text.includes('lark') || text.includes('feishu')) {
    return '飞书工作流能力：连接云文档、消息、日历、审批等飞书工具，支撑办公自动化。'
  }
  return '本机 MCP 服务：为 Hermes 增加可调用的扩展工具能力。'
}

function selectedMcpToolNames(server: HermesMcpConfig['servers'][number], toolNames: string[]) {
  if (!toolNames.length) return []
  if (server.includeTools.length) {
    const include = new Set(server.includeTools)
    return toolNames.filter((name) => include.has(name))
  }
  if (server.excludeTools.length) {
    const exclude = new Set(server.excludeTools)
    return toolNames.filter((name) => !exclude.has(name))
  }
  return toolNames
}

function mcpTransportLabel(value: HermesMcpConfig['servers'][number]['transport']) {
  if (value === 'stdio') return '标准输入输出'
  if (value === 'http') return 'HTTP'
  if (value === 'sse') return 'SSE'
  return '未知传输'
}

function mcpAuthLabel(server: HermesMcpConfig['servers'][number]) {
  if (server.auth === 'oauth') return 'OAuth'
  if (server.auth === 'header') return server.headerKeys.length ? `Header：${server.headerKeys.join(', ')}` : 'Header'
  if (server.auth === 'unknown') return '未知认证'
  return '无认证'
}

function mcpToolModeLabel(value: string) {
  if (value === 'all') return '全部工具'
  if (value.endsWith(' selected')) return `${value.replace(' selected', '')} 个已选择工具`
  if (value.endsWith(' excluded')) return `${value.replace(' excluded', '')} 个已排除工具`
  return value
}

function splitShellLike(value: string) {
  return value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((part) => part.replace(/^['"]|['"]$/g, '')) ?? []
}
