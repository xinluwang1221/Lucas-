import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runHermesPythonBridge } from './hermes_python.js'
import { readHermesMcpConfig } from './mcp.js'
import { listModelOptions, readHermesModelOverview } from './models.js'
import { dataDir, hermesAgentDir, hermesBin, hermesPythonBin } from './paths.js'
import { AppState, HermesAutoUpdateResult, HermesCompatibilityTestResult, HermesUpdateStatus } from './types.js'

const HERMES_REPO_URL = 'https://github.com/NousResearch/hermes-agent'
const COWORK_TESTED_HERMES_TAG = process.env.COWORK_TESTED_HERMES_TAG || 'v2026.4.13'

export async function readHermesUpdateStatus(): Promise<HermesUpdateStatus> {
  const [
    versionResult,
    describeResult,
    commitResult,
    remoteResult,
    branchResult,
    statusResult,
    remoteTagsResult,
    remoteHeadResult
  ] = await Promise.all([
    settle(runHermes(['version'])),
    settle(runGit(['describe', '--tags', '--always', '--dirty'])),
    settle(runGit(['rev-parse', '--short', 'HEAD'])),
    settle(runGit(['remote', 'get-url', 'origin'])),
    settle(runGit(['branch', '--show-current'])),
    settle(runGit(['status', '--short', '--branch'])),
    settle(runGit(['ls-remote', '--tags', '--sort=-v:refname', 'origin', 'refs/tags/v*'], 30000)),
    settle(runGit(['ls-remote', 'origin', 'HEAD'], 30000))
  ])

  const versionText = valueOr(versionResult, '')
  const describeText = valueOr(describeResult, '未知')
  const currentTag = extractTag(describeText) || extractVersionTag(versionText) || '未知'
  const currentVersion = firstLine(versionText) || describeText
  const latest = parseLatestRemoteTag(valueOr(remoteTagsResult, ''))
  const statusText = valueOr(statusResult, '')
  const commitsBehind = parseBehindCount(statusText)
  const workingTreeDirty = statusText
    .split('\n')
    .some((line) => line.trim() && !line.startsWith('##'))
  const latestTag = latest?.tag
  const updateAvailable = Boolean(
    (latestTag && compareHermesTags(latestTag, currentTag) > 0) ||
    (typeof commitsBehind === 'number' && commitsBehind > 0)
  )
  const checks = [
    {
      id: 'binary',
      label: 'Hermes 命令',
      ok: fs.existsSync(hermesBin) && versionResult.ok,
      detail: versionResult.ok ? firstLine(versionResult.value) || hermesBin : valueOr(versionResult, '无法执行 hermes version')
    },
    {
      id: 'repo',
      label: 'Hermes 项目目录',
      ok: fs.existsSync(hermesAgentDir) && commitResult.ok,
      detail: commitResult.ok ? `${hermesAgentDir} · ${commitResult.value}` : hermesAgentDir
    },
    {
      id: 'python',
      label: 'Python Bridge',
      ok: fs.existsSync(hermesPythonBin),
      detail: hermesPythonBin
    },
    {
      id: 'remote',
      label: 'GitHub 更新源',
      ok: remoteTagsResult.ok && Boolean(latestTag),
      detail: latestTag ? `最新 tag ${latestTag}` : valueOr(remoteTagsResult, '未读取到远程 tag')
    }
  ]

  return {
    repoPath: hermesAgentDir,
    repoUrl: HERMES_REPO_URL,
    remoteUrl: valueOr(remoteResult, HERMES_REPO_URL),
    branch: valueOr(branchResult, '未知'),
    currentVersion,
    currentTag,
    currentCommit: valueOr(commitResult, '未知'),
    latestTag,
    latestCommit: latest?.commit || parseRemoteHeadCommit(valueOr(remoteHeadResult, '')),
    commitsBehind,
    updateAvailable,
    workingTreeDirty,
    verifiedCoworkTag: COWORK_TESTED_HERMES_TAG,
    compatibility: buildCompatibility({
      currentTag,
      latestTag,
      updateAvailable,
      workingTreeDirty,
      statusText,
      checksOk: checks.every((check) => check.ok)
    }),
    checks,
    commands: {
      check: 'hermes version && hermes status',
      update: 'hermes update',
      rollback: `cd ${hermesAgentDir} && git checkout ${COWORK_TESTED_HERMES_TAG}`
    },
    updatedAt: new Date().toISOString()
  }
}

export async function runHermesCompatibilityTest(state: AppState): Promise<HermesCompatibilityTestResult> {
  const id = `compat-${Date.now()}`
  const startedAt = new Date().toISOString()
  const steps: HermesCompatibilityTestResult['steps'] = []
  const updateStatus = await readHermesUpdateStatus()
  let smokeTask: HermesCompatibilityTestResult['smokeTask'] | undefined

  await recordStep(steps, 'hermes-version', 'Hermes 版本与状态', async () => {
    const [versionText, statusText] = await Promise.all([
      runHermes(['version']),
      runHermes(['status'])
    ])
    if (!versionText || !statusText) throw new Error('Hermes 没有返回版本或状态。')
    return firstLine(versionText)
  })

  await recordStep(steps, 'cowork-models', '模型配置 Adapter', async () => {
    const overview = readHermesModelOverview(state.modelSettings)
    const options = listModelOptions(state.modelSettings)
    if (!overview.defaultModel) throw new Error('没有读取到 Hermes 默认模型。')
    if (!options.some((model) => model.id === 'auto')) throw new Error('Cowork 模型候选缺少 Hermes 默认项。')
    return `${overview.providerLabel || overview.provider} · ${overview.defaultModel} · ${options.length} 个可选模型`
  })

  await recordStep(steps, 'cowork-mcp', 'MCP 配置 Adapter', async () => {
    const config = readHermesMcpConfig()
    if (!Array.isArray(config.servers)) throw new Error('MCP 配置结构异常。')
    const enabledCount = config.servers.filter((server) => server.enabled).length
    return `读取 ${config.servers.length} 个 MCP 服务，${enabledCount} 个启用`
  })

  await recordStep(steps, 'hermes-bridge-smoke', '真实 Hermes Bridge 小任务', async () => {
    const smokeDir = path.join(dataDir, 'compatibility-tests', id)
    fs.mkdirSync(smokeDir, { recursive: true })
    fs.writeFileSync(path.join(smokeDir, 'README.md'), '# Hermes Cowork compatibility smoke test\n', 'utf8')

    let childProcess: { kill: (signal?: NodeJS.Signals) => boolean } | undefined
    const result = await withTimeout(
      runHermesPythonBridge({
        taskId: id,
        cwd: smokeDir,
        maxTurns: 1,
        prompt: '这是 Hermes Cowork 兼容性自动复测。请只回复 COWORK_SMOKE_OK，不要调用工具，不要创建文件。',
        onProcess: (process) => {
          childProcess = process
        }
      }),
      120000,
      () => childProcess?.kill('SIGTERM')
    )

    const responsePreview = result.finalResponse.trim().slice(0, 180)
    smokeTask = {
      sessionId: result.sessionId,
      responsePreview,
      eventCount: result.events.length
    }

    if (result.exitCode !== 0) {
      const bridgeError = result.error || result.stderr.trim() || '无错误输出'
      throw new Error(`Hermes Bridge 退出码 ${result.exitCode ?? '未知'}：${bridgeError.slice(0, 180)}`)
    }
    if (!responsePreview) {
      throw new Error('Hermes Bridge 没有返回最终文本。')
    }
    return `已返回 ${result.events.length} 个事件${result.sessionId ? `，Session ${result.sessionId}` : ''}`
  })

  const failed = steps.filter((step) => step.status === 'failed')
  const completedAt = new Date().toISOString()
  return {
    id,
    status: failed.length ? 'failed' : 'passed',
    title: failed.length ? '自动复测未通过' : '自动复测通过',
    detail: failed.length
      ? `有 ${failed.length} 项检查失败。先修复失败项，再升级 Hermes。`
      : 'Hermes 命令、Cowork 后端 Adapter、MCP/模型配置和真实 Bridge 小任务都通过，可以进入升级或升级后验证流程。',
    version: {
      currentTag: updateStatus.currentTag,
      latestTag: updateStatus.latestTag,
      verifiedCoworkTag: updateStatus.verifiedCoworkTag
    },
    steps,
    smokeTask,
    startedAt,
    completedAt
  }
}

export async function runHermesAutoUpdate(state: AppState): Promise<HermesAutoUpdateResult> {
  const id = `hermes-update-${Date.now()}`
  const startedAt = new Date().toISOString()
  let stage: HermesAutoUpdateResult['stage'] = 'precheck'
  const command = 'hermes update'
  const before = await readHermesUpdateStatus()
  const preTest = await runHermesCompatibilityTest(state)
  const backupFiles: string[] = []

  const finish = (result: Partial<HermesAutoUpdateResult> & Pick<HermesAutoUpdateResult, 'status' | 'title' | 'detail'>): HermesAutoUpdateResult => ({
    id,
    stage,
    backupFiles,
    command,
    stdout: '',
    stderr: '',
    exitCode: null,
    before,
    preTest,
    startedAt,
    completedAt: new Date().toISOString(),
    ...result
  })

  if (before.compatibility.status === 'blocked') {
    return finish({
      status: 'failed',
      title: '自动更新已停止',
      detail: before.compatibility.detail,
      stage: 'precheck'
    })
  }

  if (preTest.status !== 'passed') {
    return finish({
      status: 'failed',
      title: '前置复测未通过',
      detail: 'Cowork 没有执行 Hermes 更新。请先修复自动复测失败项，再重新触发自动更新。',
      stage: 'precheck'
    })
  }

  if (!before.updateAvailable) {
    return finish({
      status: 'passed',
      title: '当前无需更新',
      detail: 'Cowork 已完成前置复测，本机 Hermes 没有检测到可用更新，因此没有执行 hermes update。',
      stage: 'completed'
    })
  }

  stage = 'backup'
  const backupDir = path.join(dataDir, 'hermes-update-backups', id)
  fs.mkdirSync(backupDir, { recursive: true })
  for (const filePath of hermesBackupSources()) {
    const copied = copyIfExists(filePath, backupDir)
    if (copied) backupFiles.push(copied)
  }
  fs.writeFileSync(
    path.join(backupDir, 'metadata.json'),
    JSON.stringify({
      id,
      createdAt: new Date().toISOString(),
      hermes: {
        repoPath: before.repoPath,
        currentTag: before.currentTag,
        currentCommit: before.currentCommit,
        latestTag: before.latestTag,
        latestCommit: before.latestCommit
      },
      cowork: {
        verifiedHermesTag: before.verifiedCoworkTag
      },
      copiedFiles: backupFiles
    }, null, 2),
    'utf8'
  )

  stage = 'update'
  const updateResult = await runHermesUpdateCommand()
  const stdout = previewOutput(updateResult.stdout)
  const stderr = previewOutput(updateResult.stderr)

  if (updateResult.exitCode !== 0) {
    return finish({
      status: 'failed',
      title: 'Hermes 更新命令失败',
      detail: 'Cowork 已完成配置备份，但 hermes update 没有成功结束。请查看命令输出，必要时用备份目录恢复配置。',
      stage,
      backupDir,
      stdout,
      stderr,
      exitCode: updateResult.exitCode
    })
  }

  stage = 'postcheck'
  const after = await readHermesUpdateStatus()
  const postTest = await runHermesCompatibilityTest(state)
  if (postTest.status !== 'passed') {
    return finish({
      status: 'failed',
      title: '已更新，但升级后复测未通过',
      detail: 'Hermes 更新命令已成功返回，但 Cowork 的升级后复测发现异常。请先不要继续升级其他电脑，按失败项修复或回滚。',
      stage,
      backupDir,
      stdout,
      stderr,
      exitCode: updateResult.exitCode,
      after,
      postTest
    })
  }

  stage = 'completed'
  return finish({
    status: 'passed',
    title: 'Hermes 已自动更新并复测通过',
    detail: 'Cowork 已备份 Hermes 本机配置，执行 hermes update，并在升级后完成模型、MCP 与真实 Bridge 小任务复测。',
    stage,
    backupDir,
    stdout,
    stderr,
    exitCode: updateResult.exitCode,
    after,
    postTest
  })
}

function buildCompatibility(params: {
  currentTag: string
  latestTag?: string
  updateAvailable: boolean
  workingTreeDirty: boolean
  statusText: string
  checksOk: boolean
}): HermesUpdateStatus['compatibility'] {
  const latestBeyondVerified = params.latestTag
    ? compareHermesTags(params.latestTag, COWORK_TESTED_HERMES_TAG) > 0
    : false
  const currentBeyondVerified = compareHermesTags(params.currentTag, COWORK_TESTED_HERMES_TAG) > 0

  if (!params.checksOk) {
    return {
      status: 'blocked',
      title: '当前环境需要先修复',
      detail: 'Cowork 没有完整读到 Hermes 命令、项目目录或 GitHub 更新源，暂不建议升级。',
      notes: [
        '先确认 hermes version 可以正常执行。',
        '确认 Hermes 项目目录和 Python venv 仍在本机。',
        '更新前不要修改 Cowork 的 Hermes 适配层。'
      ]
    }
  }

  if (params.workingTreeDirty && params.updateAvailable) {
    return {
      status: 'blocked',
      title: '先处理本机改动，再更新 Hermes',
      detail: '当前有新版本，但 Hermes 项目目录里还有本机改动。为了避免更新覆盖这些改动，先交给维护者备份或清理，再继续升级。',
      notes: [
        '当前 Cowork 会继续使用现有 Hermes。',
        '暂时不要运行自动更新。',
        '清理本机改动后重新检查更新并运行复测。'
      ]
    }
  }

  if (params.updateAvailable && latestBeyondVerified) {
    return {
      status: 'needs-review',
      title: '有新版本，但需要兼容性复测',
      detail: `Cowork 当前验证基线是 ${COWORK_TESTED_HERMES_TAG}；GitHub 最新版本是 ${params.latestTag}。升级前建议先备份配置并做一次小任务验证。`,
      notes: [
        '重点验证模型配置、MCP 配置、session 续聊和流式事件。',
        '升级后先运行 hermes version、hermes status，再用 Cowork 发起一个小任务。',
        '如果 Hermes CLI 参数或配置结构变化，Cowork 适配层可能需要同步修改。'
      ]
    }
  }

  if (params.updateAvailable) {
    return {
      status: 'needs-review',
      title: '有更新，风险较低但仍需检查',
      detail: '远程 main 有新提交，但没有超过 Cowork 当前标记的验证版本。建议升级后跑一次 smoke test。',
      notes: [
        '升级前备份 ~/.hermes/config.yaml 和 ~/.hermes/.env。',
        '升级后检查模型、MCP 和一个简单对话任务。',
        '如发现 Failed to fetch，优先重启 Cowork API。'
      ]
    }
  }

  if (currentBeyondVerified) {
    return {
      status: 'needs-review',
      title: '当前 Hermes 是新版，建议复测一次',
      detail: '本机 Hermes 已经高于 Cowork 的旧验证基线。没有可用更新，但建议运行一次复测；复测通过后，这里会显示“当前很好，无需操作”。',
      notes: [
        '点击“运行复测”。',
        '复测通过后可继续正常使用。',
        '如果复测失败，再按失败项处理。'
      ]
    }
  }

  return {
    status: 'verified',
    title: '当前很好，无需操作',
    detail: params.workingTreeDirty
      ? '当前没有可用更新，Hermes 也能继续使用。本机仓库改动属于维护信息，已收进诊断详情；等下次真的要升级时再处理。'
      : '本机 Hermes 没有检测到需要立刻升级的版本差异，可以继续使用。',
    notes: [
      '当前不用做任何处理。',
      '需要升级时再运行复测。',
      '技术诊断信息仅用于后续维护排查。'
    ]
  }
}

async function recordStep(
  steps: HermesCompatibilityTestResult['steps'],
  id: string,
  label: string,
  action: () => Promise<string> | string
) {
  const started = Date.now()
  try {
    const detail = await action()
    steps.push({
      id,
      label,
      status: 'passed',
      detail,
      elapsedMs: Date.now() - started
    })
  } catch (error) {
    steps.push({
      id,
      label,
      status: 'failed',
      detail: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - started
    })
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeout = setTimeout(() => {
      onTimeout()
      reject(new Error(`超过 ${Math.round(timeoutMs / 1000)} 秒仍未完成`))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}

function runHermes(args: string[], timeout = 15000) {
  return runCommand(hermesBin, args, hermesAgentDir, timeout)
}

function runGit(args: string[], timeout = 15000) {
  return runCommand('git', args, hermesAgentDir, timeout)
}

function runHermesUpdateCommand(timeout = 600000) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve) => {
    execFile(hermesBin, ['update'], { cwd: hermesAgentDir, timeout }, (error, stdout, stderr) => {
      const code = error
        ? Number.isInteger((error as { code?: unknown }).code) ? Number((error as { code?: unknown }).code) : null
        : 0
      resolve({
        stdout: String(stdout).trim(),
        stderr: error ? `${error.message}\n${stderr}`.trim() : String(stderr).trim(),
        exitCode: code
      })
    })
  })
}

function runCommand(command: string, args: string[], cwd: string, timeout: number) {
  return new Promise<string>((resolve, reject) => {
    execFile(command, args, { cwd, timeout }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}\n${stderr}`.trim()))
        return
      }
      resolve(String(stdout).trim())
    })
  })
}

function hermesBackupSources() {
  const hermesHome = path.join(os.homedir(), '.hermes')
  return [
    path.join(hermesHome, 'config.yaml'),
    path.join(hermesHome, '.env'),
    path.join(hermesHome, 'auth.json')
  ]
}

function copyIfExists(filePath: string, backupDir: string) {
  if (!fs.existsSync(filePath)) return ''
  const target = path.join(backupDir, path.basename(filePath))
  fs.copyFileSync(filePath, target)
  return target
}

function previewOutput(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 3000 ? `${trimmed.slice(0, 3000)}\n...` : trimmed
}

async function settle(promise: Promise<string>): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await promise }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function valueOr(result: Awaited<ReturnType<typeof settle>>, fallback: string) {
  return result.ok ? result.value : result.error || fallback
}

function firstLine(value: string) {
  return value.split('\n').map((line) => line.trim()).find(Boolean) ?? ''
}

function extractTag(value: string) {
  return value.match(/v\d{4}\.\d{1,2}\.\d{1,2}/)?.[0]
}

function extractVersionTag(value: string) {
  const match = value.match(/\((\d{4}\.\d{1,2}\.\d{1,2})\)/)
  return match?.[1] ? `v${match[1]}` : ''
}

function parseLatestRemoteTag(output: string) {
  const seen = new Set<string>()
  for (const line of output.split('\n')) {
    const [commit, ref] = line.trim().split(/\s+/)
    const tag = ref?.replace('refs/tags/', '').replace(/\^\{\}$/, '')
    if (!commit || !tag || seen.has(tag)) continue
    seen.add(tag)
    if (/^v\d{4}\.\d{1,2}\.\d{1,2}$/.test(tag)) return { tag, commit }
  }
  return undefined
}

function parseRemoteHeadCommit(output: string) {
  return output.trim().split(/\s+/)[0] || undefined
}

function parseBehindCount(statusText: string) {
  const match = statusText.match(/behind\s+(\d+)/i)
  return match?.[1] ? Number(match[1]) : undefined
}

function compareHermesTags(left: string, right: string) {
  const a = tagParts(left)
  const b = tagParts(right)
  if (!a || !b) return left.localeCompare(right)
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}

function tagParts(tag: string) {
  const match = tag.match(/v?(\d{4})\.(\d{1,2})\.(\d{1,2})/)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}
