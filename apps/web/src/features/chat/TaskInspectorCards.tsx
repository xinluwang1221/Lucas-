import {
  BookOpen,
  Brain,
  CheckCircle2,
  Circle,
  FileArchive,
  FileText,
  FolderOpen,
  Globe2,
  Loader2,
  RefreshCw,
  Square,
  Upload,
  Wrench,
  XCircle
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { artifactDownloadUrl } from '../file-preview/artifactApi'
import {
  type Artifact,
  type HermesContextSnapshot,
  type Task,
  type WorkspaceFile
} from '../../lib/api'
import {
  buildContextResourceSnapshot,
  taskElapsedLabel,
  taskProgressSummary,
  taskStepItems,
  workModeLabel,
  type ContextResourceSnapshot
} from './executionTraceModel'

export function TaskProgressCard({
  task,
  streamStatus,
  streamUpdatedAt
}: {
  task?: Task
  streamStatus: string
  streamUpdatedAt: string | null
}) {
  if (!task) {
    return (
      <section className="inspector-card progress-focus-card">
        <h3>任务拆解</h3>
        <EmptyInspectorState title="未选择任务" detail="选择左侧任务后，这里会显示拆分步骤和当前进度。" />
      </section>
    )
  }

  const progress = taskProgressSummary(task)
  const showStreamState = task.status === 'running' || streamStatus === 'connecting' || streamStatus === 'live'

  return (
    <section className="inspector-card progress-focus-card">
      <div className="card-heading-row">
        <div>
          <h3>任务拆解</h3>
          <p>{progress.currentLabel}</p>
        </div>
        <div className="progress-heading-actions">
          <div className={`status-pill compact ${task.status}`}>
            <StatusIcon status={task.status} />
            {statusLabel(task.status)}
          </div>
        </div>
      </div>
      <div className="task-progress-meter" aria-label={`任务进度 ${progress.doneCount}/${progress.totalCount}`}>
        <span style={{ width: `${progress.percent}%` }} />
      </div>
      <div className="task-progress-copy">
        <strong>{progress.totalCount ? `${progress.doneCount}/${progress.totalCount} 步` : '等待计划'}</strong>
        <span>{taskElapsedLabel(task)}</span>
      </div>
      <TodoSteps task={task} />
      {showStreamState && (
        <div className={`task-stream-state ${streamStatus}`}>
          <span />
          <div>
            <strong>{taskStreamLabel(streamStatus)}</strong>
            <p>{taskStreamDescription(streamStatus, streamUpdatedAt)}</p>
          </div>
        </div>
      )}
    </section>
  )
}

export function ContextResourcesCard({
  task,
  context,
  loading,
  error,
  compressing,
  workspaceFiles,
  onRefresh,
  onCompress
}: {
  task?: Task
  context: HermesContextSnapshot | null
  loading: boolean
  error: string | null
  compressing: boolean
  workspaceFiles: WorkspaceFile[]
  onRefresh: () => void
  onCompress: () => void
}) {
  const [activeTab, setActiveTab] = useState<'files' | 'links' | 'tools' | 'skills'>('files')

  const percent = Math.max(0, Math.min(100, context?.contextPercent ?? 0))
  const status = context?.status ?? 'unknown'
  const canCompress = Boolean(task && context?.canCompress && task.status !== 'running')
  const showCompressHint = Boolean(task && context?.canCompress && task.status === 'running')
  const usageLabel = context?.contextMax
    ? `${formatTokenCompact(context.contextUsed)} / ${formatTokenCompact(context.contextMax)}`
    : '等待 Hermes 回传'
  const resources = task ? buildContextResourceSnapshot(task, workspaceFiles) : null
  const tabs = [
    { id: 'files' as const, label: '文件', count: resources?.files.length ?? 0 },
    { id: 'links' as const, label: '网页', count: resources?.links.length ?? 0 },
    { id: 'tools' as const, label: '工具', count: resources?.tools.length ?? 0 },
    { id: 'skills' as const, label: 'Skill', count: resources?.skills.length ?? 0 }
  ]
  const totalCount = tabs.reduce((sum, item) => sum + item.count, 0)

  return (
    <section className={`inspector-card context-usage-card context-resources-card ${status}`}>
      <div className="card-heading-row">
        <div>
          <h3>上下文与资源</h3>
          <p>当前任务真正带入或调用的文件、网页、工具和 Skill。</p>
        </div>
        <span className={`context-state ${status}`}>{contextStatusText(status)}</span>
      </div>

      <div className="context-meter-line">
        <div className="context-meter" aria-label={`上下文用量 ${percent}%`}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="context-meter-meta">
          <strong>{context?.contextMax ? `${percent}%` : '未采样'}</strong>
          <span>{usageLabel}</span>
        </div>
      </div>

      <div className="context-resource-tabs" role="tablist" aria-label="上下文资源分类">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            <span>{tab.count}</span>
          </button>
        ))}
      </div>

      {!task ? (
        <EmptyInspectorState title="未选择任务" detail="选择任务后，这里会显示文件、网页、工具和 Skill。" />
      ) : totalCount === 0 ? (
        <EmptyInspectorState title="暂无上下文资源" detail="Hermes 暂未暴露可识别的文件、网页或工具调用。" />
      ) : (
        <ContextResourcePanel activeTab={activeTab} resources={resources!} />
      )}

      {error && <div className="context-inline-error">{error}</div>}
      {showCompressHint && <div className="context-inline-note">任务运行结束后可手动压缩。</div>}

      <div className="context-actions">
        <button type="button" className="mini-button" onClick={onRefresh} disabled={loading || compressing}>
          {loading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
          刷新
        </button>
        <button
          type="button"
          className="context-compress-button"
          onClick={onCompress}
          disabled={!canCompress || compressing || loading}
          title={canCompress ? '调用 Hermes 手动压缩当前 session' : '当前无需压缩'}
        >
          {compressing ? <Loader2 size={13} className="spin" /> : <Brain size={13} />}
          压缩上下文
        </button>
      </div>
    </section>
  )
}

export function TaskArtifactsCard({
  task,
  onPreview,
  onReveal
}: {
  task?: Task
  onPreview: (artifact: Artifact) => void
  onReveal: (artifact: Artifact) => void
}) {
  const artifacts = task?.artifacts ?? []

  return (
    <section className="inspector-card artifact-focus-card">
      <div className="card-heading-row">
        <h3>任务产出物</h3>
        {artifacts.length > 0 && <span className="soft-count">{artifacts.length} 个</span>}
      </div>
      {!task ? (
        <EmptyInspectorState title="暂无产出物" detail="选择任务后，这里会显示 Hermes 生成的文档、表格和文件。" />
      ) : !artifacts.length ? (
        <EmptyInspectorState title="暂无产出物" detail="任务生成文件后，会自动出现在这里。" />
      ) : (
        <div className="artifact-list">
          {artifacts.map((artifact) => (
            <div className="artifact" key={artifact.id}>
              <FileArchive size={17} />
              <button type="button" className="artifact-main" onClick={() => onPreview(artifact)}>
                <strong>{artifact.name}</strong>
                <span>{artifact.relativePath}</span>
              </button>
              <button title="预览文本产物" onClick={() => onPreview(artifact)}>
                <FileText size={15} />
              </button>
              <button title="在 Finder 中显示" onClick={() => onReveal(artifact)}>
                <FolderOpen size={15} />
              </button>
              <a title="下载" href={artifactDownloadUrl(artifact.id)}>
                <Upload size={15} />
              </a>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function TodoSteps({ task }: { task: Task }) {
  const steps = taskStepItems(task)

  if (!steps.length) {
    return (
      <EmptyInspectorState
        title="暂无任务拆解"
        detail="Hermes 当前只返回了执行过程，已显示在对话区的过程流里。"
      />
    )
  }

  return (
    <ol className="todo-steps">
      {steps.map((step, index) => (
        <li className={`todo-step ${step.status}`} key={`${step.label}-${index}`}>
          <span />
          <div>
            <strong>
              {step.label}
              <em>{workModeLabel(step.mode)}</em>
            </strong>
            <p>{step.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function ContextResourcePanel({
  activeTab,
  resources
}: {
  activeTab: 'files' | 'links' | 'tools' | 'skills'
  resources: ContextResourceSnapshot
}) {
  if (activeTab === 'files') {
    if (!resources.files.length) {
      return <EmptyInspectorState title="暂无文件上下文" detail="文件被读取或作为上下文发送后，会显示大小和占比。" />
    }
    return (
      <ul className="context-file-list">
        {resources.files.map((file) => (
          <li key={file.reference}>
            <FileText size={14} />
            <div>
              <strong title={file.reference}>{file.name}</strong>
              <span>{file.matched ? `${formatBytes(file.size)} · ${file.percent}% 文件占比` : '大小未知 · 尚未匹配到工作区文件'}</span>
              {file.matched && (
                <div className="context-file-meter">
                  <span style={{ width: `${Math.max(4, file.percent)}%` }} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    )
  }

  if (activeTab === 'links') {
    return (
      <ReferenceList
        emptyTitle="暂无网页引用"
        emptyDetail="联网搜索、网页调研或浏览器访问会显示在这里。"
        icon={<Globe2 size={14} />}
        items={resources.links}
      />
    )
  }

  if (activeTab === 'tools') {
    return (
      <ReferenceList
        emptyTitle="暂无工具调用"
        emptyDetail="Hermes 调用 MCP、命令或文件工具时会显示在这里。"
        icon={<Wrench size={14} />}
        items={resources.tools}
      />
    )
  }

  return (
    <ReferenceList
      emptyTitle="暂无 Skill"
      emptyDetail="本轮任务明确指定或预加载的 Skill 会保留在这里。"
      icon={<BookOpen size={14} />}
      items={resources.skills}
    />
  )
}

function ReferenceList({
  items,
  icon,
  emptyTitle,
  emptyDetail
}: {
  items: string[]
  icon: ReactNode
  emptyTitle: string
  emptyDetail: string
}) {
  if (!items.length) return <EmptyInspectorState title={emptyTitle} detail={emptyDetail} />
  return (
    <ul className="context-reference-list">
      {items.map((item) => (
        <li key={item}>
          {icon}
          <span title={item}>{shortReference(item)}</span>
        </li>
      ))}
    </ul>
  )
}

function EmptyInspectorState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-inspector-state">
      <Circle size={18} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
}

function StatusIcon({ status }: { status: Task['status'] }) {
  if (status === 'running') return <Loader2 size={15} className="spin" />
  if (status === 'completed') return <CheckCircle2 size={15} />
  if (status === 'failed') return <XCircle size={15} />
  if (status === 'stopped') return <Square size={15} />
  return <Circle size={15} />
}

function statusLabel(status: Task['status']) {
  return {
    idle: '未开始',
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    stopped: '已停止'
  }[status]
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatTokenCompact(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 10_000) return `${Math.round(value / 1000)}K`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return String(Math.round(value))
}

function contextStatusText(status: HermesContextSnapshot['status']) {
  if (status === 'ok') return '正常'
  if (status === 'warn') return '建议压缩'
  if (status === 'danger') return '接近上限'
  if (status === 'empty') return '未使用'
  return '等待'
}

function taskStreamLabel(status: string) {
  if (status === 'live') return '实时同步'
  if (status === 'connecting') return '连接中'
  if (status === 'fallback') return '轮询兜底'
  return '等待同步'
}

function taskStreamDescription(status: string, updatedAt: string | null) {
  const suffix = updatedAt ? `最近同步 ${formatTime(updatedAt)}` : '等待首次同步'
  if (status === 'live') return `Hermes 事件会实时更新。${suffix}`
  if (status === 'connecting') return '正在连接 Hermes 实时事件流。'
  if (status === 'fallback') return `实时连接不可用，当前使用轮询刷新。${suffix}`
  return suffix
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function shortReference(value: string) {
  try {
    const url = new URL(value)
    return url.hostname.replace(/^www\./, '')
  } catch {
    const parts = value.split(/[\\/]/).filter(Boolean)
    return parts.slice(-2).join('/')
  }
}
