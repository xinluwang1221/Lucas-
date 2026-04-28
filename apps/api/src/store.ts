import fs from 'node:fs'
import path from 'node:path'
import { AppState } from './types.js'
import { dataDir, defaultWorkspacePath, statePath } from './paths.js'

const now = () => new Date().toISOString()

const initialState = (): AppState => ({
  workspaces: [
    {
      id: 'default',
      name: 'Default Workspace',
      path: defaultWorkspacePath,
      createdAt: now()
    }
  ],
  tasks: [],
  messages: [],
  artifacts: [],
  skillSettings: {},
  modelSettings: {
    selectedModelId: 'auto',
    customModels: []
  }
})

export class Store {
  private state: AppState

  constructor() {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.mkdirSync(defaultWorkspacePath, { recursive: true })
    this.state = this.load()
  }

  get snapshot(): AppState {
    return structuredClone(this.state)
  }

  update(mutator: (state: AppState) => void) {
    mutator(this.state)
    this.save()
  }

  private load(): AppState {
    if (!fs.existsSync(statePath)) {
      const state = initialState()
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
      return state
    }

    const raw = fs.readFileSync(statePath, 'utf8')
    const parsed = JSON.parse(raw) as AppState
    if (!parsed.workspaces.some((workspace) => workspace.id === 'default')) {
      parsed.workspaces.unshift(initialState().workspaces[0])
    }
    parsed.skillSettings = parsed.skillSettings ?? {}
    parsed.modelSettings = parsed.modelSettings ?? initialState().modelSettings
    parsed.modelSettings.selectedModelId = parsed.modelSettings.selectedModelId || 'auto'
    parsed.modelSettings.customModels = parsed.modelSettings.customModels ?? []
    return parsed
  }

  private save() {
    fs.writeFileSync(statePath, JSON.stringify(this.state, null, 2))
  }
}

export const store = new Store()

export function ensureInsideWorkspace(filePath: string, workspacePath: string) {
  const resolvedFile = path.resolve(filePath)
  const resolvedWorkspace = path.resolve(workspacePath)
  const relative = path.relative(resolvedWorkspace, resolvedFile)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path is outside the authorized workspace')
  }
  return resolvedFile
}
