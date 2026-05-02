import { useMemo, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

export type MarkdownFileReference = {
  id: string
  name: string
  relativePath?: string
  type?: string
}

const baseMarkdownComponents: Components = {
  table({ children }) {
    return (
      <div className="markdown-table-wrap">
        <table>{children}</table>
      </div>
    )
  },
  a({ node: _node, href, children, ...props }) {
    const safeHref = safeMarkdownUrl(href)
    if (!safeHref) return <span>{children}</span>
    const external = /^https?:\/\//i.test(safeHref)
    return (
      <a
        {...props}
        href={safeHref}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
      >
        {children}
      </a>
    )
  }
}

export function MarkdownContent({
  source,
  emptyText,
  fileReferences = [],
  onOpenFileReference
}: {
  source: string
  emptyText?: string
  fileReferences?: MarkdownFileReference[]
  onOpenFileReference?: (reference: MarkdownFileReference) => void
}) {
  const markdownComponents = useMemo<Components>(() => ({
    ...baseMarkdownComponents,
    code({ node: _node, className, children, ...props }) {
      const text = childrenToText(children).trim()
      const reference = findFileReference(text, fileReferences)
      if (!className && text && !text.includes('\n') && (reference || isLikelyFileName(text))) {
        if (reference && onOpenFileReference) {
          return (
            <button
              type="button"
              className="markdown-file-reference"
              title={`打开文件：${reference.relativePath ?? reference.name}`}
              onClick={() => onOpenFileReference(reference)}
            >
              {text}
            </button>
          )
        }
        return <span className="markdown-file-reference passive">{text}</span>
      }

      return <code className={className} {...props}>{children}</code>
    }
  }), [fileReferences, onOpenFileReference])

  if (!source.trim()) {
    return emptyText ? <p className="muted-copy">{emptyText}</p> : null
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
      urlTransform={safeMarkdownUrl}
    >
      {source}
    </ReactMarkdown>
  )
}

function safeMarkdownUrl(value?: string) {
  const url = String(value ?? '').trim()
  if (!url) return ''
  if (/^(https?:|mailto:)/i.test(url)) return url
  if (/^#[\w-]+$/.test(url)) return url
  if (/^\/(?!\/)/.test(url)) return url
  return ''
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

function isLikelyFileName(value: string) {
  return /\.(?:pptx?|ppsx|docx?|rtf|xlsx?|xlsm|csv|tsv|pdf|png|jpe?g|gif|webp|svg|md|txt|json|html?)$/i.test(value.trim())
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

function childrenToText(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(childrenToText).join('')
  return ''
}
