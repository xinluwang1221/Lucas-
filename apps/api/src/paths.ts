import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentFile = fileURLToPath(import.meta.url)
const apiSrcDir = path.dirname(currentFile)

export const rootDir = path.resolve(apiSrcDir, '../../..')
export const dataDir = process.env.HERMES_COWORK_DATA_DIR || path.join(rootDir, 'data')
export const statePath = path.join(dataDir, 'state.json')
export const uploadedSkillsDir = path.join(dataDir, 'uploaded-skills')
export const defaultWorkspacePath = process.env.HERMES_COWORK_WORKSPACE_DIR || path.join(rootDir, 'workspaces', 'default')
export const hermesBin = process.env.HERMES_BIN || '/Users/lucas/.local/bin/hermes'
export const hermesAgentDir = process.env.HERMES_AGENT_DIR || '/Users/lucas/.hermes/hermes-agent'
export const hermesPythonBin = process.env.HERMES_PYTHON_BIN || path.join(hermesAgentDir, 'venv', 'bin', 'python')
