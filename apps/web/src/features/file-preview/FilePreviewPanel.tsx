import {
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  Plus,
  X
} from 'lucide-react'
import { artifactDownloadUrl } from './artifactApi'
import { MarkdownContent } from '../markdown/MarkdownContent'

export type Preview = {
  title: string
  body: string
  kind: 'markdown' | 'csv' | 'document' | 'spreadsheet' | 'presentation' | 'quicklook' | 'pdf' | 'image' | 'media' | 'html' | 'text'
  rawUrl?: string
}

export type FilePreviewTarget = {
  source: 'workspace' | 'artifact'
  title: string
  name: string
  relativePath: string
  path?: string
  type: string
  size: number
  timestamp: string
  workspaceId?: string
  artifactId?: string
}

export type FilePreviewState = Preview & {
  target: FilePreviewTarget
  status: 'loading' | 'ready' | 'unsupported' | 'error'
  error?: string
}

export function FilePreviewPanel({
  preview,
  compact = false,
  pinned = false,
  fullscreen = false,
  onClose,
  onOpenNative,
  onUseContext,
  onReveal,
  onTogglePin,
  onToggleFullscreen
}: {
  preview: FilePreviewState
  compact?: boolean
  pinned?: boolean
  fullscreen?: boolean
  onClose: () => void
  onOpenNative: (target: FilePreviewTarget) => void
  onUseContext: (target: FilePreviewTarget) => void
  onReveal: (target: FilePreviewTarget) => void
  onTogglePin: () => void
  onToggleFullscreen: () => void
}) {
  const target = preview.target
  return (
    <section className={[
      'file-preview-panel',
      compact ? 'compact' : '',
      fullscreen ? 'fullscreen' : '',
      pinned ? 'pinned' : ''
    ].filter(Boolean).join(' ')}>
      <header className="file-preview-topbar">
        <div className="file-preview-title">
          <FileText size={18} />
          <div>
            <strong>{target.name}</strong>
            <span>{target.relativePath}</span>
          </div>
        </div>
        <div className="file-preview-toolbar" aria-label="文件预览操作">
          <button type="button" className="icon-button" title="在本机应用中打开" onClick={() => onOpenNative(target)}>
            <ExternalLink size={16} />
          </button>
          <button type="button" className="icon-button" title="在 Finder 中显示" onClick={() => onReveal(target)}>
            <FolderOpen size={16} />
          </button>
          {!compact && (
            <>
              <button
                type="button"
                className={pinned ? 'icon-button active' : 'icon-button'}
                title={pinned ? '取消固定预览' : '固定预览'}
                aria-pressed={pinned}
                onClick={onTogglePin}
              >
                {pinned ? <PinOff size={16} /> : <Pin size={16} />}
              </button>
              <button
                type="button"
                className={fullscreen ? 'icon-button active' : 'icon-button'}
                title={fullscreen ? '退出全屏预览' : '全屏预览'}
                aria-pressed={fullscreen}
                onClick={onToggleFullscreen}
              >
                {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </>
          )}
          <button type="button" className="icon-button" title="关闭预览" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="file-preview-actions">
        <button type="button" className="ghost-button" onClick={() => onUseContext(target)}>
          <Plus size={14} />
          作为上下文
        </button>
        {target.source === 'artifact' && target.artifactId && (
          <a className="ghost-button" href={artifactDownloadUrl(target.artifactId)}>
            <Download size={14} />
            下载
          </a>
        )}
        <button type="button" className="ghost-button" onClick={() => void copyToClipboard(target.relativePath || target.name)}>
          <Copy size={14} />
          复制路径
        </button>
      </div>

      <div className="file-preview-meta">
        <span>{target.source === 'artifact' ? '任务产物' : '工作区文件'}</span>
        <span>{target.type || 'file'}</span>
        <span>{formatBytes(target.size)}</span>
        <span>{formatTime(target.timestamp)}</span>
      </div>

      <div className="file-preview-surface">
        {preview.status === 'loading' ? (
          <div className="file-preview-state">
            <Loader2 size={18} className="spin" />
            <strong>正在读取预览</strong>
            <span>文件仍在本机，Hermes Cowork 只读取授权范围内的内容。</span>
          </div>
        ) : preview.status === 'ready' ? (
          <PreviewBody preview={preview} />
        ) : (
          <div className={`file-preview-state ${preview.status}`}>
            <Info size={18} />
            <strong>{preview.status === 'unsupported' ? '暂不支持直接预览' : '预览失败'}</strong>
            <span>{preview.error ?? '可以交给 Hermes 作为上下文，或在 Finder 中打开。'}</span>
          </div>
        )}
      </div>
    </section>
  )
}

export function previewKind(title: string): Preview['kind'] {
  const lower = title.toLowerCase()
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown'
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return 'csv'
  if (/\.(docx?|rtf|pptx?|ppsx|xlsx?|xlsm)$/i.test(lower)) return 'quicklook'
  if (lower.endsWith('.pdf')) return 'pdf'
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(lower)) return 'image'
  if (/\.(mp4|webm|mov|mp3|wav|m4a)$/i.test(lower)) return 'media'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  return 'text'
}

export function isInlinePreviewKind(kind: Preview['kind']) {
  return ['quicklook', 'pdf', 'image', 'media', 'html'].includes(kind)
}

function PreviewBody({ preview }: { preview: Preview }) {
  if (preview.kind === 'pdf' && preview.rawUrl) {
    return <iframe className="embedded-preview pdf-embedded-preview" title={preview.title} src={preview.rawUrl} />
  }

  if (preview.kind === 'html' && preview.rawUrl) {
    return <iframe className="embedded-preview html-embedded-preview" title={preview.title} src={preview.rawUrl} sandbox="allow-same-origin allow-scripts allow-forms" />
  }

  if (preview.kind === 'quicklook' && preview.rawUrl) {
    return <iframe className="embedded-preview quicklook-embedded-preview" title={preview.title} src={preview.rawUrl} sandbox="allow-same-origin allow-scripts" />
  }

  if (preview.kind === 'image' && preview.rawUrl) {
    return (
      <div className="image-preview-frame">
        <img src={preview.rawUrl} alt={preview.title} />
      </div>
    )
  }

  if (preview.kind === 'media' && preview.rawUrl) {
    return mediaPreviewIsAudio(preview.title)
      ? <audio className="media-preview-player" controls src={preview.rawUrl} />
      : <video className="media-preview-player" controls src={preview.rawUrl} />
  }

  if (preview.kind === 'markdown') {
    return <div className="markdown-preview"><MarkdownContent source={preview.body} emptyText="这个 Markdown 文件没有可展示内容。" /></div>
  }

  if (preview.kind === 'csv') {
    return <CsvPreview title={preview.title} body={preview.body} />
  }

  if (preview.kind === 'spreadsheet') {
    return <SpreadsheetPreview body={preview.body} />
  }

  if (preview.kind === 'presentation') {
    return <div className="markdown-preview presentation-preview"><MarkdownContent source={preview.body} emptyText="这个演示文稿没有可展示内容。" /></div>
  }

  if (preview.kind === 'document') {
    return <DocumentPreview preview={preview} />
  }

  return <pre className="text-preview">{preview.body}</pre>
}

function mediaPreviewIsAudio(title: string) {
  return /\.(mp3|wav|m4a)$/i.test(title)
}

function DocumentPreview({ preview }: { preview: Preview }) {
  const paragraphs = preview.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  if (!paragraphs.length) {
    return <p className="muted-copy">这个文档没有可展示的正文。</p>
  }

  const [title, ...body] = paragraphs

  return (
    <article className="document-preview">
      <h1>{title}</h1>
      {body.slice(0, 180).map((paragraph, index) => {
        const isHeading = /^[一二三四五六七八九十]+[、.．]\s*\S/.test(paragraph) || /^\d+(?:\.\d+)*\s+\S/.test(paragraph)
        if (isHeading) return <h2 key={`${paragraph}-${index}`}>{paragraph}</h2>
        return <p key={`${paragraph}-${index}`}>{paragraph}</p>
      })}
    </article>
  )
}

function CsvPreview({ title, body }: { title: string; body: string }) {
  const delimiter = title.toLowerCase().endsWith('.tsv') ? '\t' : ','
  const rows = parseDelimitedRows(body, delimiter)
  if (!rows.length) return <p className="muted-copy">这个文件没有可展示的数据。</p>

  const [header, ...dataRows] = rows
  const visibleRows = dataRows.slice(0, 200)
  const columnCount = Math.max(...rows.map((row) => row.length))

  return (
    <div className="csv-preview">
      <div className="preview-meta">
        <span>{rows.length - 1} 行数据</span>
        <span>{columnCount} 列</span>
        {dataRows.length > visibleRows.length && <span>仅展示前 {visibleRows.length} 行</span>}
      </div>
      <div className="csv-table-wrap">
        <table>
          <thead>
            <tr>
              {Array.from({ length: columnCount }).map((_, index) => (
                <th key={`head-${index}`}>{header[index] || `列 ${index + 1}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {Array.from({ length: columnCount }).map((_, index) => (
                  <td key={`${rowIndex}-${index}`}>{row[index] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SpreadsheetPreview({ body }: { body: string }) {
  const sections = body.split(/\n(?=## 工作表 )/).map((section) => section.trim()).filter(Boolean)
  return (
    <div className="spreadsheet-preview">
      {sections.map((section, sectionIndex) => {
        const [heading = `工作表 ${sectionIndex + 1}`, ...tableLines] = section.split(/\r?\n/)
        const rows = tableLines.filter(Boolean).map((line) => line.split('\t'))
        const columnCount = Math.max(1, ...rows.map((row) => row.length))
        return (
          <section className="sheet-preview-section" key={`${heading}-${sectionIndex}`}>
            <h3>{heading.replace(/^##\s*/, '')}</h3>
            {rows.length ? (
              <div className="csv-table-wrap">
                <table>
                  <tbody>
                    {rows.slice(0, 120).map((row, rowIndex) => (
                      <tr key={`${sectionIndex}-${rowIndex}`}>
                        {Array.from({ length: columnCount }).map((_, columnIndex) => (
                          <td key={`${rowIndex}-${columnIndex}`}>{row[columnIndex] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted-copy">这个工作表没有可展示的数据。</p>
            )}
          </section>
        )
      })}
    </div>
  )
}

function parseDelimitedRows(input: string, delimiter: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]
    if (char === '"' && inQuotes && next === '"') {
      cell += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === delimiter && !inQuotes) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(cell)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}
