import {
  BookOpen,
  Brain,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  HelpCircle,
  Image,
  Layers3,
  Loader2,
  MessageSquare,
  Monitor,
  PauseCircle,
  Plug,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  Volume2,
  Wrench
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { HermesMcpConfig, HermesToolset, Skill, SkillHubItem, SkillHubSource } from '../../lib/api'
import { ConnectorsView as McpConnectorsView } from '../settings/mcp'
import { shortenSkillPath, sourceLabel } from './skillFormatters'
import { installSkillFromHub, searchSkillHub } from './skillsApi'

type CustomizeTab = 'skills' | 'connectors' | 'toolsets'

export function SkillsView({
  skills,
  customizeTab,
  tab,
  query,
  notice,
  connectors,
  toolsets,
  toolsetsError,
  toolsetUpdatingName,
  mcpConfigPath,
  mcpError,
  onCustomizeTabChange,
  onTabChange,
  onQueryChange,
  onToggleSkill,
  onOpenSkill,
  onRefresh,
  onUploadClick,
  onRefreshMcp,
  onRefreshToolsets,
  onToggleToolset,
  onOpenMcpSettings,
  onOpenNativeMcpAdd
}: {
  skills: Skill[]
  customizeTab: CustomizeTab
  tab: 'market' | 'installed'
  query: string
  notice: string | null
  connectors: HermesMcpConfig['servers']
  toolsets: HermesToolset[]
  toolsetsError: string | null
  toolsetUpdatingName: string | null
  mcpConfigPath?: string
  mcpError: string | null
  onCustomizeTabChange: (tab: CustomizeTab) => void
  onTabChange: (tab: 'market' | 'installed') => void
  onQueryChange: (value: string) => void
  onToggleSkill: (skill: Skill) => void
  onOpenSkill: (skill: Skill) => void
  onRefresh: () => void | Promise<void>
  onUploadClick: () => void
  onRefreshMcp: () => void
  onRefreshToolsets: () => void
  onToggleToolset: (toolset: HermesToolset) => void
  onOpenMcpSettings: () => void
  onOpenNativeMcpAdd: () => void
}) {
  const normalizedQuery = query.trim().toLowerCase()
  const enabledSkills = skills.filter((skill) => skill.enabled)
  const activeSkills = (tab === 'installed' ? enabledSkills : skills).filter((skill) => {
    if (!normalizedQuery) return true
    return `${skill.name} ${skill.description} ${skill.source} ${skill.path}`.toLowerCase().includes(normalizedQuery)
  })
  const enabledCount = enabledSkills.length
  const disabledCount = Math.max(0, skills.length - enabledCount)
  const installedSkillNames = useMemo(() => new Set(skills.map((skill) => skill.name.toLowerCase())), [skills])
  const [hubSource, setHubSource] = useState<SkillHubSource>('all')
  const [hubResult, setHubResult] = useState<Awaited<ReturnType<typeof searchSkillHub>> | null>(null)
  const [hubLoading, setHubLoading] = useState(false)
  const [hubError, setHubError] = useState<string | null>(null)
  const [hubInstallingId, setHubInstallingId] = useState<string | null>(null)
  const [hubNotice, setHubNotice] = useState<string | null>(null)
  const enabledToolsets = toolsets.filter((toolset) => toolset.enabled)
  const unconfiguredEnabledToolsets = enabledToolsets.filter((toolset) => !toolset.configured)
  const enabledConnectors = connectors.filter((connector) => connector.enabled)
  const incompleteConnectors = connectors.filter((connector) => connector.status !== 'configured')
  const filteredToolsets = toolsets.filter((toolset) => {
    if (!normalizedQuery) return true
    return `${toolset.name} ${toolset.label} ${toolset.description} ${toolset.tools.join(' ')}`.toLowerCase().includes(normalizedQuery)
  })
  const sections = [
    {
      title: 'Hermes 官方',
      skills: activeSkills.filter((skill) => skill.source === 'hermes')
    },
    {
      title: '插件与系统',
      skills: activeSkills.filter((skill) => skill.source === 'plugin' || skill.source === 'system')
    },
    {
      title: '来自用户',
      skills: activeSkills.filter((skill) => skill.source === 'user' || skill.source === 'uploaded')
    }
  ].filter((section) => section.skills.length)
  const toolsetSections = groupToolsets(filteredToolsets)
  const pageTitle = customizeTab === 'skills' ? '技能' : customizeTab === 'toolsets' ? '工具集' : 'MCP 服务'
  const pageDescription = customizeTab === 'skills'
    ? '管理 Hermes 的工作方法。Skill 会影响 Hermes 读题、拆解任务和执行时采用的方法。'
    : customizeTab === 'toolsets'
      ? '管理 Hermes 内置工具集。这里决定 Hermes 能不能查网页、读写文件、运行命令、反问澄清或执行定时任务。'
      : '管理 Hermes 可调用的 MCP 服务，把本机文件、浏览器、飞书和数据工具连接进任务。'
  const capabilityItems = [
    {
      id: 'skills' as const,
      title: '工作方法',
      label: 'Skill',
      icon: BookOpen,
      count: enabledCount,
      total: skills.length,
      status: enabledCount ? '正常' : '未启用',
      tone: enabledCount ? 'ready' : 'idle',
      detail: '影响 Hermes 如何理解任务、拆解步骤和复用固定流程。'
    },
    {
      id: 'connectors' as const,
      title: '外部服务',
      label: 'MCP',
      icon: Plug,
      count: enabledConnectors.length,
      total: connectors.length,
      status: connectors.length === 0 ? '待同步' : incompleteConnectors.length ? `${incompleteConnectors.length} 个需补全` : enabledConnectors.length ? '正常' : '未启用',
      tone: connectors.length === 0 ? 'idle' : incompleteConnectors.length ? 'warning' : enabledConnectors.length ? 'ready' : 'idle',
      detail: '把数据库、浏览器、飞书和外部工具连接给 Hermes 使用。'
    },
    {
      id: 'toolsets' as const,
      title: '内置工具',
      label: 'Toolsets',
      icon: Wrench,
      count: enabledToolsets.length,
      total: toolsets.length,
      status: toolsets.length === 0 ? '待同步' : unconfiguredEnabledToolsets.length ? `${unconfiguredEnabledToolsets.length} 个需配置` : enabledToolsets.length ? '正常' : '未启用',
      tone: toolsets.length === 0 ? 'idle' : unconfiguredEnabledToolsets.length ? 'warning' : enabledToolsets.length ? 'ready' : 'idle',
      detail: '控制网页、文件、终端、反问、历史搜索和定时任务等基础能力。'
    }
  ]
  const capabilityAction = capabilityItems.find((item) => item.tone === 'warning')
    ?? capabilityItems.find((item) => item.tone === 'idle')
    ?? capabilityItems.find((item) => item.id === customizeTab)

  useEffect(() => {
    if (customizeTab !== 'skills') return
    let alive = true
    const timer = window.setTimeout(() => {
      setHubLoading(true)
      setHubError(null)
      searchSkillHub({
        query,
        source: hubSource,
        pageSize: query.trim() ? 12 : 18
      }).then((result) => {
        if (!alive) return
        setHubResult(result)
      }).catch((error) => {
        if (!alive) return
        setHubError(error instanceof Error ? error.message : String(error))
      }).finally(() => {
        if (alive) setHubLoading(false)
      })
    }, 260)

    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [customizeTab, hubSource, query])

  async function handleInstallHubSkill(item: SkillHubItem) {
    const installed = installedSkillNames.has(item.name.toLowerCase())
    if (installed) return
    const confirmed = window.confirm(`安装 Skill「${item.name}」到 Hermes 本机技能目录？\n\n来源：${hubSourceLabel(item.source)}\n标识：${item.identifier}`)
    if (!confirmed) return

    try {
      setHubInstallingId(item.identifier)
      setHubError(null)
      const result = await installSkillFromHub(item.identifier)
      setHubNotice(`已通过 Hermes Skills Hub 安装 ${item.name}。`)
      if (result.skills?.length) {
        await onRefresh()
      }
    } catch (error) {
      setHubError(error instanceof Error ? error.message : String(error))
    } finally {
      setHubInstallingId(null)
    }
  }

  return (
    <section className="customize-page">
      <aside className="customize-sidebar">
        <button className={customizeTab === 'skills' ? 'active' : ''} onClick={() => onCustomizeTabChange('skills')}>
          <BookOpen size={15} />
          技能
        </button>
        <button className={customizeTab === 'connectors' ? 'active' : ''} onClick={() => onCustomizeTabChange('connectors')}>
          <Plug size={15} />
          MCP 服务
        </button>
        <button className={customizeTab === 'toolsets' ? 'active' : ''} onClick={() => onCustomizeTabChange('toolsets')}>
          <Wrench size={15} />
          工具集
        </button>
        <div className="customize-plugin-box">
          <strong>下一步</strong>
          <span>{capabilityAction ? abilityActionText(capabilityAction) : '当前能力状态正常，可以继续使用。'}</span>
        </div>
      </aside>

      <div className="customize-content">
        <div className="skills-actions">
          {customizeTab === 'skills' && (
            <>
              <button className="ghost-button" onClick={onRefresh}>
                <RefreshCw size={15} />
                刷新
              </button>
              <button className="send-button" onClick={onUploadClick}>
                <Plus size={16} />
                上传技能
              </button>
            </>
          )}
          {customizeTab === 'connectors' && (
            <>
              <button className="ghost-button" onClick={onRefreshMcp}>
                <RefreshCw size={15} />
                刷新
              </button>
              <button className="send-button" onClick={onOpenNativeMcpAdd}>
                <Plus size={16} />
                添加 MCP
              </button>
            </>
          )}
          {customizeTab === 'toolsets' && (
            <button className="ghost-button" onClick={onRefreshToolsets}>
              <RefreshCw size={15} />
              刷新
            </button>
          )}
        </div>

        <header className="skills-hero">
          <h1>{pageTitle}</h1>
          <p>{pageDescription}</p>
        </header>

        <div className="capability-overview-head">
          <strong>能力中心</strong>
          <span>Skill、MCP、Toolsets 的真实启用状态。</span>
        </div>
        <div className="capability-overview" aria-label="Hermes 能力中心">
          {capabilityItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={customizeTab === item.id ? `capability-card ${item.tone} active` : `capability-card ${item.tone}`}
                onClick={() => onCustomizeTabChange(item.id)}
              >
                <span className="capability-icon"><Icon size={18} /></span>
                <span className="capability-body">
                  <span className="capability-title">{item.title}<em>{item.label}</em></span>
                  <strong>{item.total ? item.count : '待同步'}{item.total ? <small> / {item.total}</small> : null}</strong>
                  <span className="capability-detail">{item.detail}</span>
                </span>
                <span className="capability-state">{item.status}</span>
              </button>
            )
          })}
        </div>

        {customizeTab === 'skills' ? (
          <>
            {(notice || hubNotice) && <div className="skill-notice">{notice || hubNotice}</div>}

            <div className="skills-summary">
              <div className="skills-summary-card">
                <span className="skills-summary-icon enabled"><CheckCircle2 size={20} /></span>
                <div>
                  <span>已启用</span>
                  <strong>{enabledCount}</strong>
                  <small>个技能</small>
                </div>
              </div>
              <div className="skills-summary-card">
                <span className="skills-summary-icon local"><Monitor size={20} /></span>
                <div>
                  <span>本机可用</span>
                  <strong>{skills.length}</strong>
                  <small>个技能</small>
                </div>
              </div>
              <div className="skills-summary-card">
                <span className="skills-summary-icon disabled"><PauseCircle size={20} /></span>
                <div>
                  <span>未启用</span>
                  <strong>{disabledCount}</strong>
                  <small>个技能</small>
                </div>
              </div>
            </div>

            <SkillHubPanel
              result={hubResult}
              loading={hubLoading}
              error={hubError}
              source={hubSource}
              installedNames={installedSkillNames}
              installingId={hubInstallingId}
              onSourceChange={(nextSource) => {
                setHubSource(nextSource)
                setHubNotice(null)
              }}
              onInstall={(item) => void handleInstallHubSkill(item)}
            />

            <div className="skills-toolbar">
              <div className="skills-tabs" role="tablist" aria-label="技能视图">
                <button className={tab === 'market' ? 'active' : ''} onClick={() => onTabChange('market')}>
                  全部 <span>{skills.length}</span>
                </button>
                <button className={tab === 'installed' ? 'active' : ''} onClick={() => onTabChange('installed')}>
                  已启用 <span>{enabledCount}</span>
                </button>
              </div>
              <label className="skills-search">
                <Search size={15} />
                <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索技能" />
              </label>
            </div>

            <div className="skills-content">
              {!activeSkills.length && <p className="muted-copy">没有匹配的技能。</p>}
              {sections.map((section) => (
                <section className="skill-section" key={section.title}>
                  <h2>{section.title}</h2>
                  <div className="skill-grid">
                    {section.skills.map((skill) => (
                      <article className={skill.enabled ? 'skill-card enabled' : 'skill-card'} key={skill.id}>
                        <button className="skill-open" onClick={() => onOpenSkill(skill)}>
                          <div className={`skill-icon ${skill.source}`}>
                            <BookOpen size={23} />
                          </div>
                          <div className="skill-card-body">
                            <div className="skill-card-head">
                              <strong>{skill.name}</strong>
                              <span>{sourceLabel(skill.source)}</span>
                            </div>
                            <p>{skill.description}</p>
                            <small title={skill.path}>{shortenSkillPath(skill.path)}</small>
                          </div>
                        </button>
                        <button
                          className={skill.enabled ? 'skill-switch enabled' : 'skill-switch'}
                          aria-label={`${skill.enabled ? '停用' : '启用'} ${skill.name}`}
                          aria-pressed={skill.enabled}
                          onClick={() => onToggleSkill(skill)}
                        >
                          <span />
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        ) : customizeTab === 'toolsets' ? (
          <>
            {toolsetsError && <div className="settings-error-line">{toolsetsError}</div>}

            <div className="skills-summary">
              <div className="skills-summary-card">
                <span className="skills-summary-icon enabled"><CheckCircle2 size={20} /></span>
                <div>
                  <span>已启用</span>
                  <strong>{enabledToolsets.length}</strong>
                  <small>个工具集</small>
                </div>
              </div>
              <div className="skills-summary-card">
                <span className="skills-summary-icon local"><Wrench size={20} /></span>
                <div>
                  <span>Hermes 可用</span>
                  <strong>{toolsets.length}</strong>
                  <small>个工具集</small>
                </div>
              </div>
              <div className="skills-summary-card">
                <span className="skills-summary-icon disabled"><PauseCircle size={20} /></span>
                <div>
                  <span>需要配置</span>
                  <strong>{unconfiguredEnabledToolsets.length}</strong>
                  <small>个已启用工具集</small>
                </div>
              </div>
            </div>

            <div className="skills-toolbar toolset-toolbar">
              <div className="toolset-status-tabs" aria-label="工具集状态">
                <span>全部 <strong>{toolsets.length}</strong></span>
                <span>已启用 <strong>{enabledToolsets.length}</strong></span>
              </div>
              <label className="skills-search">
                <Search size={15} />
                <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索工具集或工具名称" />
              </label>
            </div>

            <div className="toolset-content">
              {!filteredToolsets.length && <p className="muted-copy">没有匹配的工具集。</p>}
              {toolsetSections.map((section) => (
                <section className="skill-section" key={section.title}>
                  <h2>{section.title}</h2>
                  <div className="toolset-grid">
                    {section.toolsets.map((toolset) => {
                      const Icon = toolsetIcon(toolset.name)
                      const isUpdating = toolsetUpdatingName === toolset.name
                      return (
                        <article className={toolset.enabled ? 'toolset-card enabled' : 'toolset-card'} key={toolset.name}>
                          <div className="toolset-card-main">
                            <div className="toolset-icon">
                              <Icon size={20} />
                            </div>
                            <div className="toolset-body">
                              <div className="toolset-head">
                                <strong>{toolsetTitle(toolset)}</strong>
                                <span>{toolset.name}</span>
                              </div>
                              <p>{toolsetDescription(toolset)}</p>
                              <div className="toolset-meta">
                                <em className={toolset.enabled ? 'ready' : ''}>{toolset.enabled ? '已启用' : '未启用'}</em>
                                {!toolset.configured && <em className="warning">需要配置凭据</em>}
                                <em>{toolset.tools.length} 个工具</em>
                              </div>
                            </div>
                          </div>
                          <div className="toolset-tools">
                            {toolset.tools.slice(0, 8).map((tool) => <span key={tool}>{tool}</span>)}
                            {toolset.tools.length > 8 && <span>+{toolset.tools.length - 8}</span>}
                          </div>
                          <button
                            className={toolset.enabled ? 'skill-switch enabled' : 'skill-switch'}
                            aria-label={`${toolset.enabled ? '停用' : '启用'} ${toolsetTitle(toolset)}`}
                            aria-pressed={toolset.enabled}
                            disabled={isUpdating}
                            onClick={() => onToggleToolset(toolset)}
                          >
                            {isUpdating ? <Loader2 size={14} className="spin" /> : <span />}
                          </button>
                        </article>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        ) : (
          <McpConnectorsView
            connectors={connectors}
            configPath={mcpConfigPath}
            error={mcpError}
            onOpenSettings={onOpenMcpSettings}
            onOpenNativeAdd={onOpenNativeMcpAdd}
          />
        )}
      </div>
    </section>
  )
}

const skillHubSources: Array<{ id: SkillHubSource; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'official', label: '官方' },
  { id: 'skills-sh', label: 'skills.sh' },
  { id: 'well-known', label: 'Well-known' },
  { id: 'github', label: 'GitHub' },
  { id: 'clawhub', label: 'ClawHub' },
  { id: 'lobehub', label: 'LobeHub' }
]

function SkillHubPanel({
  result,
  loading,
  error,
  source,
  installedNames,
  installingId,
  onSourceChange,
  onInstall
}: {
  result: Awaited<ReturnType<typeof searchSkillHub>> | null
  loading: boolean
  error: string | null
  source: SkillHubSource
  installedNames: Set<string>
  installingId: string | null
  onSourceChange: (source: SkillHubSource) => void
  onInstall: (item: SkillHubItem) => void
}) {
  const items = result?.items ?? []
  const sourceCount = result?.sourceCounts?.[source] ?? result?.total ?? 0
  const totalLabel = result?.query ? `${result.total} 个匹配结果` : `${sourceCount || result?.total || 0} 个可浏览 Skill`

  return (
    <section className="skill-hub-panel">
      <div className="skill-hub-head">
        <div>
          <span className="section-kicker">Hermes 原生生态</span>
          <h2>Skills Hub</h2>
          <p>直接调用 Hermes Skills Hub。来源包括官方目录、skills.sh、well-known、GitHub、ClawHub 和 LobeHub，不在 Cowork 里造一套假市场。</p>
        </div>
        <div className="skill-hub-status">
          <Layers3 size={15} />
          <strong>{loading ? '同步中' : totalLabel}</strong>
        </div>
      </div>

      <div className="skill-hub-source-tabs" role="tablist" aria-label="Skill 生态来源">
        {skillHubSources.map((option) => (
          <button
            key={option.id}
            className={source === option.id ? 'active' : ''}
            onClick={() => onSourceChange(option.id)}
          >
            {option.label}
            {result?.sourceCounts?.[option.id] ? <span>{result.sourceCounts[option.id]}</span> : null}
          </button>
        ))}
      </div>

      {error && <div className="settings-error-line">{error}</div>}
      {result?.timedOutSources?.length ? (
        <div className="skill-hub-warning">以下来源响应超时：{result.timedOutSources.join('、')}。可切换单一来源重试。</div>
      ) : null}

      <div className="skill-hub-grid">
        {loading && !items.length && (
          <div className="skill-hub-empty">
            <Loader2 size={18} className="spin" />
            <span>正在读取 Hermes Skills Hub</span>
          </div>
        )}
        {!loading && !error && !items.length && (
          <div className="skill-hub-empty">
            <Search size={18} />
            <span>没有匹配的生态 Skill。</span>
          </div>
        )}
        {items.map((item) => {
          const installed = installedNames.has(item.name.toLowerCase())
          const installing = installingId === item.identifier
          return (
            <article className={installed ? 'skill-hub-card installed' : 'skill-hub-card'} key={`${item.source}:${item.identifier}`}>
              <div className="skill-hub-card-head">
                <div className="skill-hub-icon">
                  <BookOpen size={18} />
                </div>
                <div>
                  <strong>{item.name}</strong>
                  <span>{hubSourceLabel(item.source)}</span>
                </div>
              </div>
              <p>{item.description || '这个 Skill 来自 Hermes 生态源。安装后会写入 Hermes 本机技能目录。'}</p>
              <div className="skill-hub-meta">
                <em><ShieldCheck size={12} />{hubTrustLabel(item.trustLevel)}</em>
                {item.tags.slice(0, 3).map((tag) => <em key={tag}>{tag}</em>)}
              </div>
              {(item.repo || item.path) && (
                <div className="skill-hub-path" title={[item.repo, item.path].filter(Boolean).join(' · ')}>
                  <ExternalLink size={12} />
                  <span>{[item.repo, item.path].filter(Boolean).join(' · ')}</span>
                </div>
              )}
              <button
                className={installed ? 'skill-hub-install installed' : 'skill-hub-install'}
                disabled={installed || installing}
                onClick={() => onInstall(item)}
              >
                {installing ? <Loader2 size={14} className="spin" /> : installed ? <CheckCircle2 size={14} /> : <Download size={14} />}
                {installed ? '已安装' : '安装'}
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function groupToolsets(toolsets: HermesToolset[]) {
  const order = ['基础工作', '网页与浏览器', '多模态与媒体', '协作与自动化', '通讯与外部系统', '高级能力']
  const groups = new Map<string, HermesToolset[]>()
  for (const toolset of toolsets) {
    const group = toolsetGroup(toolset.name)
    groups.set(group, [...(groups.get(group) ?? []), toolset])
  }
  return order
    .map((title) => ({ title, toolsets: groups.get(title) ?? [] }))
    .filter((section) => section.toolsets.length)
}

function abilityActionText(item: { id: CustomizeTab; title: string; tone: string; status: string }) {
  if (item.status === '待同步') return `${item.title}正在同步本机状态，刷新后显示真实可用数量。`
  if (item.tone === 'warning') return `${item.title}有配置需要处理：${item.status}。点击对应卡片进入管理。`
  if (item.tone === 'idle') return `${item.title}目前没有启用。需要 Hermes 使用这类能力时，先点击对应卡片启用。`
  return `正在查看${item.title}。这里管理 Hermes 实际可调用的能力，不放临时前端占位。`
}

function hubSourceLabel(source: string) {
  return skillHubSources.find((item) => item.id === source)?.label || source
}

function hubTrustLabel(value: string) {
  if (value === 'builtin') return '内置'
  if (value === 'trusted') return '可信源'
  if (value === 'community') return '社区'
  return value || '未标注'
}

function toolsetGroup(name: string) {
  if (['file', 'terminal', 'code_execution', 'todo', 'memory', 'session_search'].includes(name)) return '基础工作'
  if (['web', 'browser'].includes(name)) return '网页与浏览器'
  if (['vision', 'image_gen', 'tts'].includes(name)) return '多模态与媒体'
  if (['skills', 'clarify', 'delegation', 'cronjob'].includes(name)) return '协作与自动化'
  if (['messaging', 'discord', 'discord_admin', 'spotify', 'homeassistant', 'yuanbao'].includes(name)) return '通讯与外部系统'
  return '高级能力'
}

function toolsetIcon(name: string) {
  if (name === 'web' || name === 'browser') return Globe2
  if (name === 'terminal') return Terminal
  if (name === 'file') return FileText
  if (name === 'code_execution') return Database
  if (name === 'vision' || name === 'image_gen') return Image
  if (name === 'tts') return Volume2
  if (name === 'moa' || name === 'delegation') return Brain
  if (name === 'cronjob') return Clock3
  if (name === 'clarify') return HelpCircle
  if (name === 'messaging' || name === 'discord' || name === 'yuanbao') return MessageSquare
  return Wrench
}

function toolsetTitle(toolset: HermesToolset) {
  const mapped = toolsetTitleMap[toolset.name]
  if (mapped) return mapped
  return toolset.label.replace(/^[^\p{Letter}\p{Number}]+/u, '').trim() || toolset.name
}

function toolsetDescription(toolset: HermesToolset) {
  return toolsetDescriptionMap[toolset.name] || toolset.description || 'Hermes 内置工具能力。'
}

const toolsetTitleMap: Record<string, string> = {
  web: '网页搜索与抓取',
  browser: '浏览器自动化',
  terminal: '终端命令',
  file: '文件读写',
  code_execution: '代码执行',
  vision: '图片理解',
  image_gen: '图片生成',
  moa: '多智能体协作',
  tts: '语音合成',
  skills: '技能读取',
  todo: '任务规划',
  memory: '长期记忆',
  session_search: '历史会话搜索',
  clarify: '反问澄清',
  delegation: '任务委派',
  cronjob: '定时任务',
  messaging: '跨渠道消息',
  rl: '训练工具',
  homeassistant: '智能家居',
  spotify: 'Spotify',
  discord: 'Discord',
  discord_admin: 'Discord 管理',
  yuanbao: '元宝'
}

const toolsetDescriptionMap: Record<string, string> = {
  web: '让 Hermes 搜索网页、读取网页内容并整理来源。',
  browser: '让 Hermes 打开网页、点击、输入、滚动和执行浏览器任务。',
  terminal: '允许 Hermes 运行本机命令、检查进程和读取命令输出。',
  file: '允许 Hermes 读取、写入、搜索和修改授权工作区内的文件。',
  code_execution: '允许 Hermes 在隔离执行环境里运行代码片段。',
  vision: '允许 Hermes 读取图片、截图或视觉材料中的信息。',
  image_gen: '允许 Hermes 生成图片类产物。',
  moa: '让多个模型或 Agent 协作给出结果。',
  tts: '把文本转换成语音，需要对应服务配置。',
  skills: '允许 Hermes 查找和读取本机 Skill。',
  todo: '允许 Hermes 维护任务计划和待办状态。',
  memory: '允许 Hermes 使用长期记忆保存和检索上下文。',
  session_search: '允许 Hermes 检索历史会话。',
  clarify: '允许 Hermes 在任务不清楚时向用户反问。',
  delegation: '允许 Hermes 把子任务分派给子 Agent。',
  cronjob: '允许 Hermes 创建、暂停、恢复和触发定时任务。',
  messaging: '允许 Hermes 向外部沟通渠道发送消息。'
}
