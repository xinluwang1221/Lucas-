import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { hermesAgentDir, hermesBin, hermesPythonBin } from './paths.js'
import { HermesUpdateStatus } from './types.js'

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

  if (params.workingTreeDirty) {
    return {
      status: 'blocked',
      title: '本机 Hermes 有未提交改动',
      detail: '升级可能覆盖本机改动。请先备份或清理 Hermes 工作树，再考虑更新。',
      notes: [
        'Cowork 会继续使用当前 Hermes。',
        '不要在工作树未清理时运行 hermes update。',
        '如确实需要升级，先记录当前 commit 和配置文件。'
      ]
    }
  }

  if (latestBeyondVerified) {
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

  return {
    status: 'verified',
    title: '当前版本在 Cowork 验证范围内',
    detail: '本机 Hermes 没有检测到需要立刻升级的版本差异，可以继续使用。',
    notes: [
      '保持 Cowork 和 Hermes 都在本机运行。',
      '大版本更新前仍建议先备份 Hermes 配置。',
      '更新后用一个小任务验证模型、MCP 和产物区。'
    ]
  }
}

function runHermes(args: string[], timeout = 15000) {
  return runCommand(hermesBin, args, hermesAgentDir, timeout)
}

function runGit(args: string[], timeout = 15000) {
  return runCommand('git', args, hermesAgentDir, timeout)
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
