import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { uploadedSkillsDir } from './paths.js'
import { SkillSetting } from './types.js'

export type SkillSource = 'user' | 'system' | 'plugin' | 'uploaded'

export type LocalSkill = {
  id: string
  name: string
  description: string
  path: string
  source: SkillSource
  enabled: boolean
  installed: true
  updatedAt: string
}

export type SkillFile = {
  name: string
  relativePath: string
  path: string
  type: 'file' | 'directory'
  size: number
  modifiedAt: string
  previewable: boolean
}

type SkillRoot = {
  dir: string
  source: SkillSource
  maxDepth: number
}

const skillRoots = (): SkillRoot[] => {
  const home = os.homedir()
  return [
    { dir: path.join(home, '.agents', 'skills'), source: 'user', maxDepth: 3 },
    { dir: path.join(home, '.codex', 'skills', '.system'), source: 'system', maxDepth: 3 },
    { dir: path.join(home, '.codex', 'plugins', 'cache'), source: 'plugin', maxDepth: 8 },
    { dir: uploadedSkillsDir, source: 'uploaded', maxDepth: 3 }
  ]
}

export function listLocalSkills(settings: Record<string, SkillSetting> = {}) {
  const seen = new Set<string>()
  const skills: LocalSkill[] = []

  for (const root of skillRoots()) {
    for (const skillPath of findSkillFiles(root.dir, root.maxDepth)) {
      const skill = readSkill(skillPath, root.source, settings)
      if (!skill || seen.has(skill.id)) continue
      seen.add(skill.id)
      skills.push(skill)
    }
  }

  return skills.sort((a, b) => {
    const sourceOrder = sourceRank(a.source) - sourceRank(b.source)
    if (sourceOrder !== 0) return sourceOrder
    return a.name.localeCompare(b.name)
  })
}

export function installUploadedSkill(tempPath: string, originalName: string) {
  const raw = fs.readFileSync(tempPath, 'utf8')
  const metadata = parseSkillMarkdown(raw)
  const name = normalizeSkillName(metadata.name || path.basename(originalName, path.extname(originalName)))
  const targetDir = path.join(uploadedSkillsDir, name)
  const targetPath = path.join(targetDir, 'SKILL.md')

  fs.mkdirSync(targetDir, { recursive: true })
  fs.writeFileSync(targetPath, raw)

  return {
    id: skillId('uploaded', name),
    name,
    path: targetPath
  }
}

export function findLocalSkill(skillId: string, settings: Record<string, SkillSetting> = {}) {
  return listLocalSkills(settings).find((skill) => skill.id === skillId)
}

export function listSkillFiles(skillId: string, settings: Record<string, SkillSetting> = {}) {
  const skill = findLocalSkill(skillId, settings)
  if (!skill) return null

  const root = path.dirname(skill.path)
  const files: SkillFile[] = []
  collectSkillFiles(root, root, files, 0)
  return files.sort((a, b) => {
    if (a.relativePath === 'SKILL.md') return -1
    if (b.relativePath === 'SKILL.md') return 1
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.relativePath.localeCompare(b.relativePath)
  })
}

export function readSkillFile(skillId: string, relativePath: string, settings: Record<string, SkillSetting> = {}) {
  const skill = findLocalSkill(skillId, settings)
  if (!skill) return null

  const root = path.dirname(skill.path)
  const targetPath = ensureInsideSkill(path.join(root, relativePath), root)
  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    throw new Error('file not found')
  }
  if (!isTextPreviewable(targetPath)) {
    throw new Error('preview is only available for text-like files')
  }
  return fs.readFileSync(targetPath, 'utf8')
}

function findSkillFiles(root: string, maxDepth: number) {
  const files: string[] = []
  if (!fs.existsSync(root)) return files

  const visit = (dir: string, depth: number) => {
    if (depth > maxDepth) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    if (entries.some((entry) => entry.isFile() && entry.name === 'SKILL.md')) {
      files.push(path.join(dir, 'SKILL.md'))
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.git')) continue
      visit(path.join(dir, entry.name), depth + 1)
    }
  }

  visit(root, 0)
  return files
}

function readSkill(
  skillPath: string,
  source: SkillSource,
  settings: Record<string, SkillSetting>
): LocalSkill | null {
  try {
    const raw = fs.readFileSync(skillPath, 'utf8')
    const metadata = parseSkillMarkdown(raw)
    const name = normalizeSkillName(metadata.name || path.basename(path.dirname(skillPath)))
    const id = skillId(source, name)
    const stat = fs.statSync(skillPath)

    return {
      id,
      name,
      description: metadata.description || firstParagraph(raw) || '暂无描述。',
      path: skillPath,
      source,
      enabled: settings[id]?.enabled ?? true,
      installed: true,
      updatedAt: stat.mtime.toISOString()
    }
  } catch {
    return null
  }
}

function collectSkillFiles(root: string, dir: string, files: SkillFile[], depth: number) {
  if (depth > 6) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.DS_Store') continue
    const fullPath = path.join(dir, entry.name)
    const stat = fs.statSync(fullPath)
    const relativePath = path.relative(root, fullPath)
    if (entry.isDirectory()) {
      files.push({
        name: entry.name,
        relativePath,
        path: fullPath,
        type: 'directory',
        size: 0,
        modifiedAt: stat.mtime.toISOString(),
        previewable: false
      })
      collectSkillFiles(root, fullPath, files, depth + 1)
      continue
    }
    if (!entry.isFile()) continue
    files.push({
      name: entry.name,
      relativePath,
      path: fullPath,
      type: 'file',
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      previewable: isTextPreviewable(fullPath)
    })
  }
}

function ensureInsideSkill(filePath: string, root: string) {
  const resolvedFile = path.resolve(filePath)
  const resolvedRoot = path.resolve(root)
  const relative = path.relative(resolvedRoot, resolvedFile)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path is outside the skill directory')
  }
  return resolvedFile
}

function isTextPreviewable(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  if (
    ['.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.xml', '.csv', '.tsv', '.py', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.sh'].includes(ext)
  ) {
    return true
  }
  return !ext && fs.statSync(filePath).size < 1024 * 1024
}

function parseSkillMarkdown(raw: string) {
  const metadata: Record<string, string> = {}
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return metadata

  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!item) continue
    metadata[item[1]] = item[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return metadata
}

function firstParagraph(raw: string) {
  return raw
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, '')
    .split(/\n{2,}/)
    .map((item) => item.replace(/^#+\s*/gm, '').trim())
    .find(Boolean)
    ?.slice(0, 220)
}

function normalizeSkillName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `skill-${Date.now()}`
}

function skillId(source: SkillSource, name: string) {
  return `${source}:${name}`
}

function sourceRank(source: SkillSource) {
  if (source === 'plugin') return 0
  if (source === 'system') return 1
  if (source === 'user') return 2
  return 3
}
