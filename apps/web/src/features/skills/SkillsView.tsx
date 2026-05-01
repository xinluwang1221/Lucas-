import { BookOpen, Plug, Plus, RefreshCw, Search } from 'lucide-react'
import type { HermesMcpConfig, Skill } from '../../lib/api'
import { ConnectorsView as McpConnectorsView } from '../settings/mcp'
import { shortenSkillPath, sourceLabel } from './skillFormatters'

export function SkillsView({
  skills,
  customizeTab,
  tab,
  query,
  notice,
  connectors,
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
  onOpenMcpSettings,
  onOpenMcpMarketplace
}: {
  skills: Skill[]
  customizeTab: 'skills' | 'connectors'
  tab: 'market' | 'installed'
  query: string
  notice: string | null
  connectors: HermesMcpConfig['servers']
  mcpConfigPath?: string
  mcpError: string | null
  onCustomizeTabChange: (tab: 'skills' | 'connectors') => void
  onTabChange: (tab: 'market' | 'installed') => void
  onQueryChange: (value: string) => void
  onToggleSkill: (skill: Skill) => void
  onOpenSkill: (skill: Skill) => void
  onRefresh: () => void
  onUploadClick: () => void
  onRefreshMcp: () => void
  onOpenMcpSettings: () => void
  onOpenMcpMarketplace: () => void
}) {
  const normalizedQuery = query.trim().toLowerCase()
  const installedSkills = skills
  const marketSkills = skills.filter((skill) => skill.source === 'plugin' || skill.source === 'system')
  const activeSkills = (tab === 'installed' ? installedSkills : marketSkills).filter((skill) => {
    if (!normalizedQuery) return true
    return `${skill.name} ${skill.description} ${skill.source} ${skill.path}`.toLowerCase().includes(normalizedQuery)
  })
  const enabledCount = skills.filter((skill) => skill.enabled).length
  const sections = [
    {
      title: tab === 'market' ? '技能市场' : '内置与插件',
      skills: activeSkills.filter((skill) => skill.source === 'plugin' || skill.source === 'system')
    },
    {
      title: '来自用户',
      skills: activeSkills.filter((skill) => skill.source === 'user' || skill.source === 'uploaded')
    }
  ].filter((section) => section.skills.length)

  return (
    <section className="customize-page">
      <aside className="customize-sidebar">
        <button className={customizeTab === 'skills' ? 'active' : ''} onClick={() => onCustomizeTabChange('skills')}>
          <BookOpen size={15} />
          Skills
        </button>
        <button className={customizeTab === 'connectors' ? 'active' : ''} onClick={() => onCustomizeTabChange('connectors')}>
          <Plug size={15} />
          Connectors
        </button>
        <div className="customize-plugin-box">
          <strong>能力来源</strong>
          <span>Skills 负责专业工作方法；Connectors 负责把 Hermes 接到本机工具和外部服务。</span>
        </div>
      </aside>

      <div className="customize-content">
        <div className="skills-actions">
          {customizeTab === 'skills' ? (
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
          ) : (
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
        </div>

        <header className="skills-hero">
          <h1>{customizeTab === 'skills' ? 'Skills' : 'Connectors'}</h1>
          <p>
            {customizeTab === 'skills'
              ? '安装和管理技能，扩展 Hermes Cowork 的本机工作方法。'
              : '管理 Hermes 可调用的 MCP 服务，把本机文件、浏览器、飞书和数据工具连接进任务。'}
          </p>
        </header>

        {customizeTab === 'skills' ? (
          <>
            <div className="skills-toolbar">
              <div className="skills-tabs" role="tablist" aria-label="技能视图">
                <button className={tab === 'market' ? 'active' : ''} onClick={() => onTabChange('market')}>
                  技能市场
                </button>
                <button className={tab === 'installed' ? 'active' : ''} onClick={() => onTabChange('installed')}>
                  已安装 <span>{installedSkills.length}</span>
                </button>
              </div>
              <label className="skills-search">
                <Search size={15} />
                <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索技能" />
              </label>
            </div>

            {notice && <div className="skill-notice">{notice}</div>}

            <div className="skills-summary">
              <div>
                <strong>{enabledCount}</strong>
                <span>已启用</span>
              </div>
              <div>
                <strong>{skills.length}</strong>
                <span>本机可用</span>
              </div>
              <div>
                <strong>{skills.filter((skill) => skill.source === 'user' || skill.source === 'uploaded').length}</strong>
                <span>来自用户</span>
              </div>
            </div>

            <div className="skills-content">
              {!activeSkills.length && <p className="muted-copy">没有匹配的技能。</p>}
              {sections.map((section) => (
                <section className="skill-section" key={section.title}>
                  <h2>{section.title}</h2>
                  <div className="skill-grid">
                    {section.skills.map((skill) => (
                      <article className="skill-card" key={skill.id}>
                        <button className="skill-open" onClick={() => onOpenSkill(skill)}>
                          <div className="skill-icon">
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
