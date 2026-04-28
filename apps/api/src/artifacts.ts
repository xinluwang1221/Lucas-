import fs from 'node:fs'
import path from 'node:path'
import { Artifact } from './types.js'

const artifactExtensions = new Set([
  '.docx',
  '.pdf',
  '.pptx',
  '.xlsx',
  '.xls',
  '.xlsm',
  '.csv',
  '.tsv',
  '.md',
  '.markdown',
  '.html',
  '.htm',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.json',
  '.jsonl',
  '.txt',
  '.log',
  '.xml',
  '.yaml',
  '.yml',
  '.zip'
])

const ignoreDirs = new Set(['node_modules', '.git', '.venv', '__pycache__', '.DS_Store'])
const maxArtifactSize = 200 * 1024 * 1024

export type FileSnapshot = Map<string, number>

export function takeSnapshot(rootPath: string): FileSnapshot {
  const snapshot = new Map<string, number>()
  walk(rootPath, (filePath, stat) => {
    snapshot.set(filePath, stat.mtimeMs)
  })
  return snapshot
}

export function findChangedArtifacts(
  workspaceId: string,
  taskId: string,
  rootPath: string,
  before: FileSnapshot
): Artifact[] {
  const createdAt = new Date().toISOString()
  const artifacts: Artifact[] = []

  walk(rootPath, (filePath, stat) => {
    const ext = path.extname(filePath).toLowerCase()
    if (!artifactExtensions.has(ext)) return
    if (stat.size > maxArtifactSize) return

    const previousMtime = before.get(filePath)
    if (previousMtime !== undefined && previousMtime >= stat.mtimeMs) return

    artifacts.push({
      id: crypto.randomUUID(),
      taskId,
      workspaceId,
      name: path.basename(filePath),
      path: filePath,
      relativePath: path.relative(rootPath, filePath),
      type: ext.replace('.', '') || 'file',
      size: stat.size,
      createdAt
    })
  })

  return artifacts
}

function walk(rootPath: string, onFile: (filePath: string, stat: fs.Stats) => void) {
  if (!fs.existsSync(rootPath)) return
  const entries = fs.readdirSync(rootPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name)
    if (entry.isDirectory()) {
      if (!ignoreDirs.has(entry.name)) walk(fullPath, onFile)
      continue
    }

    if (entry.isFile()) {
      onFile(fullPath, fs.statSync(fullPath))
    }
  }
}
