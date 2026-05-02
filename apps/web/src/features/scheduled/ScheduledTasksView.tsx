import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type {
  BackgroundServiceStatus,
  HermesCronJob,
  HermesCronJobInput,
  HermesCronState,
  HermesMcpRecommendations,
  Skill,
  Workspace
} from '../../lib/api'
import { Toggle } from '../settings/settingsControls'

type ScheduledTasksViewProps = {
  cronState: HermesCronState | null
  cronLoading: boolean
  cronError: string | null
  cronSaving: boolean
  cronMutatingId: string | null
  cronNotice: string | null
  workspaces: Workspace[]
  skills: Skill[]
  backgroundStatus: BackgroundServiceStatus | null
  backgroundUpdating: boolean
  backgroundError: string | null
  recommendations: HermesMcpRecommendations | null
  recommendationsLoading: boolean
  recommendationsError: string | null
  onRefreshCron: () => void
  onCreateCronJob: (input: HermesCronJobInput, onSuccess?: () => void) => void
  onUpdateCronJob: (jobId: string, input: HermesCronJobInput, onSuccess?: () => void) => void
  onRunCronAction: (jobId: string, action: 'pause' | 'resume' | 'run' | 'remove') => void
  onToggleBackground: (enabled: boolean) => void
  onGenerateReport: () => void
}

export function ScheduledTasksView({
  cronState,
  cronLoading,
  cronError,
  cronSaving,
  cronMutatingId,
  cronNotice,
  workspaces,
  skills,
  backgroundStatus,
  backgroundUpdating,
  backgroundError,
  recommendations,
  recommendationsLoading,
  recommendationsError,
  onRefreshCron,
  onCreateCronJob,
  onUpdateCronJob,
  onRunCronAction,
  onToggleBackground,
  onGenerateReport
}: ScheduledTasksViewProps) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [editingJob, setEditingJob] = useState<HermesCronJob | null>(null)
  const [creating, setCreating] = useState(false)
  const jobs = cronState?.jobs ?? []
  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null,
    [jobs, selectedJobId]
  )
  const backgroundEnabled = Boolean(backgroundStatus?.api.loaded && backgroundStatus.dailyMcp.loaded)

  return (
    <section className="product-page scheduled-page">
      <header className="product-page-head">
        <div>
          <h1>定时任务</h1>
          <p>管理 Hermes Cron。这里创建的任务会写入 Hermes，按 gateway 的定时器自动执行。</p>
        </div>
        <div className="scheduled-actions">
          <button className="ghost-button" onClick={onRefreshCron} disabled={cronLoading}>
            {cronLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            刷新
          </button>
          <button className="send-button" onClick={() => setCreating(true)}>
            <Plus size={16} />
            新建定时任务
          </button>
        </div>
      </header>

      {(cronError || backgroundError || recommendationsError || cronNotice) && (
        <div className={cronError || backgroundError || recommendationsError ? 'scheduled-banner danger' : 'scheduled-banner'}>
          {cronError || backgroundError || recommendationsError || cronNotice}
        </div>
      )}

      <div className="scheduled-shell">
        <aside className="scheduled-list-panel">
          <div className="scheduled-health-card">
            <div>
              <strong>Hermes Cron</strong>
              <span>{cronState?.scheduler.running ? '自动执行已运行' : '自动执行未启动'}</span>
            </div>
            <span className={cronState?.scheduler.running ? 'status-pill ok' : 'status-pill warn'}>
              {cronState?.scheduler.running ? '运行中' : '需启动'}
            </span>
          </div>

          <div className="scheduled-job-list">
            {!jobs.length && (
              <div className="scheduled-empty">
                <CalendarClock size={22} />
                <strong>还没有 Hermes 定时任务</strong>
                <span>新建后会写入 Hermes cron 数据库，不是 Cowork 本地假任务。</span>
              </div>
            )}
            {jobs.map((job) => (
              <button
                key={job.id}
                className={selectedJob?.id === job.id ? 'scheduled-job-item active' : 'scheduled-job-item'}
                onClick={() => setSelectedJobId(job.id)}
              >
                <JobStatusIcon job={job} />
                <div>
                  <strong>{job.name}</strong>
                  <span>{job.scheduleDisplay} · {job.enabled ? '已启用' : '已暂停'}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="scheduled-detail-panel">
          {selectedJob ? (
            <CronJobDetail
              job={selectedJob}
              mutating={cronMutatingId === selectedJob.id}
              onEdit={() => setEditingJob(selectedJob)}
              onPause={() => onRunCronAction(selectedJob.id, selectedJob.enabled ? 'pause' : 'resume')}
              onRun={() => onRunCronAction(selectedJob.id, 'run')}
              onRemove={() => {
                if (window.confirm(`确定删除定时任务「${selectedJob.name}」吗？`)) {
                  onRunCronAction(selectedJob.id, 'remove')
                }
              }}
            />
          ) : (
            <div className="scheduled-detail-empty">
              <CalendarClock size={26} />
              <strong>选择或新建一个定时任务</strong>
              <span>推荐从“每天下班复盘”“每周整理工作区文件”“定时生成 MCP 推荐”开始。</span>
            </div>
          )}
        </main>
      </div>

      <div className="scheduled-support-grid">
        <article className="schedule-card">
          <div className="schedule-card-head">
            <div>
              <strong>Cowork 后台保活</strong>
              <span>后台服务只负责让 Cowork API 和 MCP 推荐日报常驻；Hermes Cron 是否执行，以 gateway 状态为准。</span>
            </div>
            <Toggle checked={backgroundEnabled} disabled={backgroundUpdating} onChange={onToggleBackground} />
          </div>
          <div className="schedule-status-list">
            <div>
              <span>API 后台</span>
              <em>{backgroundStatus?.api.loaded ? '运行中' : backgroundStatus?.api.installed ? '已安装未运行' : '未安装'}</em>
            </div>
            <div>
              <span>每日推荐</span>
              <em>{backgroundStatus?.dailyMcp.loaded ? '运行中' : backgroundStatus?.dailyMcp.installed ? '已安装未运行' : '未安装'}</em>
            </div>
          </div>
        </article>

        <article className="schedule-card">
          <div className="schedule-card-head">
            <div>
              <strong>每日 MCP 推荐日报</strong>
              <span>根据最近任务和卡点生成推荐，结果进入 MCP 市场。</span>
            </div>
            <button className="ghost-button" onClick={onGenerateReport} disabled={recommendationsLoading}>
              {recommendationsLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              生成
            </button>
          </div>
          <p className="scheduled-muted-copy">
            {recommendations?.generatedAt ? `最近生成：${formatDate(recommendations.generatedAt)}` : '暂无日报。'}
          </p>
        </article>
      </div>

      {(creating || editingJob) && (
        <CronJobModal
          job={editingJob}
          saving={cronSaving}
          workspaces={workspaces}
          skills={skills}
          onClose={() => {
            setCreating(false)
            setEditingJob(null)
          }}
          onSubmit={(input) => {
            if (editingJob) {
              onUpdateCronJob(editingJob.id, input, () => setEditingJob(null))
            } else {
              onCreateCronJob(input, () => setCreating(false))
            }
          }}
        />
      )}
    </section>
  )
}

function CronJobDetail({
  job,
  mutating,
  onEdit,
  onPause,
  onRun,
  onRemove
}: {
  job: HermesCronJob
  mutating: boolean
  onEdit: () => void
  onPause: () => void
  onRun: () => void
  onRemove: () => void
}) {
  return (
    <article className="cron-detail-card">
      <div className="cron-detail-head">
        <div>
          <span className={job.enabled ? 'status-pill ok' : 'status-pill warn'}>{job.enabled ? '已启用' : '已暂停'}</span>
          <h2>{job.name}</h2>
          <p>{job.promptPreview || '这个任务由绑定的 Skill 执行。'}</p>
        </div>
        <div className="cron-detail-actions">
          <button className="ghost-button" onClick={onEdit}>编辑</button>
          <button className="ghost-button" onClick={onRun} disabled={mutating}>
            {mutating ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
            运行一次
          </button>
          <button className="ghost-button" onClick={onPause} disabled={mutating}>
            {job.enabled ? <Pause size={15} /> : <Play size={15} />}
            {job.enabled ? '暂停' : '恢复'}
          </button>
          <button className="ghost-button danger" onClick={onRemove} disabled={mutating}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="cron-detail-grid">
        <Metric title="执行计划" value={job.scheduleDisplay} detail={job.nextRunAt ? `下次：${formatDate(job.nextRunAt)}` : '暂无下一次执行'} />
        <Metric title="执行目录" value={job.workdir || '未指定'} detail="指定后 Hermes 会在该工作区读写文件" />
        <Metric title="Skill" value={job.skills.length ? job.skills.join('、') : '未绑定'} detail="可让未来任务复用固定工作方法" />
        <Metric title="结果投递" value={job.deliver === 'local' ? '仅本机保存' : job.deliver} detail={job.outputs.length ? `${job.outputs.length} 份输出` : '暂无输出'} />
      </div>

      <section className="cron-output-section">
        <h3>最近输出</h3>
        {!job.outputs.length && <p className="scheduled-muted-copy">执行完成后，Hermes 会把 Markdown 输出保存到本机。</p>}
        {job.outputs.slice(0, 4).map((output) => (
          <div className="cron-output-card" key={output.path}>
            <FileText size={16} />
            <div>
              <strong>{output.name}</strong>
              <span>{formatBytes(output.size)} · {formatDate(output.createdAt)}</span>
              {output.preview && <p>{output.preview}</p>}
            </div>
          </div>
        ))}
      </section>
    </article>
  )
}

function CronJobModal({
  job,
  saving,
  workspaces,
  skills,
  onClose,
  onSubmit
}: {
  job: HermesCronJob | null
  saving: boolean
  workspaces: Workspace[]
  skills: Skill[]
  onClose: () => void
  onSubmit: (input: HermesCronJobInput) => void
}) {
  const [name, setName] = useState(job?.name ?? '')
  const [prompt, setPrompt] = useState(job?.prompt ?? '')
  const [schedule, setSchedule] = useState(job ? editableSchedule(job) : 'every 1d')
  const [workdir, setWorkdir] = useState(job?.workdir ?? workspaces[0]?.path ?? '')
  const [deliver, setDeliver] = useState(job?.deliver ?? 'local')
  const [repeatText, setRepeatText] = useState(job?.repeat.times ? String(job.repeat.times) : '')
  const [selectedSkills, setSelectedSkills] = useState<string[]>(job?.skills ?? [])
  const enabledSkills = skills.filter((skill) => skill.enabled).slice(0, 36)

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="cron-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit({
            name,
            prompt,
            schedule,
            workdir,
            deliver,
            repeat: repeatText.trim() ? Number(repeatText) : null,
            skills: selectedSkills
          })
        }}
      >
        <header>
          <div>
            <h2>{job ? '编辑定时任务' : '新建定时任务'}</h2>
            <p>任务说明必须自包含，因为 Hermes Cron 运行时不会继承当前对话上下文。</p>
          </div>
          <button type="button" className="settings-close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="cron-form-grid">
          <label>
            <span>任务名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：每日工作复盘" />
          </label>
          <label>
            <span>执行时间</span>
            <input value={schedule} onChange={(event) => setSchedule(event.target.value)} placeholder="every 1d / 30m / 0 9 * * *" />
          </label>
          <label>
            <span>授权工作区</span>
            <select value={workdir} onChange={(event) => setWorkdir(event.target.value)}>
              <option value="">不指定目录</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.path}>{workspace.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>结果投递</span>
            <select value={deliver} onChange={(event) => setDeliver(event.target.value)}>
              <option value="local">仅本机保存</option>
              <option value="origin">回到来源渠道</option>
              <option value="feishu">飞书默认渠道</option>
            </select>
          </label>
          <label>
            <span>执行次数</span>
            <input value={repeatText} onChange={(event) => setRepeatText(event.target.value)} inputMode="numeric" placeholder="留空表示长期运行" />
          </label>
        </div>

        <label className="cron-prompt-field">
          <span>任务说明</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="告诉 Hermes 到时间后要做什么、读取哪些目录、输出成什么格式。" />
        </label>

        <div className="cron-skill-picker">
          <span>绑定 Skill</span>
          <div>
            {enabledSkills.length ? enabledSkills.map((skill) => (
              <button
                type="button"
                key={skill.id}
                className={selectedSkills.includes(skill.name) ? 'active' : ''}
                onClick={() => {
                  setSelectedSkills((current) =>
                    current.includes(skill.name)
                      ? current.filter((item) => item !== skill.name)
                      : [...current, skill.name]
                  )
                }}
              >
                {skill.name}
              </button>
            )) : <p className="scheduled-muted-copy">暂无启用 Skill。</p>}
          </div>
        </div>

        <footer>
          <button type="button" className="ghost-button" onClick={onClose}>取消</button>
          <button className="send-button" disabled={saving}>
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            保存
          </button>
        </footer>
      </form>
    </div>
  )
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="cron-metric">
      <span>{title}</span>
      <strong>{value}</strong>
      <em>{detail}</em>
    </div>
  )
}

function JobStatusIcon({ job }: { job: HermesCronJob }) {
  if (!job.enabled) return <Pause size={16} />
  if (job.lastStatus === 'ok') return <CheckCircle2 size={16} />
  return <Clock3 size={16} />
}

function editableSchedule(job: HermesCronJob) {
  if (job.schedule.kind === 'interval' && job.schedule.minutes) return `every ${job.schedule.minutes}m`
  if (job.schedule.kind === 'cron' && job.schedule.expr) return job.schedule.expr
  if (job.schedule.kind === 'once' && job.schedule.run_at) return job.schedule.run_at
  return job.scheduleDisplay
}

function formatDate(value?: string | null) {
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
