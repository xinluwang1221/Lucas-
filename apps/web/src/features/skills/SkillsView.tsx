import {
  BookOpen,
  Brain,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  Globe2,
  HelpCircle,
  Image,
  Loader2,
  MessageSquare,
  Monitor,
  PauseCircle,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Terminal,
  Volume2,
  Wrench
} from 'lucide-react'
import type { HermesMcpConfig, HermesToolset, Skill } from '../../lib/api'
import { ConnectorsView as McpConnectorsView } from '../settings/mcp'
import { shortenSkillPath, sourceLabel } from './skillFormatters'

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
  onOpenMcpMarketplace
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
  onRefresh: () => void
  onUploadClick: () => void
  onRefreshMcp: () => void
  onRefreshToolsets: () => void
  onToggleToolset: (toolset: HermesToolset) => void
  onOpenMcpSettings: () => void
  onOpenMcpMarketplace: () => void
}) {
  const normalizedQuery = query.trim().toLowerCase()
  const enabledSkills = skills.filter((skill) => skill.enabled)
  const activeSkills = (tab === 'installed' ? enabledSkills : skills).filter((skill) => {
    if (!normalizedQuery) return true
    return `${skill.name} ${skill.description} ${skill.source} ${skill.path}`.toLowerCase().includes(normalizedQuery)
  })
  const enabledCount = enabledSkills.length
  const disabledCount = Math.max(0, skills.length - enabledCount)
  const enabledToolsets = toolsets.filter((toolset) => toolset.enabled)
  const unconfiguredEnabledToolsets = enabledToolsets.filter((toolset) => !toolset.configured)
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
          <strong>能力边界</strong>
          <span>Skill 是工作方法；MCP 是外部服务；工具集是 Hermes 内置工具开关。三者都在技能页统一管理。</span>
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
              <button className="send-button" onClick={onOpenMcpMarketplace}>
                <Plus size={16} />
                从市场添加
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

        {customizeTab === 'skills' ? (
          <>
            {notice && <div className="skill-notice">{notice}</div>}

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
          />
        )}
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
