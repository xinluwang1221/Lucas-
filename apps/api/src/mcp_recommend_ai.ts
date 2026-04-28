import fs from 'node:fs'
import { refreshHermesMcpRecommendationsWithHermes } from './mcp.js'
import { statePath } from './paths.js'
import { AppState } from './types.js'

async function main() {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as AppState
  const result = await refreshHermesMcpRecommendationsWithHermes(state.tasks ?? [])
  console.log(JSON.stringify({
    ok: true,
    generatedAt: result.generatedAt,
    aiUsed: result.aiUsed,
    groups: result.categories.map((group) => ({ label: group.label, count: group.candidates.length }))
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
