import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { Response } from 'express'

export function readPreviewBody(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  if (isTextPreviewable(filePath)) {
    return fs.readFileSync(filePath, 'utf8')
  }

  if (ext === '.docx') {
    return readDocxPreview(filePath)
  }

  if (['.rtf', '.doc'].includes(ext)) {
    return readTextutilPreview(filePath)
  }

  if (['.pptx', '.ppsx'].includes(ext)) {
    return readPptxPreview(filePath)
  }

  if (['.xlsx', '.xlsm'].includes(ext)) {
    return readXlsxPreview(filePath)
  }

  throw new Error('这个文件暂不支持正文预览。你仍然可以把它交给 Hermes 作为上下文，或在 Finder 中打开。')
}

export function sendInlineFile(res: Response, filePath: string, fileName: string) {
  res.setHeader('Content-Type', mimeTypeForPath(filePath))
  const asciiName = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')
  res.setHeader('Content-Disposition', `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.sendFile(filePath)
}

function isTextPreviewable(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  if (['.txt', '.md', '.json', '.csv', '.html', '.htm', '.log', '.xml', '.yaml', '.yml'].includes(ext)) {
    return true
  }
  return !ext && fs.statSync(filePath).size < 1024 * 1024
}

function readDocxPreview(filePath: string) {
  try {
    const text = extractXmlText(readZipEntry(filePath, 'word/document.xml'))
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    if (!text) throw new Error('empty docx preview')
    return text
  } catch {
    throw new Error('无法读取这个 Word 文档的正文预览。你仍然可以把它交给 Hermes 作为上下文，或在 Finder 中打开。')
  }
}

function readTextutilPreview(filePath: string) {
  try {
    const text = execFileSync('textutil', ['-convert', 'txt', '-stdout', filePath], {
      encoding: 'utf8',
      maxBuffer: 12 * 1024 * 1024
    })
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (!text) throw new Error('empty textutil preview')
    return text
  } catch {
    throw new Error('无法读取这个文档的正文预览。你仍然可以把它交给 Hermes 作为上下文，或在 Finder 中打开。')
  }
}

function readPptxPreview(filePath: string) {
  try {
    const slideEntries = listZipEntries(filePath)
      .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry))
      .sort((a, b) => Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0) - Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0))
      .slice(0, 80)

    const slides = slideEntries.map((entry, index) => {
      const text = extractXmlText(readZipEntry(filePath, entry))
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n\n')
      return text ? `## 幻灯片 ${index + 1}\n\n${text}` : ''
    }).filter(Boolean)

    if (!slides.length) throw new Error('empty pptx preview')
    return `# 演示文稿预览\n\n${slides.join('\n\n')}`
  } catch {
    throw new Error('无法读取这个演示文稿的内容预览。你仍然可以把它交给 Hermes 作为上下文，或在 Finder 中打开。')
  }
}

function readXlsxPreview(filePath: string) {
  try {
    const sharedStrings = readXlsxSharedStrings(filePath)
    const sheetEntries = listZipEntries(filePath)
      .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry))
      .sort((a, b) => Number(a.match(/sheet(\d+)\.xml$/)?.[1] ?? 0) - Number(b.match(/sheet(\d+)\.xml$/)?.[1] ?? 0))
      .slice(0, 5)

    const sheets = sheetEntries.map((entry, index) => {
      const rows = parseXlsxRows(readZipEntry(filePath, entry), sharedStrings)
      if (!rows.length) return ''
      const clippedRows = rows.slice(0, 120).map((row) => row.slice(0, 36).join('\t'))
      return `## 工作表 ${index + 1}\n\n${clippedRows.join('\n')}`
    }).filter(Boolean)

    if (!sheets.length) throw new Error('empty xlsx preview')
    return sheets.join('\n\n')
  } catch {
    throw new Error('无法读取这个表格的内容预览。你仍然可以把它交给 Hermes 作为上下文，或在 Finder 中打开。')
  }
}

function listZipEntries(filePath: string) {
  return execFileSync('unzip', ['-Z1', filePath], {
    encoding: 'utf8',
    maxBuffer: 12 * 1024 * 1024
  })
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function readZipEntry(filePath: string, entry: string) {
  return execFileSync('unzip', ['-p', filePath, entry], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  })
}

function readXlsxSharedStrings(filePath: string) {
  try {
    const xml = readZipEntry(filePath, 'xl/sharedStrings.xml')
    return Array.from(xml.matchAll(/<si\b[\s\S]*?<\/si>/g)).map((match) => extractXmlText(match[0]).replace(/\n+/g, ' ').trim())
  } catch {
    return []
  }
}

function parseXlsxRows(xml: string, sharedStrings: string[]) {
  const rows: string[][] = []
  for (const rowMatch of xml.matchAll(/<row\b[\s\S]*?<\/row>/g)) {
    const row: string[] = []
    for (const cellMatch of rowMatch[0].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1]
      const inner = cellMatch[2]
      const column = attrs.match(/\br="([A-Z]+)\d+"/)?.[1]
      const columnIndex = column ? columnNameToIndex(column) : row.length
      row[columnIndex] = parseXlsxCell(attrs, inner, sharedStrings)
    }
    if (row.some((cell) => cell?.trim())) rows.push(row.map((cell) => cell ?? ''))
  }
  return rows
}

function parseXlsxCell(attrs: string, inner: string, sharedStrings: string[]) {
  const type = attrs.match(/\bt="([^"]+)"/)?.[1]
  if (type === 'inlineStr') {
    return extractXmlText(inner).replace(/\n+/g, ' ').trim()
  }
  const rawValue = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? ''
  const value = decodeXmlEntities(rawValue).trim()
  if (type === 's') {
    return sharedStrings[Number(value)] ?? value
  }
  return value
}

function columnNameToIndex(column: string) {
  return column.split('').reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1
}

function extractXmlText(xml: string) {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\s*\/>/g, '\t')
      .replace(/<a:br\s*\/>/g, '\n')
      .replace(/<w:br\s*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n\n')
      .replace(/<\/a:p>/g, '\n\n')
      .replace(/<\/t>/g, '\n')
      .replace(/<[^>]+>/g, '')
  )
}

function mimeTypeForPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  const types: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  }
  return types[ext] ?? 'application/octet-stream'
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
}
