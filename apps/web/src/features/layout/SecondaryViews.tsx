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
  Presentation,
  Search,
  Square,
  XCircle
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type {
  HermesMcpConfig,
  HermesToolset,
  Skill,
  Task
} from '../../lib/api'

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

export function DispatchView({
  connectors,
  toolsets,
  toolsetsError,
  skills,
  onOpenConnectors,
  onOpenToolsets
}: {
  connectors: HermesMcpConfig['servers']
  toolsets: HermesToolset[]
  toolsetsError: string | null
  skills: Skill[]
  onOpenConnectors: () => void
  onOpenToolsets: () => void
}) {
  const enabledConnectors = connectors.filter((connector) => connector.enabled)
  const enabledToolsets = toolsets.filter((toolset) => toolset.enabled)
  const larkSkills = skills.filter((skill) => skill.name.startsWith('lark-') && skill.enabled)
  const browserToolsets = enabledToolsets.filter((toolset) => /browser|web|search/i.test(`${toolset.name} ${toolset.label} ${toolset.description}`))
  const dataToolsets = enabledToolsets.filter((toolset) => /file|filesystem|csv|sql|spreadsheet|document|pdf|vision/i.test(`${toolset.name} ${toolset.label} ${toolset.description} ${toolset.tools.join(' ')}`))

  return (
    <section className="product-page">
      <header className="product-page-head">
        <div>
          <h1>调度</h1>
          <p>这里汇总 Hermes 当前可调度的能力。具体启停都在技能页统一管理。</p>
        </div>
        <button className="send-button" onClick={onOpenToolsets}>
          <Hammer size={16} />
          查看工具集
        </button>
      </header>

      <div className="dispatch-grid">
        <DispatchCapabilityCard
          icon={<Globe2 size={18} />}
          title="网页与浏览器"
          detail="用于网页调研、读取页面、浏览器自动化和网页表单操作。"
          count={browserToolsets.length}
          status={browserToolsets.length ? '已接入' : '待接入'}
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
          count={dataToolsets.length}
          status={dataToolsets.length ? '可用' : '待配置'}
        />
      </div>

      <div className="dispatch-connector-strip">
        <div>
          <strong>Hermes 当前启用工具集</strong>
          <span>
            {toolsetsError
              ? '暂时无法读取 Hermes 官方工具集'
              : enabledToolsets.length
                ? enabledToolsets.map((toolset) => toolset.name).join('、')
                : '暂无启用工具集'}
          </span>
        </div>
        <button className="settings-link-button" onClick={onOpenToolsets}>
          工具集 {enabledToolsets.length}
        </button>
        <button className="settings-link-button" onClick={onOpenConnectors}>
          MCP 服务 {enabledConnectors.length}
        </button>
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
