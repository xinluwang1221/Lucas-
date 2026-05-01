import {
  Archive,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  XCircle
} from 'lucide-react'
import type {
  HermesAutoUpdateResult,
  HermesCompatibilityTestResult,
  HermesUpdateStatus
} from '../../lib/api'

export function HermesUpdatePanel({
  status,
  loading,
  error,
  testResult,
  testRunning,
  testError,
  autoUpdateResult,
  autoUpdating,
  autoUpdateError,
  onRefresh,
  onRunTest,
  onRunAutoUpdate
}: {
  status: HermesUpdateStatus | null
  loading: boolean
  error: string | null
  testResult: HermesCompatibilityTestResult | null
  testRunning: boolean
  testError: string | null
  autoUpdateResult: HermesAutoUpdateResult | null
  autoUpdating: boolean
  autoUpdateError: string | null
  onRefresh: () => void
  onRunTest: () => void
  onRunAutoUpdate: () => void
}) {
  if (!status && loading) {
    return (
      <div className="hermes-update-empty">
        <Loader2 size={16} className="spin" />
        正在检查 Hermes 和 GitHub 版本...
      </div>
    )
  }

  if (!status) {
    return (
      <div className="hermes-update-empty">
        <span>{error || '还没有读取 Hermes 更新状态。'}</span>
        <button className="settings-add-button" onClick={onRefresh}>
          <RefreshCw size={14} />
          检查更新
        </button>
      </div>
    )
  }

  const manualTestSupersedesAutoUpdate = Boolean(
    autoUpdateResult &&
    testResult?.status === 'passed' &&
    Date.parse(testResult.completedAt) > Date.parse(autoUpdateResult.completedAt)
  )
  const visibleAutoUpdateResult = manualTestSupersedesAutoUpdate ? null : autoUpdateResult
  const displayStatus = testResult?.status === 'passed' && !status.updateAvailable ? 'verified' : status.compatibility.status
  const statusClass = `hermes-update-banner ${displayStatus}`
  const statusLabel = {
    verified: '可继续使用',
    'needs-review': '升级前需复测',
    blocked: '暂不建议升级',
    unknown: '需要检查'
  }[displayStatus]
  const statusIcon = displayStatus === 'blocked'
    ? <XCircle size={18} />
    : displayStatus === 'verified'
      ? <CheckCircle2 size={18} />
      : <RefreshCw size={18} />
  const headline = status.updateAvailable
    ? `发现 Hermes 新版本 ${status.latestTag || ''}`.trim()
    : displayStatus === 'verified'
      ? '当前很好，无需操作'
      : displayStatus === 'blocked'
        ? '暂不建议更新 Hermes'
        : status.compatibility.title
  const decisionDetail = displayStatus === 'verified' && !status.updateAvailable
    ? '当前 Hermes 后端可用，也没有需要升级的版本。技术诊断信息已收起，日常使用不用处理这里。'
    : status.compatibility.detail
  const versionText = status.latestTag && status.latestTag !== status.currentTag
    ? `${status.currentTag || '未知'} → ${status.latestTag}`
    : `${status.currentTag || status.currentVersion || '未知版本'}`
  const canAutoUpdate = Boolean(status.updateAvailable && testResult?.status === 'passed' && displayStatus !== 'blocked')
  const autoUpdateHint = canAutoUpdate
    ? '前测已通过，Cowork 会自动备份、更新并复测。'
    : status.updateAvailable
      ? '先运行复测，通过后才能自动更新。'
      : '当前没有检测到 Hermes 可用更新。'

  return (
    <div className="hermes-update-panel">
      <div className={statusClass}>
        <div className="hermes-update-status-icon">{statusIcon}</div>
        <div className="hermes-update-summary-copy">
          <span>Hermes 后台更新</span>
          <strong>{headline}</strong>
          <p>{decisionDetail}</p>
          <div className="hermes-update-version-strip">
            <span>当前 {versionText}</span>
            <span>{status.updateAvailable ? '有可用更新' : '无需更新'}</span>
            <span>{displayStatus === 'verified' ? '无需操作' : statusLabel}</span>
          </div>
        </div>
      </div>

      <div className="hermes-update-actions">
        <button className="settings-add-button" onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          检查更新
        </button>
        <button className="hermes-update-test-button" onClick={onRunTest} disabled={testRunning || autoUpdating}>
          {testRunning ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
          {testRunning ? '复测中' : '运行复测'}
        </button>
        {status.updateAvailable && (
          <button
            className="hermes-auto-update-button"
            onClick={onRunAutoUpdate}
            disabled={!canAutoUpdate || autoUpdating || testRunning}
            title={autoUpdateHint}
          >
            {autoUpdating ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            {autoUpdating ? '正在更新' : '自动更新'}
          </button>
        )}
        <a className="settings-link-button" href={status.repoUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={13} />
          GitHub
        </a>
      </div>

      {error && <div className="settings-error-line">{error}</div>}
      {testError && <div className="settings-error-line">{testError}</div>}
      {autoUpdateError && <div className="settings-error-line">{autoUpdateError}</div>}

      <div className="hermes-update-result-stack">
        <HermesCompatibilityResultCard result={testResult} running={testRunning} onRun={onRunTest} />
        <HermesAutoUpdateResultCard result={visibleAutoUpdateResult} running={autoUpdating} />
      </div>

      <details className="hermes-update-diagnostics">
        <summary>
          <span>诊断详情</span>
          <em>{statusLabel}</em>
        </summary>
        <div className="hermes-update-grid">
          <div>
            <span>本机 Hermes</span>
            <strong>{status.currentTag || '未知'}</strong>
            <small title={status.currentVersion}>{status.currentVersion}</small>
          </div>
          <div>
            <span>GitHub 最新</span>
            <strong>{status.latestTag || '未读取到'}</strong>
            <small>{status.updateAvailable ? '有可用更新' : '当前无需更新'}</small>
          </div>
          <div>
            <span>Cowork 验证基线</span>
            <strong>{status.verifiedCoworkTag}</strong>
            <small>超过该版本需要复测</small>
          </div>
          <div>
            <span>本机仓库</span>
            <strong>{status.branch || '未知分支'}</strong>
            <small>{status.workingTreeDirty ? '有未提交改动' : status.commitsBehind ? `落后 ${status.commitsBehind} 个提交` : '工作树干净'}</small>
          </div>
        </div>

        <div className="hermes-update-checks">
          {status.checks.map((check) => (
            <div className={check.ok ? 'ok' : 'failed'} key={check.id}>
              {check.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              <div>
                <strong>{check.label}</strong>
                <span title={check.detail}>{check.detail}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="hermes-update-notes">
          <strong>升级前建议</strong>
          <ul>
            {status.compatibility.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </div>
      </details>
    </div>
  )
}

function HermesCompatibilityResultCard({
  result,
  running,
  onRun
}: {
  result: HermesCompatibilityTestResult | null
  running: boolean
  onRun: () => void
}) {
  if (!result && !running) {
    return (
      <div className="hermes-smoke-card pending">
        <div>
          <strong>还没有本轮复测结果</strong>
          <span>复测会真实调用 Hermes，确认 Cowork 与当前后端仍能配合。</span>
        </div>
        <button className="settings-add-button" onClick={onRun}>
          <Play size={14} />
          复测
        </button>
      </div>
    )
  }

  if (running) {
    return (
      <div className="hermes-smoke-card running">
        <Loader2 size={18} className="spin" />
        <div>
          <strong>正在复测 Hermes</strong>
          <span>正在跑一个最小真实任务，完成后会给出是否可继续使用。</span>
        </div>
      </div>
    )
  }

  if (!result) return null
  const failedStep = result.steps.find((step) => step.status === 'failed')
  const summary = failedStep?.detail || result.smokeTask?.responsePreview || result.detail

  return (
    <div className={`hermes-smoke-card ${result.status}`}>
      <div className="hermes-smoke-head">
        <div>
          <strong>{result.title}</strong>
          <span>{summary}</span>
        </div>
        <em>{result.status === 'passed' ? '通过' : '失败'}</em>
      </div>
      <details className="hermes-compact-details">
        <summary>查看 {result.steps.length} 项复测明细</summary>
        <div className="hermes-smoke-steps">
          {result.steps.map((step) => (
            <div className={step.status} key={step.id}>
              {step.status === 'passed' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              <div>
                <strong>{step.label}</strong>
                <span>{step.detail}</span>
              </div>
              <time>{formatDuration(step.elapsedMs)}</time>
            </div>
          ))}
        </div>
        {result.smokeTask && (
          <div className="hermes-smoke-response">
            <span>小任务返回</span>
            <strong>{result.smokeTask.responsePreview || '无正文预览'}</strong>
            <small>{result.smokeTask.eventCount} 个事件{result.smokeTask.sessionId ? ` · ${shortSessionId(result.smokeTask.sessionId)}` : ''}</small>
          </div>
        )}
      </details>
    </div>
  )
}

function HermesAutoUpdateResultCard({
  result,
  running
}: {
  result: HermesAutoUpdateResult | null
  running: boolean
}) {
  if (!result && !running) return null

  if (running) {
    return (
      <div className="hermes-auto-update-card running">
        <Loader2 size={18} className="spin" />
        <div>
          <strong>正在执行自动更新</strong>
          <span>Cowork 正在备份配置、更新 Hermes，并在结束后自动复测。</span>
        </div>
      </div>
    )
  }

  if (!result) return null
  const afterLabel = result.after?.currentTag || result.after?.currentVersion || '未完成'
  const backupLabel = result.backupDir ? result.backupDir.replace(/^.*\/hermes-update-backups\//, 'data/hermes-update-backups/') : '未创建备份'

  return (
    <div className={`hermes-auto-update-card ${result.status}`}>
      <div className="hermes-auto-update-head">
        <div>
          <strong>{result.title}</strong>
          <span>{result.detail}</span>
        </div>
        <em>{result.status === 'passed' ? '已完成' : '需要处理'}</em>
      </div>
      <div className="hermes-auto-update-summary">
        <div>
          <span>更新前</span>
          <strong>{result.before.currentTag || result.before.currentVersion}</strong>
        </div>
        <div>
          <span>更新后</span>
          <strong>{afterLabel}</strong>
        </div>
        <div>
          <span>前置复测</span>
          <strong>{result.preTest.status === 'passed' ? '通过' : '失败'}</strong>
        </div>
        <div>
          <span>升级后复测</span>
          <strong>{result.postTest ? (result.postTest.status === 'passed' ? '通过' : '失败') : '未执行'}</strong>
        </div>
      </div>
      <details className="hermes-compact-details">
        <summary>备份与命令输出</summary>
        <div className="hermes-auto-update-backup">
          <Archive size={15} />
          <div>
            <strong>配置备份</strong>
            <span title={result.backupDir || ''}>{backupLabel}</span>
            <small>{result.backupFiles.length ? `${result.backupFiles.length} 个文件已备份` : '没有找到需要备份的配置文件'}</small>
          </div>
        </div>
        {(result.stdout || result.stderr) && (
          <div className="hermes-update-log">
            {result.stdout && <pre>{result.stdout}</pre>}
            {result.stderr && <pre>{result.stderr}</pre>}
          </div>
        )}
      </details>
      <small className="hermes-auto-update-time">完成于 {formatTime(result.completedAt)}</small>
    </div>
  )
}

function shortSessionId(value: string) {
  return value.split('/').pop()?.slice(0, 10) ?? value.slice(0, 10)
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} 分 ${seconds % 60} 秒`
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}
