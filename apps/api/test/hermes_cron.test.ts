import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

async function main() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-cowork-cron-'))
  const workspaceDir = path.join(testDir, 'workspace')
  fs.mkdirSync(workspaceDir, { recursive: true })
  const resolvedWorkspaceDir = fs.realpathSync(workspaceDir)
  process.env.HERMES_HOME = path.join(testDir, 'hermes-home')
  process.env.HERMES_COWORK_CRON_SOURCE = 'local'

  const {
    createHermesCronJob,
    pauseHermesCronJob,
    readHermesCronState,
    removeHermesCronJob,
    resumeHermesCronJob,
    triggerHermesCronJob,
    updateHermesCronJob
  } = await import('../src/hermes_cron.js')

  try {
    let state = await readHermesCronState()
    assert.equal(state.jobs.length, 0)
    assert.equal(state.source, 'local-config')

    state = await createHermesCronJob({
      name: 'Cowork cron test',
      prompt: '每天整理授权工作区里的文件变化，输出中文摘要。',
      schedule: 'every 2h',
      deliver: 'local',
      workdir: resolvedWorkspaceDir
    })

    assert.equal(state.jobs.length, 1)
    const job = state.jobs[0]
    assert.equal(job.name, 'Cowork cron test')
    assert.equal(job.schedule.kind, 'interval')
    assert.equal(job.workdir, resolvedWorkspaceDir)
    assert.equal(job.deliver, 'local')
    assert.ok(fs.existsSync(path.join(process.env.HERMES_HOME, 'cron', 'jobs.json')))

    state = await pauseHermesCronJob(job.id)
    assert.equal(state.jobs[0].enabled, false)
    assert.equal(state.jobs[0].state, 'paused')

    state = await resumeHermesCronJob(job.id)
    assert.equal(state.jobs[0].enabled, true)
    assert.equal(state.jobs[0].state, 'scheduled')

    state = await updateHermesCronJob(job.id, {
      name: 'Cowork cron edited',
      schedule: 'every 1h',
      prompt: '每小时检查一次工作区，只输出新增文件。'
    })
    assert.equal(state.jobs[0].name, 'Cowork cron edited')
    assert.equal(state.jobs[0].scheduleDisplay, 'every 60m')

    state = await triggerHermesCronJob(job.id)
    assert.ok(state.jobs[0].nextRunAt)

    state = await removeHermesCronJob(job.id)
    assert.equal(state.jobs.length, 0)

    console.log('Hermes cron adapter test passed')
  } finally {
    fs.rmSync(testDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
