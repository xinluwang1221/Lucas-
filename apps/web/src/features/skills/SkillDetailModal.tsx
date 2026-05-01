import { BookOpen, Code2, Copy, FileText, Files, Folder, Play, XCircle } from 'lucide-react'
import type { Skill, SkillFile } from '../../lib/api'
import {
  copyToClipboard,
  formatSkillFileSize,
  formatSkillFileTime,
  sourceLabel
} from './skillFormatters'

export function SkillDetailModal({
  skill,
  files,
  selectedFile,
  content,
  error,
  onClose,
  onSelectFile,
  onToggle,
  onUseSkill
}: {
  skill: Skill
  files: SkillFile[]
  selectedFile: SkillFile | null
  content: string
  error: string | null
  onClose: () => void
  onSelectFile: (file: SkillFile) => void
  onToggle: () => void
  onUseSkill: () => void
}) {
  const fileCount = files.filter((file) => file.type === 'file').length
  const directoryCount = files.filter((file) => file.type === 'directory').length

  return (
    <div className="modal skill-detail-modal">
      <div className="skill-detail-head">
        <div className="skill-detail-title">
          <BookOpen size={28} />
          <div>
            <h2>{skill.name}</h2>
            <p>
              {sourceLabel(skill.source)} · {fileCount} 个文件 · {directoryCount} 个文件夹
            </p>
          </div>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="关闭技能详情">
          <XCircle size={18} />
        </button>
      </div>

      <p className="skill-detail-description">{skill.description}</p>

      <div className="skill-browser">
        <aside className="skill-file-tree">
          <div className="skill-browser-label">
            <Files size={14} />
            文件
          </div>
          {!files.length && <p className="muted-copy">正在读取文件列表...</p>}
          {files.map((file) => (
            <button
              className={selectedFile?.relativePath === file.relativePath ? 'active' : ''}
              key={file.relativePath}
              onClick={() => onSelectFile(file)}
              title={file.path}
            >
              {file.type === 'directory' ? <Folder size={14} /> : <FileText size={14} />}
              <span>{file.relativePath}</span>
            </button>
          ))}
        </aside>

        <section className="skill-file-preview">
          <div className="skill-file-preview-head">
            <div>
              <strong>{selectedFile?.relativePath ?? '选择文件'}</strong>
              {selectedFile && (
                <span>
                  {selectedFile.type === 'file' ? formatSkillFileSize(selectedFile.size) : '文件夹'} · {formatSkillFileTime(selectedFile.modifiedAt)}
                </span>
              )}
            </div>
            {selectedFile?.previewable && (
              <button className="ghost-button" onClick={() => void copyToClipboard(content)}>
                <Copy size={14} />
                复制
              </button>
            )}
          </div>
          {error ? (
            <div className="skill-file-error">{error}</div>
          ) : selectedFile?.type === 'directory' ? (
            <div className="skill-file-empty">
              <Folder size={22} />
              <span>这是一个文件夹，请选择其中的文件。</span>
            </div>
          ) : selectedFile ? (
            <pre className="skill-file-content">{content || '正在读取...'}</pre>
          ) : (
            <div className="skill-file-empty">
              <Code2 size={22} />
              <span>选择左侧文件查看内容。</span>
            </div>
          )}
        </section>
      </div>

      <div className="modal-actions skill-detail-actions">
        <button className="ghost-button" onClick={onToggle}>
          {skill.enabled ? '禁用' : '启用'}
        </button>
        <button className="ghost-button" onClick={onUseSkill}>
          <Play size={14} />
          使用技能
        </button>
        <button className="send-button" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}
