import assert from 'node:assert/strict'
import { readHermesDiagnostics } from '../src/hermes_diagnostics.js'
import type { HermesDashboardProxyResult } from '../src/hermes_dashboard.js'

async function main() {
  const diagnostics = await readHermesDiagnostics({
    days: 7,
    requestDashboard: async (apiPath) => fakeDashboard(apiPath)
  })

  assert.equal(diagnostics.status, 'warn')
  assert.equal(diagnostics.source.dashboard, 'available')
  assert.equal(diagnostics.source.usage, 'available')
  assert.equal(diagnostics.usage.periodDays, 7)
  assert.equal(diagnostics.usage.totalSessions, 3)
  assert.equal(diagnostics.usage.totalApiCalls, 8)
  assert.equal(diagnostics.usage.totalTokens, 1750)
  assert.equal(diagnostics.usage.topModels[0].model, 'mimo-v2.5-pro')
  assert.equal(diagnostics.logHealth.files.find((file) => file.id === 'agent')?.status, 'warn')
  assert.equal(diagnostics.logHealth.recentIssues.length, 2)
  assert.match(diagnostics.logHealth.recentIssues.map((issue) => issue.message).join('\n'), /模型凭据失败/)
  assert.doesNotMatch(diagnostics.logHealth.recentIssues.map((issue) => issue.message).join('\n'), /Invalid API Key/)
  assert.match(diagnostics.nextActions.join('\n'), /模型凭据/)

  const unavailable = await readHermesDiagnostics({
    requestDashboard: async () => {
      throw new Error('dashboard offline')
    }
  })
  assert.equal(unavailable.status, 'unavailable')
  assert.equal(unavailable.source.dashboard, 'unavailable')
  assert.match(unavailable.nextActions[0], /启动 Hermes 官方后台/)

  console.log('Hermes diagnostics test passed')
}

async function fakeDashboard(apiPath: string): Promise<HermesDashboardProxyResult> {
  if (apiPath === '/api/analytics/usage?days=7') {
    return {
      status: 200,
      ok: true,
      body: {
        period_days: 7,
        totals: {
          total_input: 1200,
          total_output: 400,
          total_reasoning: 150,
          total_cache_read: 80,
          total_estimated_cost: 0.42,
          total_actual_cost: 0.39,
          total_sessions: 3,
          total_api_calls: 8
        },
        by_model: [
          {
            model: 'mimo-v2.5-pro',
            input_tokens: 1000,
            output_tokens: 300,
            estimated_cost: 0.31,
            sessions: 2,
            api_calls: 6
          }
        ]
      }
    }
  }
  if (apiPath.includes('file=errors')) {
    return {
      status: 200,
      ok: true,
      body: { file: 'errors', lines: ['2026-05-04 09:00:00 ERROR models: Invalid API Key'] }
    }
  }
  if (apiPath.includes('file=agent')) {
    return {
      status: 200,
      ok: true,
      body: { file: 'agent', lines: ['2026-05-04 09:01:00 ERROR tools: command approval timeout'] }
    }
  }
  if (apiPath.includes('file=gateway')) {
    return {
      status: 200,
      ok: true,
      body: { file: 'gateway', lines: [] }
    }
  }
  return { status: 404, ok: false, body: { error: 'not found' } }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
