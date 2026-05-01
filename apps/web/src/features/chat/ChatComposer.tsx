import {
  ArrowUp,
  BookOpen,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  Folder,
  Loader2,
  Paperclip,
  Pause,
  Settings,
  Shield,
  XCircle,
  Zap
} from 'lucide-react'
import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject
} from 'react'
import { useRef } from 'react'
import type {
  HermesModelOverview,
  HermesReasoningConfigureRequest,
  HermesReasoningEffort,
  MessageAttachment,
  ModelOption,
  Task
} from '../../lib/api'

type ModelMenuGroup = {
  label: string
  models: ModelOption[]
}

export function ChatComposer({
  prompt,
  promptInputRef,
  composerSkillNames,
  composerAttachments,
  attachmentUploading,
  selectedWorkspaceName,
  selectedModel,
  selectedModelId,
  modelMenuOpen,
  modelPickerRef,
  modelMenuGroups,
  hermesModel,
  hermesModelUpdating,
  runningTask,
  stoppingTaskId,
  isSubmitting,
  modelNotice,
  onSubmit,
  onPromptChange,
  onPromptKeyDown,
  onRemoveSkill,
  onAttachFiles,
  onRemoveAttachment,
  onPreviewAttachment,
  onOpenWorkspace,
  onModelMenuOpenChange,
  onConfigureReasoning,
  onSelectModel,
  onOpenModelConfig,
  onStopTask,
  resolveModelSelectionKey
}: {
  prompt: string
  promptInputRef: RefObject<HTMLTextAreaElement | null>
  composerSkillNames: string[]
  composerAttachments: MessageAttachment[]
  attachmentUploading: boolean
  selectedWorkspaceName?: string
  selectedModel: ModelOption
  selectedModelId: string
  modelMenuOpen: boolean
  modelPickerRef: RefObject<HTMLDivElement | null>
  modelMenuGroups: ModelMenuGroup[]
  hermesModel: HermesModelOverview | null
  hermesModelUpdating: string | null
  runningTask?: Task | null
  stoppingTaskId: string | null
  isSubmitting: boolean
  modelNotice: string | null
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onPromptChange: (value: string) => void
  onPromptKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  onRemoveSkill: (name: string) => void
  onAttachFiles: (files: File[]) => void
  onRemoveAttachment: (attachmentId: string) => void
  onPreviewAttachment: (attachment: MessageAttachment) => void
  onOpenWorkspace: () => void
  onModelMenuOpenChange: (open: boolean | ((current: boolean) => boolean)) => void
  onConfigureReasoning: (request: HermesReasoningConfigureRequest, notice: string) => void
  onSelectModel: (model: ModelOption) => void
  onOpenModelConfig: (providerId?: string, modelId?: string) => void
  onStopTask: (task: Task) => void
  resolveModelSelectionKey: (model: ModelOption) => string
}) {
  const effectiveEffort = hermesModel?.reasoning.effectiveEffort ?? 'medium'
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const canSend = Boolean(prompt.trim() || composerAttachments.length)

  return (
    <form className="composer" onSubmit={onSubmit}>
      {composerSkillNames.length > 0 && (
        <div className="composer-skill-strip">
          <span>本次预载技能</span>
          {composerSkillNames.map((name) => (
            <button
              type="button"
              key={name}
              onClick={() => onRemoveSkill(name)}
            >
              <BookOpen size={13} />
              {name}
              <XCircle size={12} />
            </button>
          ))}
        </div>
      )}
      {composerAttachments.length > 0 && (
        <div className="composer-attachment-strip" aria-label="本轮附件">
          {composerAttachments.map((attachment) => (
            <div
              className="composer-attachment-chip"
              key={attachment.id}
            >
              <button
                type="button"
                className="composer-attachment-open"
                title={`打开附件：${attachment.relativePath}`}
                onClick={() => onPreviewAttachment(attachment)}
              >
                <FileText size={14} />
                <span>{attachment.name}</span>
                <em>{formatBytes(attachment.size)}</em>
              </button>
              <button
                type="button"
                className="composer-attachment-remove"
                aria-label={`移除附件 ${attachment.name}`}
                onClick={() => onRemoveAttachment(attachment.id)}
              >
                <XCircle size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={promptInputRef}
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={onPromptKeyDown}
        placeholder="告诉 Hermes 你要做什么。附件和文件会放在当前授权工作区中。"
        aria-label="任务输入框，按 Enter 发送，按 Shift 加 Enter 换行"
        rows={3}
      />
      <div className="composer-bar">
        <button
          type="button"
          className="composer-icon-button composer-context"
          title={`当前工作区：${selectedWorkspaceName ?? '未选择工作区'}`}
          aria-label={`当前工作区：${selectedWorkspaceName ?? '未选择工作区'}`}
          onClick={onOpenWorkspace}
        >
          <Folder size={15} />
          <ChevronDown size={14} />
        </button>
        <button
          type="button"
          className="composer-icon-button composer-attach"
          title="添加附件到当前工作区"
          aria-label="添加附件到当前工作区"
          disabled={attachmentUploading || Boolean(runningTask)}
          onClick={() => attachmentInputRef.current?.click()}
        >
          {attachmentUploading ? <Loader2 size={15} className="spin" /> : <Paperclip size={15} />}
        </button>
        <input
          ref={attachmentInputRef}
          type="file"
          data-testid="composer-file-input"
          accept=".ppt,.pptx,.ppsx,.doc,.docx,.xls,.xlsx,.xlsm,.csv,.tsv,.pdf,.txt,.md,image/*"
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? [])
            if (files.length) onAttachFiles(files)
            event.currentTarget.value = ''
          }}
        />
        <div className="composer-actions">
          <div className="model-picker" ref={modelPickerRef}>
            {modelMenuOpen && (
              <div className="model-menu model-runtime-menu">
                <div className="model-menu-title">运行参数</div>
                <div className="model-menu-section">
                  <div className="model-menu-section-head">
                    <Brain size={13} />
                    <span>思考强度</span>
                    <em>{reasoningEffortLabel(effectiveEffort)}</em>
                  </div>
                  <div className="reasoning-options" aria-label="思考强度">
                    {reasoningEffortOptions.map((option) => {
                      const activeEffort = hermesModel?.reasoning.effort ?? ''
                      const active = activeEffort === option.value
                      return (
                        <button
                          type="button"
                          className={`reasoning-option${active ? ' active' : ''}`}
                          key={option.value || 'auto'}
                          disabled={hermesModelUpdating === 'reasoning'}
                          onClick={() => onConfigureReasoning(
                            { effort: option.value },
                            `思考强度已切换为：${option.label}`
                          )}
                        >
                          <span>{option.label}</span>
                          {active && <CheckCircle2 size={13} />}
                        </button>
                      )
                    })}
                  </div>
                  <p className="model-menu-help">低更快，高更适合复杂推理；这里直接写入 Hermes 的 `agent.reasoning_effort`。</p>
                </div>
                <div className="model-menu-section">
                  <button
                    type="button"
                    className={`reasoning-toggle${hermesModel?.reasoning.showReasoning ? ' active' : ''}`}
                    disabled={hermesModelUpdating === 'reasoning'}
                    onClick={() => onConfigureReasoning(
                      { showReasoning: !hermesModel?.reasoning.showReasoning },
                      hermesModel?.reasoning.showReasoning ? '已隐藏原始思考' : '已开启原始思考显示'
                    )}
                  >
                    {hermesModel?.reasoning.showReasoning ? <Eye size={14} /> : <EyeOff size={14} />}
                    <div>
                      <strong>{hermesModel?.reasoning.showReasoning ? '显示原始思考' : '隐藏原始思考'}</strong>
                      <span>{hermesModel?.reasoning.showReasoning ? '会展示模型 reasoning token，可能较长。' : '推荐：只保留过程摘要，避免刷屏。'}</span>
                    </div>
                    {hermesModelUpdating === 'reasoning' ? <Loader2 size={13} className="spin" /> : null}
                  </button>
                </div>
                <div className="model-menu-section">
                  <div className="model-menu-section-head">
                    <Bot size={13} />
                    <span>模型</span>
                  </div>
                </div>
                {modelMenuGroups.map((group) => (
                  <div className="model-menu-group" key={group.label || 'default-models'}>
                    {group.label && <div className="model-menu-group-title">{group.label}</div>}
                    {group.models.map((model) => (
                      <button
                        type="button"
                        className={`model-option-row${resolveModelSelectionKey(model) === selectedModelId ? ' active' : ''}`}
                        key={resolveModelSelectionKey(model)}
                        onClick={() => onSelectModel(model)}
                      >
                        <Bot size={14} />
                        <div>
                          <strong>{model.label}</strong>
                          <span>{model.description ?? model.provider ?? model.id}</span>
                        </div>
                        {resolveModelSelectionKey(model) === selectedModelId && <CheckCircle2 size={14} />}
                      </button>
                    ))}
                  </div>
                ))}
                <div className="model-menu-actions">
                  <button
                    type="button"
                    className="add-model-option key-option"
                    onClick={() => {
                      onOpenModelConfig(
                        selectedModel.provider || hermesModel?.provider || '',
                        selectedModel.id === 'auto' ? hermesModel?.defaultModel : selectedModel.id
                      )
                      onModelMenuOpenChange(false)
                    }}
                  >
                    <Shield size={14} />
                    重填 Key
                  </button>
                  <button
                    type="button"
                    className="add-model-option"
                    onClick={() => {
                      onOpenModelConfig()
                      onModelMenuOpenChange(false)
                    }}
                  >
                    <Settings size={14} />
                    模型服务设置
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              className="model-trigger"
              title={`当前模型：${selectedModel.label}，思考强度：${reasoningEffortLabel(effectiveEffort)}`}
              aria-label={`当前模型：${selectedModel.label}，思考强度：${reasoningEffortLabel(effectiveEffort)}`}
              onClick={() => onModelMenuOpenChange((open) => !open)}
            >
              <Zap size={14} />
              <span>{composerModelTriggerLabel(selectedModel)}</span>
              <em>{reasoningEffortShortLabel(effectiveEffort)}</em>
              <ChevronDown size={14} />
            </button>
          </div>
          <button
            type={runningTask ? 'button' : 'submit'}
            className={runningTask ? 'send-button icon-send-button running' : 'send-button icon-send-button'}
            title={runningTask ? '停止当前任务' : '发送给 Hermes'}
            aria-label={runningTask ? '停止当前任务' : '发送给 Hermes'}
            disabled={runningTask ? stoppingTaskId === runningTask.id : isSubmitting || attachmentUploading || !canSend}
            onClick={runningTask ? () => onStopTask(runningTask) : undefined}
          >
            {runningTask
              ? stoppingTaskId === runningTask.id
                ? <Loader2 size={16} className="spin" />
                : <Pause size={17} />
              : isSubmitting ? <Loader2 size={16} className="spin" /> : <ArrowUp size={18} />}
          </button>
        </div>
      </div>
      {modelNotice && <div className="composer-notice">{modelNotice}</div>}
    </form>
  )
}

const reasoningEffortOptions: Array<{ value: HermesReasoningEffort; label: string }> = [
  { value: '', label: '智能' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '超高' }
]

function reasoningEffortLabel(effort: HermesReasoningEffort | string) {
  if (effort === 'none') return '关闭'
  if (effort === 'minimal') return '极低'
  if (effort === 'low') return '低'
  if (effort === 'high') return '高'
  if (effort === 'xhigh') return '超高'
  if (effort === '') return '智能'
  return '中'
}

function reasoningEffortShortLabel(effort: HermesReasoningEffort | string) {
  if (effort === 'none') return '关'
  if (effort === 'minimal') return '极低'
  if (effort === 'low') return '低'
  if (effort === 'high') return '高'
  if (effort === 'xhigh') return '超高'
  return '中'
}

function composerModelTriggerLabel(model: ModelOption) {
  const label = model.label.includes('·') ? model.label.split('·').pop()?.trim() : model.label
  const compact = label?.replace(/^Hermes\s*默认模型$/, '默认模型') || model.id || '模型'
  return compact.length > 18 ? `${compact.slice(0, 16)}...` : compact
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
