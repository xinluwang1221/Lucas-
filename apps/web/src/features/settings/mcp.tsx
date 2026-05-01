import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Info,
  Loader2,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Square,
  Trash2,
  Wrench,
  XCircle
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  installHermesMcpServer,
  searchHermesMcpMarketplace
} from './mcpApi'
import {
  type BackgroundServiceStatus,
  type HermesMcpConfig,
  type HermesMcpInstallResult,
  type HermesMcpManualConfigRequest,
  type HermesMcpMarketplaceCandidate,
  type HermesMcpRecommendations,
  type HermesMcpServeStatus,
  type HermesMcpTestResult
} from '../../lib/api'

export type McpScope = 'local' | 'serve' | 'recommendations' | 'cloud'

export function ConnectorsView({
  connectors,
  configPath,
  error,
  onOpenSettings
}: {
  connectors: HermesMcpConfig['servers']
  configPath?: string
  error: string | null
  onOpenSettings: () => void
}) {
  const enabledCount = connectors.filter((connector) => connector.enabled).length

  return (
    <div className="connectors-panel">
      <div className="connector-summary">
        <div>
          <strong>{connectors.length}</strong>
          <span>已安装连接器</span>
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

      {error && <div className="settings-error-line">{error}</div>}

      <div className="connector-list">
        {!connectors.length && <p className="muted-copy">暂未读取到 MCP 连接器。可以从市场添加，或在设置里手动配置。</p>}
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
              <p>{connector.description || connector.command || connector.url || '这个连接器来自 Hermes MCP 配置。'}</p>
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

export function McpSettingsSection({
  mcpScope,
  hermesMcp,
  mcpError,
  mcpTestResults,
  mcpTestingId,
  mcpUpdatingId,
  mcpDeletingId,
  mcpToolUpdatingId,
  mcpRecommendations,
  mcpRecommendationsLoading,
  mcpRecommendationsError,
  backgroundStatus,
  backgroundUpdating,
  backgroundError,
  mcpServeStatus,
  mcpServeUpdating,
  mcpServeError,
  onMcpScopeChange,
  onToggleMcpServer,
  onRefreshMcp,
  onTestMcpServer,
  onEditMcpServer,
  onSetMcpToolSelection,
  onDeleteMcpServer,
  onOpenMcpMarketplace,
  onOpenManualMcp,
  onRefreshMcpRecommendationsWithAi,
  onToggleBackgroundServices,
  onToggleMcpServe,
  onRefreshMcpServe
}: {
  mcpScope: McpScope
  hermesMcp: HermesMcpConfig | null
  mcpError: string | null
  mcpTestResults: Record<string, HermesMcpTestResult>
  mcpTestingId: string | null
  mcpUpdatingId: string | null
  mcpDeletingId: string | null
  mcpToolUpdatingId: string | null
  mcpRecommendations: HermesMcpRecommendations | null
  mcpRecommendationsLoading: boolean
  mcpRecommendationsError: string | null
  backgroundStatus: BackgroundServiceStatus | null
  backgroundUpdating: boolean
  backgroundError: string | null
  mcpServeStatus: HermesMcpServeStatus | null
  mcpServeUpdating: boolean
  mcpServeError: string | null
  onMcpScopeChange: (value: McpScope) => void
  onToggleMcpServer: (serverId: string, enabled: boolean) => void
  onRefreshMcp: () => void
  onTestMcpServer: (serverId: string) => void
  onEditMcpServer: (server: HermesMcpConfig['servers'][number]) => void
  onSetMcpToolSelection: (serverId: string, mode: 'all' | 'include' | 'exclude', tools: string[]) => void
  onDeleteMcpServer: (serverId: string) => void
  onOpenMcpMarketplace: () => void
  onOpenManualMcp: () => void
  onRefreshMcpRecommendationsWithAi: () => void
  onToggleBackgroundServices: (enabled: boolean) => void
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
        options={[['local', '本地服务'], ['serve', 'Hermes Server'], ['recommendations', '每日推荐'], ['cloud', '云端']]}
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
                  <button onClick={onOpenMcpMarketplace}>从市场添加</button>
                  <button onClick={onOpenManualMcp}>手动配置</button>
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

      {mcpScope === 'recommendations' && (
        <SettingsCard>
          <div className="settings-card-header">
            <div>
              <strong>每日 MCP 推荐日报</strong>
              <span>每天 00:10 后由 Hermes 复盘当天任务和卡点，推荐内容统一进入 MCP 市场。</span>
            </div>
            <div className="settings-card-actions">
              <button className="dark-mini-button" onClick={onRefreshMcpRecommendationsWithAi} disabled={mcpRecommendationsLoading}>
                {mcpRecommendationsLoading ? <Loader2 size={13} className="spin" /> : <Bot size={13} />}
                生成日报
              </button>
            </div>
          </div>
          {mcpRecommendationsError && <div className="settings-error-line">{mcpRecommendationsError}</div>}
          <div className="mcp-daily-report">
            <div>
              <strong>{mcpRecommendations?.generatedAt ? `日报 ${formatMaybeDate(mcpRecommendations.generatedAt)}` : '暂无推荐日报'}</strong>
              <span>{mcpRecommendations?.aiSummary || mcpRecommendations?.sourceSummary || '生成后会在这里显示 Hermes 的复盘摘要。'}</span>
            </div>
            <button className="settings-link-button" onClick={onOpenMcpMarketplace}>去市场查看推荐</button>
          </div>
          <div className="mcp-daily-permission">
            <div>
              <strong>允许后台每日生成</strong>
              <span>开启后，macOS 登录时启动 Hermes Cowork 后台，并在每天 00:10 调用 Hermes 生成推荐日报。</span>
            </div>
            <SettingsToggle checked={Boolean(backgroundStatus?.api.loaded && backgroundStatus.dailyMcp.loaded)} disabled={backgroundUpdating} onChange={onToggleBackgroundServices} />
          </div>
          {backgroundError && <div className="settings-error-line">{backgroundError}</div>}
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

export function McpMarketplaceModal({
  onClose,
  onInstalled,
  recommendations
}: {
  onClose: () => void
  onInstalled: (result: HermesMcpInstallResult) => void
  recommendations: HermesMcpRecommendations | null
}) {
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<HermesMcpMarketplaceCandidate[]>([])
  const [selected, setSelected] = useState<HermesMcpMarketplaceCandidate | null>(null)
  const [marketMode, setMarketMode] = useState<'recommended' | 'search'>(recommendations?.categories.length ? 'recommended' : 'search')
  const [isLoading, setIsLoading] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installResult, setInstallResult] = useState<HermesMcpInstallResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recommendedCandidates = useMemo(
    () => (recommendations?.categories ?? []).flatMap((group) => group.candidates),
    [recommendations]
  )
  const visibleCandidates = marketMode === 'recommended' ? recommendedCandidates : candidates

  async function runSearch(nextQuery = query) {
    setIsLoading(true)
    setError(null)
    setMarketMode('search')
    try {
      const response = await searchHermesMcpMarketplace(nextQuery)
      setCandidates(response.candidates)
      setSelected(response.candidates[0] ?? null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setCandidates([])
      setSelected(null)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleInstall(candidate: HermesMcpMarketplaceCandidate) {
    setInstallingId(candidate.id)
    setError(null)
    setInstallResult(null)
    try {
      const result = await installHermesMcpServer(candidate)
      setInstallResult(result)
      onInstalled(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setInstallingId(null)
    }
  }

  useEffect(() => {
    if (recommendedCandidates.length) {
      setMarketMode('recommended')
      setSelected(recommendedCandidates[0] ?? null)
    } else {
      void runSearch('')
    }
  }, [recommendedCandidates.length])

  return (
    <div className="mcp-marketplace-modal">
      <div className="marketplace-head">
        <div>
          <h2>MCP 市场</h2>
          <p>推荐内容来自每日 MCP 日报；也可以手动搜索 GitHub 上的 MCP 服务。</p>
        </div>
        <button className="settings-close inline" onClick={onClose} aria-label="关闭 MCP 市场">
          <XCircle size={18} />
        </button>
      </div>
      <div className="marketplace-tabs">
        <button
          className={marketMode === 'recommended' ? 'active' : ''}
          disabled={!recommendedCandidates.length}
          onClick={() => {
            setMarketMode('recommended')
            setSelected(recommendedCandidates[0] ?? null)
          }}
        >
          每日推荐
        </button>
        <button
          className={marketMode === 'search' ? 'active' : ''}
          onClick={() => {
            setMarketMode('search')
            setSelected(candidates[0] ?? null)
          }}
        >
          搜索市场
        </button>
      </div>
      <form
        className="marketplace-search"
        onSubmit={(event) => {
          event.preventDefault()
          void runSearch()
        }}
      >
        <Search size={15} />
        <input value={query} placeholder="搜索 GitHub MCP 服务" onChange={(event) => setQuery(event.target.value)} />
        <button disabled={isLoading}>{isLoading ? <Loader2 size={14} className="spin" /> : '搜索'}</button>
      </form>
      {error && <div className="settings-error-line">{error}</div>}
      <div className="marketplace-body">
        <div className="marketplace-list">
          {marketMode === 'recommended' && recommendations?.aiSummary && (
            <div className="marketplace-daily-report">
              <strong>推荐日报</strong>
              <span>{recommendations.aiSummary}</span>
            </div>
          )}
          {isLoading && <div className="mcp-empty-state">正在从 GitHub 搜索 MCP 服务...</div>}
          {!isLoading && visibleCandidates.length === 0 && !error && (
            <div className="mcp-empty-state">
              {marketMode === 'recommended' ? '暂无每日推荐。请先在设置页生成日报。' : '没有找到匹配的 MCP 服务。'}
            </div>
          )}
          {visibleCandidates.map((candidate) => (
            <button
              className={selected?.id === candidate.id ? 'marketplace-item active' : 'marketplace-item'}
              key={candidate.id}
              onClick={() => setSelected(candidate)}
            >
              <McpIcon name={candidate.name} iconUrl={candidate.iconUrl} />
              <div>
                <strong>{candidate.name}</strong>
                <p>{candidate.description}</p>
                <small>{candidate.categoryLabel} · {candidate.repo} · {languageLabel(candidate.language)} · {candidate.stars} 个星标</small>
              </div>
              <Plus size={15} />
            </button>
          ))}
        </div>
        <div className="marketplace-detail">
          {selected ? (
            <>
              <div className="marketplace-detail-title">
                <strong>{selected.name}</strong>
                <a href={selected.url} target="_blank" rel="noreferrer">
                  查看仓库
                  <ExternalLink size={13} />
                </a>
              </div>
              <p>{selected.description}</p>
              <InfoGrid items={[
                ['配置名', selected.installName],
                ['语言', languageLabel(selected.language)],
                ['星标', String(selected.stars)],
                ['命令置信度', confidenceLabel(selected.confidence)],
                ['仓库说明', selected.sourceDescription]
              ]} />
              <div className="marketplace-command">
                <span>推荐的 Hermes 命令</span>
                <pre>{marketplaceCommand(selected)}</pre>
              </div>
              <div className="marketplace-safety">
                <Shield size={15} />
                <span>安装会写入 Hermes 本机配置，并在写入前自动备份 `config.yaml`。MCP 会在本机执行上面的启动命令。</span>
              </div>
              <div className="marketplace-note">
                安装后会立即调用 Hermes 原生测试，确认连接状态和工具发现结果。
              </div>
              {installResult?.installName === selected.installName && (
                <div className={installResult.testResult?.ok ? 'mcp-test-result ok' : 'mcp-test-result failed'}>
                  <div>
                    <strong>{installResult.testResult?.ok ? '安装并测试成功' : '已安装，测试未通过'}</strong>
                    <span>
                      {installResult.testResult
                        ? `${installResult.testResult.elapsedMs}ms${typeof installResult.testResult.toolCount === 'number' ? ` · ${installResult.testResult.toolCount} 个工具` : ''}`
                        : '等待测试结果'}
                    </span>
                  </div>
                  <pre>{installResult.testResult?.output || installResult.output || 'Hermes 没有返回安装输出。'}</pre>
                </div>
              )}
              <button
                className="marketplace-install-button"
                disabled={installingId === selected.id || !selected.suggestedCommand}
                onClick={() => void handleInstall(selected)}
              >
                {installingId === selected.id ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
                {selected.suggestedCommand ? '安装到 Hermes' : '需要手动配置'}
              </button>
            </>
          ) : (
            <div className="mcp-empty-state">选择一个 MCP 服务查看安装建议。</div>
          )}
        </div>
      </div>
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

export function formatMaybeDate(value?: string) {
  if (!value) return '待生成'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '待生成'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
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
  isUpdatingTools,
  onSetToolSelection,
  onTest
}: {
  server: HermesMcpConfig['servers'][number]
  testResult?: HermesMcpTestResult
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

function marketplaceCommand(candidate: HermesMcpMarketplaceCandidate) {
  if (!candidate.suggestedCommand) {
    return `hermes mcp add ${candidate.installName} --command <cmd> --args <args...>`
  }
  return `hermes mcp add ${candidate.installName} --command ${candidate.suggestedCommand} --args ${candidate.suggestedArgs.join(' ')}`
}

function splitShellLike(value: string) {
  return value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((part) => part.replace(/^['"]|['"]$/g, '')) ?? []
}

function languageLabel(value: string) {
  return value && value !== 'unknown' ? value : '未知语言'
}

function confidenceLabel(value: HermesMcpMarketplaceCandidate['confidence']) {
  if (value === 'high') return '高'
  if (value === 'medium') return '中'
  return '低，需要人工确认'
}
