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
  HermesCronJob,
  HermesCronJobInput,
  HermesCronState,
  Skill,
  Workspace
} from '../../lib/api'

type ScheduleMode = 'daily' | 'weekly' | 'monthly' | 'interval' | 'custom'
type IntervalUnit = 'm' | 'h' | 'd'
type SkillCategoryId = 'all' | 'document' | 'data' | 'browser' | 'office' | 'dev' | 'automation' | 'business' | 'other'
type ScheduleConfig = {
  mode: ScheduleMode
  time: string
  weekday: string
  monthDay: string
  intervalValue: string
  intervalUnit: IntervalUnit
  custom: string
}

const WEEKDAYS = [
  { value: '1', label: '周一' },
  { value: '2', label: '周二' },
  { value: '3', label: '周三' },
  { value: '4', label: '周四' },
  { value: '5', label: '周五' },
  { value: '6', label: '周六' },
  { value: '0', label: '周日' }
]

const SKILL_CATEGORIES: Array<{ id: SkillCategoryId; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'document', label: '文档文件' },
  { id: 'data', label: '数据表格' },
  { id: 'browser', label: '网页浏览' },
  { id: 'office', label: '办公协作' },
  { id: 'dev', label: '研发工具' },
  { id: 'automation', label: '自动化' },
  { id: 'business', label: '业务分析' },
  { id: 'other', label: '其他' }
]

type ScheduledTasksViewProps = {
  cronState: HermesCronState | null
  cronLoading: boolean
  cronError: string | null
  cronSaving: boolean
  cronMutatingId: string | null
  cronNotice: string | null
  workspaces: Workspace[]
  skills: Skill[]
  onRefreshCron: () => void
  onCreateCronJob: (input: HermesCronJobInput, onSuccess?: () => void) => void
  onUpdateCronJob: (jobId: string, input: HermesCronJobInput, onSuccess?: () => void) => void
  onRunCronAction: (jobId: string, action: 'pause' | 'resume' | 'run' | 'remove') => void
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
  onRefreshCron,
  onCreateCronJob,
  onUpdateCronJob,
  onRunCronAction
}: ScheduledTasksViewProps) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [editingJob, setEditingJob] = useState<HermesCronJob | null>(null)
  const [creating, setCreating] = useState(false)
  const jobs = cronState?.jobs ?? []
  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null,
    [jobs, selectedJobId]
  )
  const schedulerRunning = Boolean(cronState?.scheduler.running)

  return (
    <section className="product-page scheduled-page">
      <header className="product-page-head">
        <div>
          <h1>定时任务</h1>
          <p>把重复工作保存为任务，交给 Hermes 到点执行。</p>
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

      {(cronError || cronNotice) && (
        <div className={cronError ? 'scheduled-banner danger' : 'scheduled-banner'}>
          {cronError || cronNotice}
        </div>
      )}

      <div className="scheduled-shell">
        <aside className="scheduled-list-panel">
          <div className="scheduled-health-card">
            <div>
              <strong>自动运行</strong>
              <span>
                {schedulerRunning
                  ? 'Hermes 后台已运行，启用的定时任务会按周期自动执行。'
                  : '当前只会保存任务，不会自动执行。启动 Hermes 后台后，启用的任务会按周期运行。'}
              </span>
            </div>
            <span className={schedulerRunning ? 'status-pill ok' : 'status-pill warn'}>
              {schedulerRunning ? '正常' : '未开启'}
            </span>
          </div>

          <div className="scheduled-job-list">
            {!jobs.length && (
              <div className="scheduled-empty">
                <CalendarClock size={22} />
                <strong>还没有 Hermes 定时任务</strong>
                <span>这里会列出你创建的重复工作任务。</span>
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
              <span>点击“新建定时任务”，创建第一个自动执行的重复任务。</span>
            </div>
          )}
        </main>
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
  const initialSchedule = useMemo(() => scheduleConfigFromJob(job), [job])
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(initialSchedule.mode)
  const [scheduleTime, setScheduleTime] = useState(initialSchedule.time)
  const [scheduleWeekday, setScheduleWeekday] = useState(initialSchedule.weekday)
  const [scheduleMonthDay, setScheduleMonthDay] = useState(initialSchedule.monthDay)
  const [intervalValue, setIntervalValue] = useState(initialSchedule.intervalValue)
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(initialSchedule.intervalUnit)
  const [customSchedule, setCustomSchedule] = useState(initialSchedule.custom)
  const [workdir, setWorkdir] = useState(job?.workdir ?? workspaces[0]?.path ?? '')
  const [deliver, setDeliver] = useState(job?.deliver ?? 'local')
  const [repeatText, setRepeatText] = useState(job?.repeat.times ? String(job.repeat.times) : '')
  const [selectedSkills, setSelectedSkills] = useState<string[]>(job?.skills ?? [])
  const [skillCategory, setSkillCategory] = useState<SkillCategoryId>('all')
  const [skillQuery, setSkillQuery] = useState('')
  const enabledSkills = useMemo(() => skills.filter((skill) => skill.enabled), [skills])
  const categoryCounts = useMemo(() => {
    const counts = new Map<SkillCategoryId, number>()
    counts.set('all', enabledSkills.length)
    for (const skill of enabledSkills) {
      const category = inferSkillCategory(skill)
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    return counts
  }, [enabledSkills])
  const visibleSkillCategories = SKILL_CATEGORIES.filter((category) => category.id === 'all' || (categoryCounts.get(category.id) ?? 0) > 0)
  const filteredSkills = useMemo(() => {
    const query = skillQuery.trim().toLowerCase()
    return enabledSkills.filter((skill) => {
      const matchesCategory = skillCategory === 'all' || inferSkillCategory(skill) === skillCategory
      const haystack = `${skill.name} ${skill.description}`.toLowerCase()
      return matchesCategory && (!query || haystack.includes(query))
    })
  }, [enabledSkills, skillCategory, skillQuery])
  const scheduleValue = buildScheduleValue({
    mode: scheduleMode,
    time: scheduleTime,
    weekday: scheduleWeekday,
    monthDay: scheduleMonthDay,
    intervalValue,
    intervalUnit,
    custom: customSchedule
  })

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
            schedule: scheduleValue,
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
            <span>执行次数</span>
            <input value={repeatText} onChange={(event) => setRepeatText(event.target.value)} inputMode="numeric" placeholder="留空表示长期运行" />
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
        </div>

        <section className="cron-schedule-builder">
          <div className="cron-section-head">
            <strong>执行周期</strong>
            <span>{describeScheduleChoice(scheduleMode, scheduleTime, scheduleWeekday, scheduleMonthDay, intervalValue, intervalUnit, customSchedule)}</span>
          </div>
          <div className="cron-segmented-control" role="tablist" aria-label="选择执行周期">
            {[
              ['daily', '每天'],
              ['weekly', '每周'],
              ['monthly', '每月'],
              ['interval', '每隔'],
              ['custom', '高级']
            ].map(([mode, label]) => (
              <button
                type="button"
                key={mode}
                className={scheduleMode === mode ? 'active' : ''}
                onClick={() => setScheduleMode(mode as ScheduleMode)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="cron-schedule-fields">
            {scheduleMode === 'daily' && (
              <label>
                <span>每天时间</span>
                <input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} />
              </label>
            )}
            {scheduleMode === 'weekly' && (
              <>
                <label>
                  <span>星期</span>
                  <select value={scheduleWeekday} onChange={(event) => setScheduleWeekday(event.target.value)}>
                    {WEEKDAYS.map((weekday) => (
                      <option key={weekday.value} value={weekday.value}>{weekday.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>时间</span>
                  <input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} />
                </label>
              </>
            )}
            {scheduleMode === 'monthly' && (
              <>
                <label>
                  <span>每月日期</span>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={scheduleMonthDay}
                    onChange={(event) => setScheduleMonthDay(clampNumberText(event.target.value, 1, 31))}
                  />
                </label>
                <label>
                  <span>时间</span>
                  <input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} />
                </label>
              </>
            )}
            {scheduleMode === 'interval' && (
              <>
                <label>
                  <span>间隔</span>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={intervalValue}
                    onChange={(event) => setIntervalValue(clampNumberText(event.target.value, 1, 999))}
                  />
                </label>
                <label>
                  <span>单位</span>
                  <select value={intervalUnit} onChange={(event) => setIntervalUnit(event.target.value as IntervalUnit)}>
                    <option value="m">分钟</option>
                    <option value="h">小时</option>
                    <option value="d">天</option>
                  </select>
                </label>
              </>
            )}
            {scheduleMode === 'custom' && (
              <label className="cron-custom-schedule">
                <span>高级表达式</span>
                <input
                  value={customSchedule}
                  onChange={(event) => setCustomSchedule(event.target.value)}
                  placeholder="例如：0 9 * * * 或 every 2h"
                />
              </label>
            )}
          </div>
        </section>

        <label className="cron-prompt-field">
          <span>任务说明</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="告诉 Hermes 到时间后要做什么、读取哪些目录、输出成什么格式。" />
        </label>

        <div className="cron-skill-picker">
          <div className="cron-section-head">
            <strong>绑定 Skill</strong>
            <span>{selectedSkills.length ? `已选择 ${selectedSkills.length} 个` : '可选。用于让任务复用固定工作方法。'}</span>
          </div>
          <div className="cron-skill-selector">
            <div className="cron-skill-categories">
              {visibleSkillCategories.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  className={skillCategory === category.id ? 'active' : ''}
                  onClick={() => setSkillCategory(category.id)}
                >
                  <span>{category.label}</span>
                  <em>{categoryCounts.get(category.id) ?? 0}</em>
                </button>
              ))}
            </div>
            <div className="cron-skill-results">
              <input
                value={skillQuery}
                onChange={(event) => setSkillQuery(event.target.value)}
                placeholder="搜索 Skill"
              />
              <div>
                {filteredSkills.length ? filteredSkills.map((skill) => {
                  const selected = selectedSkills.includes(skill.name)
                  return (
                    <button
                      type="button"
                      key={skill.id}
                      className={selected ? 'active' : ''}
                      onClick={() => {
                        setSelectedSkills((current) =>
                          current.includes(skill.name)
                            ? current.filter((item) => item !== skill.name)
                            : [...current, skill.name]
                        )
                      }}
                    >
                      <span>{selected ? '✓' : '+'}</span>
                      <strong>{skill.name}</strong>
                      <em>{skill.description || skill.path}</em>
                    </button>
                  )
                }) : <p className="scheduled-muted-copy">没有匹配的 Skill。</p>}
              </div>
            </div>
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

function scheduleConfigFromJob(job: HermesCronJob | null): ScheduleConfig {
  const fallback = {
    mode: 'daily' as ScheduleMode,
    time: '18:00',
    weekday: '1',
    monthDay: '1',
    intervalValue: '1',
    intervalUnit: 'd' as IntervalUnit,
    custom: '0 18 * * *'
  }
  if (!job) return fallback

  if (job.schedule.kind === 'interval' && job.schedule.minutes) {
    const interval = splitIntervalMinutes(job.schedule.minutes)
    return {
      ...fallback,
      mode: 'interval' as ScheduleMode,
      intervalValue: String(interval.value),
      intervalUnit: interval.unit,
      custom: `every ${interval.value}${interval.unit}`
    }
  }

  if (job.schedule.kind === 'cron' && job.schedule.expr) {
    const cron = parseCronExpression(job.schedule.expr)
    if (cron) return { ...fallback, ...cron, custom: job.schedule.expr }
    return { ...fallback, mode: 'custom' as ScheduleMode, custom: job.schedule.expr }
  }

  if (job.schedule.kind === 'once' && job.schedule.run_at) {
    return { ...fallback, mode: 'custom' as ScheduleMode, custom: job.schedule.run_at }
  }

  return { ...fallback, mode: 'custom' as ScheduleMode, custom: job.scheduleDisplay }
}

function splitIntervalMinutes(minutes: number): { value: number; unit: IntervalUnit } {
  if (minutes % 1440 === 0) return { value: minutes / 1440, unit: 'd' }
  if (minutes % 60 === 0) return { value: minutes / 60, unit: 'h' }
  return { value: minutes, unit: 'm' }
}

function parseCronExpression(expr: string): Partial<ScheduleConfig> | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return null
  const [minute, hour, day, month, weekday] = parts
  if (!isPlainCronNumber(minute) || !isPlainCronNumber(hour)) return null
  const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
  if (day === '*' && month === '*' && weekday === '*') {
    return { mode: 'daily', time }
  }
  if (day === '*' && month === '*' && isPlainCronNumber(weekday)) {
    return { mode: 'weekly', time, weekday }
  }
  if (month === '*' && weekday === '*' && isPlainCronNumber(day)) {
    return { mode: 'monthly', time, monthDay: day }
  }
  return null
}

function isPlainCronNumber(value: string) {
  return /^\d+$/.test(value)
}

function buildScheduleValue(config: {
  mode: ScheduleMode
  time: string
  weekday: string
  monthDay: string
  intervalValue: string
  intervalUnit: IntervalUnit
  custom: string
}) {
  const [hour = '18', minute = '00'] = config.time.split(':')
  if (config.mode === 'daily') return `${Number(minute)} ${Number(hour)} * * *`
  if (config.mode === 'weekly') return `${Number(minute)} ${Number(hour)} * * ${config.weekday}`
  if (config.mode === 'monthly') return `${Number(minute)} ${Number(hour)} ${config.monthDay || '1'} * *`
  if (config.mode === 'interval') return `every ${config.intervalValue || '1'}${config.intervalUnit}`
  return config.custom.trim()
}

function describeScheduleChoice(
  mode: ScheduleMode,
  time: string,
  weekday: string,
  monthDay: string,
  intervalValue: string,
  intervalUnit: IntervalUnit,
  custom: string
) {
  if (mode === 'daily') return `每天 ${time} 执行`
  if (mode === 'weekly') return `每周${WEEKDAYS.find((item) => item.value === weekday)?.label.replace('周', '') ?? '一'} ${time} 执行`
  if (mode === 'monthly') return `每月 ${monthDay || '1'} 日 ${time} 执行`
  if (mode === 'interval') return `每隔 ${intervalValue || '1'} ${intervalUnitLabel(intervalUnit)}执行一次`
  return custom.trim() ? `高级：${custom.trim()}` : '填写高级执行表达式'
}

function intervalUnitLabel(unit: IntervalUnit) {
  if (unit === 'm') return '分钟'
  if (unit === 'h') return '小时'
  return '天'
}

function clampNumberText(value: string, min: number, max: number) {
  if (!value.trim()) return ''
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(min)
  return String(Math.max(min, Math.min(max, Math.round(numeric))))
}

function inferSkillCategory(skill: Skill): SkillCategoryId {
  const text = `${skill.name} ${skill.description} ${skill.path}`.toLowerCase()
  if (matchesAny(text, ['doc', 'document', 'pdf', 'ppt', 'presentation', 'word', 'markdown', 'file', 'documents'])) return 'document'
  if (matchesAny(text, ['sheet', 'spreadsheet', 'excel', 'csv', 'xlsx', 'data', 'analysis', 'analytics'])) return 'data'
  if (matchesAny(text, ['browser', 'web', 'search', 'crawler', '网页', '调研'])) return 'browser'
  if (matchesAny(text, ['lark', 'feishu', 'gmail', 'calendar', 'mail', 'approval', '飞书', '审批', '日历'])) return 'office'
  if (matchesAny(text, ['github', 'debug', 'build', 'run', 'swift', 'macos', 'code', 'plugin', '开发', '研发'])) return 'dev'
  if (matchesAny(text, ['automation', 'automate', 'workflow', 'scheduled', '自动化'])) return 'automation'
  if (matchesAny(text, ['business', 'growth', 'gmv', 'campaign', 'xhs', '小红书', '业务', '增长'])) return 'business'
  return 'other'
}

function matchesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword))
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
