import {
  BarChart3,
  CheckCircle2,
  Circle,
  Database,
  FolderOpen,
  Globe2,
  Hammer,
  Loader2,
  MessageSquarePlus,
  Plug,
  Presentation,
  RefreshCw,
  Search,
  Square,
  XCircle
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type {
  BackgroundServiceStatus,
  HermesMcpConfig,
  HermesMcpRecommendations,
  Skill,
  Task
} from '../../lib/api'
import { Toggle } from '../settings/settingsControls'

export type PromptExample = {
  title: string
  detail: string
  prompt: string
  icon: string
  category: string
}

export function SearchTasksView({
  tasks,
  query,
  onQueryChange,
  onOpenTask
}: {
  tasks: Task[]
  query: string
  onQueryChange: (value: string) => void
  onOpenTask: (task: Task) => void
}) {
  const normalized = query.trim().toLowerCase()
  const results = tasks.filter((task) => {
    if (!normalized) return true
    return [
      task.title,
      task.prompt,
      task.error,
      task.hermesSessionId,
      task.executionView?.response,
      task.executionView?.errors.join(' '),
      (task.skillNames ?? []).join(' '),
      (task.tags ?? []).join(' ')
    ].filter(Boolean).join(' ').toLowerCase().includes(normalized)
  })

  return (
    <section className="product-page">
      <header className="product-page-head">
        <div>
          <h1>搜索</h1>
          <p>从历史任务、技能、标签里快速找回工作现场。</p>
        </div>
      </header>
      <label className="product-search">
        <Search size={16} />
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索任务、技能或场景" />
      </label>
      <div className="product-list">
        {!results.length && <p className="muted-copy">没有找到匹配任务。</p>}
        {results.map((task) => (
          <button className="product-task-result" key={task.id} onClick={() => onOpenTask(task)}>
            <SearchTaskStatusIcon status={task.status} />
            <div>
              <strong>{task.title}</strong>
              <span>{searchTaskStatusLabel(task.status)} · {formatTaskTime(task.createdAt)}{task.skillNames?.length ? ` · ${task.skillNames.join('、')}` : ''}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

export function ScheduledTasksView({
  backgroundStatus,
  backgroundUpdating,
  backgroundError,
  recommendations,
  recommendationsLoading,
  recommendationsError,
  onToggleBackground,
  onGenerateReport
}: {
  backgroundStatus: BackgroundServiceStatus | null
  backgroundUpdating: boolean
  backgroundError: string | null
  recommendations: HermesMcpRecommendations | null
  recommendationsLoading: boolean
  recommendationsError: string | null
  onToggleBackground: (enabled: boolean) => void
  onGenerateReport: () => void
}) {
  const backgroundEnabled = Boolean(backgroundStatus?.api.loaded && backgroundStatus.dailyMcp.loaded)

  return (
    <section className="product-page">
      <header className="product-page-head">
        <div>
          <h1>定时任务</h1>
          <p>把固定时间要做的工作交给 Hermes。当前先接入每日 MCP 推荐日报和 Cowork 后台保活。</p>
        </div>
        <button className="send-button" onClick={onGenerateReport} disabled={recommendationsLoading}>
          {recommendationsLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          立即生成日报
        </button>
      </header>

      <div className="schedule-grid">
        <article className="schedule-card primary">
          <div className="schedule-card-head">
            <div>
              <strong>每日 MCP 推荐日报</strong>
              <span>每天 00:10 后，由 Hermes 复盘最近任务、卡点和关键词，生成 MCP 推荐。</span>
            </div>
            <Toggle checked={backgroundEnabled} disabled={backgroundUpdating} onChange={onToggleBackground} />
          </div>
          <div className="schedule-report">
            <strong>{recommendations?.generatedAt ? `日报 ${formatMaybeDate(recommendations.generatedAt)}` : '暂无日报'}</strong>
            <p>{recommendations?.aiSummary || recommendations?.sourceSummary || '开启后台服务或点击立即生成后，这里会显示推荐摘要。'}</p>
            <div className="schedule-tags">
              {(recommendations?.keywords ?? ['MCP', '文件整理', '网页调研']).slice(0, 8).map((keyword) => (
                <span key={keyword}>{keyword}</span>
              ))}
            </div>
          </div>
          <div className="schedule-foot">
            <span>下次自动生成：{formatMaybeDate(recommendations?.nextRunAt)}</span>
            <span>{backgroundEnabled ? '后台已启用' : '后台未启用'}</span>
          </div>
        </article>

        <article className="schedule-card">
          <strong>Cowork 后台服务</strong>
          <div className="schedule-status-list">
            <div>
              <span>API 后台</span>
              <em>{backgroundStatus?.api.loaded ? '运行中' : backgroundStatus?.api.installed ? '已安装未运行' : '未安装'}</em>
            </div>
            <div>
              <span>每日推荐</span>
              <em>{backgroundStatus?.dailyMcp.loaded ? '运行中' : backgroundStatus?.dailyMcp.installed ? '已安装未运行' : '未安装'}</em>
            </div>
            <div>
              <span>日志目录</span>
              <em>{backgroundStatus?.logsDir ?? '待读取'}</em>
            </div>
          </div>
        </article>
      </div>

      {(backgroundError || recommendationsError) && (
        <div className="settings-error-line">{backgroundError || recommendationsError}</div>
      )}
    </section>
  )
}

export function DispatchView({
  connectors,
  skills,
  onOpenConnectors,
  onOpenMcpSettings
}: {
  connectors: HermesMcpConfig['servers']
  skills: Skill[]
  onOpenConnectors: () => void
  onOpenMcpSettings: () => void
}) {
  const enabledConnectors = connectors.filter((connector) => connector.enabled)
  const larkSkills = skills.filter((skill) => skill.name.startsWith('lark-') && skill.enabled)
  const browserConnectors = connectors.filter((connector) => /browser|chrome|playwright|web/i.test(`${connector.name} ${connector.description ?? ''}`))

  return (
    <section className="product-page">
      <header className="product-page-head">
        <div>
          <h1>调度</h1>
          <p>这里汇总 Hermes 能触达的外部动作：浏览器、飞书、文件系统、数据分析和本机自动化。</p>
        </div>
        <button className="send-button" onClick={onOpenConnectors}>
          <Plug size={16} />
          查看连接器
        </button>
      </header>

      <div className="dispatch-grid">
        <DispatchCapabilityCard
          icon={<Globe2 size={18} />}
          title="网页与浏览器"
          detail="用于网页调研、读取页面、浏览器自动化和网页表单操作。"
          count={browserConnectors.length}
          status={browserConnectors.length ? '已接入' : '待接入'}
        />
        <DispatchCapabilityCard
          icon={<MessageSquarePlus size={18} />}
          title="飞书办公"
          detail="通过 lark skills 处理消息、文档、表格、审批、日历和会议纪要。"
          count={larkSkills.length}
          status={larkSkills.length ? '已接入' : '待启用'}
        />
        <DispatchCapabilityCard
          icon={<Database size={18} />}
          title="数据与文件"
          detail="CSV、SQLite、Excel、PDF、视觉理解等本机工作能力。"
          count={enabledConnectors.length}
          status={enabledConnectors.length ? '可用' : '待配置'}
        />
      </div>

      <div className="dispatch-connector-strip">
        <div>
          <strong>当前可调用连接器</strong>
          <span>{enabledConnectors.length ? enabledConnectors.map((connector) => connector.name).join('、') : '暂无启用连接器'}</span>
        </div>
        <button className="settings-link-button" onClick={onOpenMcpSettings}>打开 MCP 管理</button>
      </div>
    </section>
  )
}

function DispatchCapabilityCard({
  icon,
  title,
  detail,
  count,
  status
}: {
  icon: ReactNode
  title: string
  detail: string
  count: number
  status: string
}) {
  return (
    <article className="dispatch-card">
      <div className="dispatch-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{detail}</p>
      <div>
        <span>{count} 项能力</span>
        <em>{status}</em>
      </div>
    </article>
  )
}

export function IdeasView({
  examples,
  onUsePrompt
}: {
  examples: PromptExample[]
  onUsePrompt: (prompt: string) => void
}) {
  const [category, setCategory] = useState('全部')
  const categories = ['全部', ...Array.from(new Set(examples.map((item) => item.category)))]
  const visibleExamples = category === '全部' ? examples : examples.filter((item) => item.category === category)

  return (
    <section className="product-page">
      <header className="product-page-head">
        <div>
          <h1>任务模板</h1>
          <p>把常见工作变成一键开始的任务入口。后续这里会沉淀你的高频工作流。</p>
        </div>
      </header>
      <div className="ideas-tabs">
        {categories.map((item) => (
          <button className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="idea-grid">
        {visibleExamples.map((item) => (
          <button key={item.title} onClick={() => onUsePrompt(item.prompt)}>
            <TemplateIcon name={item.icon} />
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export function TemplateIcon({ name }: { name: string }) {
  if (name === 'web') return <Globe2 size={28} />
  if (name === 'research') return <Presentation size={28} />
  if (name === 'data') return <BarChart3 size={28} />
  if (name === 'files') return <FolderOpen size={28} />
  return <Hammer size={28} />
}

function SearchTaskStatusIcon({ status }: { status: Task['status'] }) {
  if (status === 'running') return <Loader2 size={15} className="spin" />
  if (status === 'completed') return <CheckCircle2 size={15} />
  if (status === 'failed') return <XCircle size={15} />
  if (status === 'stopped') return <Square size={15} />
  return <Circle size={15} />
}

function searchTaskStatusLabel(status: Task['status']) {
  return {
    idle: '未开始',
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    stopped: '已停止'
  }[status]
}

function formatTaskTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function formatMaybeDate(value?: string) {
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
