import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const markdownComponents: Components = {
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

export function MarkdownContent({ source, emptyText }: { source: string; emptyText?: string }) {
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
