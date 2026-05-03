import type { Skill } from '../../lib/api'

export function sourceLabel(source: Skill['source']) {
  if (source === 'hermes') return 'Hermes'
  if (source === 'plugin') return '插件'
  if (source === 'system') return '系统'
  if (source === 'uploaded') return '上传'
  return '用户'
}

export function shortenSkillPath(value: string) {
  return value.replace(/^\/Users\/[^/]+/, '~')
}

export function formatSkillFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function formatSkillFileTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

export async function copyToClipboard(text: string) {
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
