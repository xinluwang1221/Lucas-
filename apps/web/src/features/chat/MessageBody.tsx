import { FileArchive, FileText } from 'lucide-react'
import type { Artifact, Message } from '../../lib/api'
import { MarkdownContent, type MarkdownFileReference } from '../markdown/MarkdownContent'

export function MessageBody({
  role,
  content,
  live = false,
  attachments = [],
  artifactCards = [],
  fileReferences = [],
  onOpenAttachment,
  onOpenArtifact,
  onOpenFileReference
}: {
  role: Message['role']
  content: string
  live?: boolean
  attachments?: NonNullable<Message['attachments']>
  artifactCards?: Artifact[]
  fileReferences?: MarkdownFileReference[]
  onOpenAttachment?: (attachment: NonNullable<Message['attachments']>[number]) => void
  onOpenArtifact?: (artifact: Artifact) => void
  onOpenFileReference?: (reference: MarkdownFileReference) => void
}) {
  if (role === 'assistant') {
    const fileOverview = extractFileOverviewTables(content, fileReferences)
    return (
      <>
        <div className={live ? 'message-body message-markdown live-output' : 'message-body message-markdown'}>
          <MarkdownContent
            source={fileOverview.source}
            emptyText={live ? 'Hermes 正在组织答案...' : ''}
            fileReferences={fileReferences}
            onOpenFileReference={onOpenFileReference}
          />
        </div>
        <MessageReferencedFileList references={fileOverview.references} onOpenFileReference={onOpenFileReference} />
        <MessageArtifactList artifacts={artifactCards} onOpenArtifact={onOpenArtifact} />
        <MessageAttachmentList attachments={attachments} onOpenAttachment={onOpenAttachment} />
      </>
    )
  }
  return (
    <>
      <div className="message-body">{content}</div>
      <MessageAttachmentList attachments={attachments} onOpenAttachment={onOpenAttachment} />
    </>
  )
}

function MessageReferencedFileList({
  references,
  onOpenFileReference
}: {
  references: MarkdownFileReference[]
  onOpenFileReference?: (reference: MarkdownFileReference) => void
}) {
  if (!references.length) return null
  return (
    <div className="message-attachment-list message-reference-file-list" aria-label="Hermes 提到的文件">
      {references.map((reference) => {
        const canOpen = !reference.id.startsWith('table:') && Boolean(onOpenFileReference)
        const label = reference.relativePath ?? reference.type ?? '文件'
        if (!canOpen) {
          return (
            <span className="message-reference-file-card passive" key={reference.id}>
              <FileText size={14} />
              <span>{reference.name}</span>
              <em>{label}</em>
            </span>
          )
        }
        return (
          <button
            type="button"
            key={reference.id}
            title={`打开文件：${reference.relativePath ?? reference.name}`}
            onClick={() => onOpenFileReference?.(reference)}
          >
            <FileText size={14} />
            <span>{reference.name}</span>
            <em>{label}</em>
          </button>
        )
      })}
    </div>
  )
}

export function MessageAttachmentList({
  attachments,
  onOpenAttachment
}: {
  attachments?: NonNullable<Message['attachments']>
  onOpenAttachment?: (attachment: NonNullable<Message['attachments']>[number]) => void
}) {
  if (!attachments?.length) return null
  return (
    <div className="message-attachment-list" aria-label="消息附件">
      {attachments.map((attachment) => (
        <button
          type="button"
          key={attachment.id}
          title={`打开附件：${attachment.relativePath}`}
          onClick={() => onOpenAttachment?.(attachment)}
        >
          <FileText size={14} />
          <span>{attachment.name}</span>
          <em>{formatBytes(attachment.size)}</em>
        </button>
      ))}
    </div>
  )
}

export function MessageArtifactList({
  artifacts,
  onOpenArtifact
}: {
  artifacts?: Artifact[]
  onOpenArtifact?: (artifact: Artifact) => void
}) {
  if (!artifacts?.length) return null
  return (
    <div className="message-attachment-list message-output-file-list" aria-label="Hermes 输出文件">
      {artifacts.map((artifact) => (
        <button
          type="button"
          key={artifact.id}
          title={`打开输出文件：${artifact.relativePath}`}
          onClick={() => onOpenArtifact?.(artifact)}
        >
          <FileArchive size={14} />
          <span>{artifact.name}</span>
          <em>{formatBytes(artifact.size)}</em>
        </button>
      ))}
    </div>
  )
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function extractFileOverviewTables(source: string, fileReferences: MarkdownFileReference[]) {
  const lines = source.split(/\r?\n/)
  const keep = lines.map(() => true)
  const references: MarkdownFileReference[] = []
  let index = 0

  while (index < lines.length - 1) {
    if (!isMarkdownTableStart(lines[index], lines[index + 1])) {
      index += 1
      continue
    }

    const start = index
    let end = index + 2
    while (end < lines.length && lines[end].trim() && lines[end].includes('|')) {
      end += 1
    }

    const tableReferences = extractFileReferencesFromTable(lines.slice(start, end), fileReferences)
    if (tableReferences.length) {
      for (let lineIndex = start; lineIndex < end; lineIndex += 1) {
        keep[lineIndex] = false
      }
      tableReferences.forEach((reference) => pushUniqueReference(references, reference))
    }
    index = end
  }

  return {
    source: compactMarkdown(lines.filter((_, lineIndex) => keep[lineIndex]).join('\n')),
    references
  }
}

function isMarkdownTableStart(header: string, separator: string) {
  if (!header.includes('|')) return false
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(separator)
}

function extractFileReferencesFromTable(tableLines: string[], fileReferences: MarkdownFileReference[]) {
  const headerText = extractTableCells(tableLines[0]).join(' ')
  const rowCells = tableLines.slice(2).flatMap(extractTableCells)
  const fileCells = rowCells
    .map(cleanTableCell)
    .filter((cell) => isLikelyFileName(cell))

  if (!fileCells.length) return []
  const headerLooksLikeFileList = /文件名|文件|名称|name|filename|file/i.test(headerText)
  if (!headerLooksLikeFileList && fileCells.length < 2) return []

  const references: MarkdownFileReference[] = []
  fileCells.forEach((cell) => {
    const matched = findFileReference(cell, fileReferences)
    pushUniqueReference(references, matched ?? {
      id: `table:${cell}`,
      name: cell,
      type: fileTypeLabel(cell)
    })
  })
  return references
}

function extractTableCells(row: string) {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

function cleanTableCell(cell: string) {
  return cell
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\[[^\]]+\]\(([^)]+)\)/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .trim()
}

function isLikelyFileName(value: string) {
  return /\.(?:pptx?|ppsx|docx?|rtf|xlsx?|xlsm|csv|tsv|pdf|png|jpe?g|gif|webp|svg|md|txt|json|html?)$/i.test(value.trim())
}

function findFileReference(value: string, references: MarkdownFileReference[]) {
  const normalizedValue = normalizeFileReference(value)
  if (!normalizedValue) return undefined
  return references.find((reference) => {
    const name = normalizeFileReference(reference.name)
    const relativePath = normalizeFileReference(reference.relativePath ?? '')
    return normalizedValue === name || normalizedValue === relativePath || normalizedValue === basename(relativePath)
  })
}

function pushUniqueReference(references: MarkdownFileReference[], reference: MarkdownFileReference) {
  const key = normalizeFileReference(reference.relativePath ?? reference.name)
  if (references.some((item) => normalizeFileReference(item.relativePath ?? item.name) === key)) return
  references.push(reference)
}

function normalizeFileReference(value: string) {
  return value
    .trim()
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .replace(/^\.\//, '')
    .toLowerCase()
}

function basename(value: string) {
  return value.split(/[\\/]/).filter(Boolean).pop() ?? value
}

function fileTypeLabel(value: string) {
  const extension = value.split('.').pop()?.toLowerCase()
  if (!extension) return '文件'
  if (['ppt', 'pptx', 'ppsx'].includes(extension)) return '演示文稿'
  if (['doc', 'docx', 'rtf'].includes(extension)) return '文档'
  if (['xls', 'xlsx', 'xlsm', 'csv', 'tsv'].includes(extension)) return '表格'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) return '图片'
  if (extension === 'pdf') return 'PDF'
  if (['md', 'txt', 'json', 'html'].includes(extension)) return '文本'
  return extension.toUpperCase()
}

function compactMarkdown(value: string) {
  return value
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
}
