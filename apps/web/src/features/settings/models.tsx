import { CheckCircle2, Info, Loader2, Plus, RefreshCw, Shield, Trash2 } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import type {
  HermesModelCatalogProvider,
  HermesModelCredential,
  HermesModelOverview,
  HermesModelProvider,
  ModelOption
} from '../../lib/api'

const providerBaseUrlHints: Record<string, string> = {
  xiaomi: '例如 https://token-plan-cn.xiaomimimo.com/v1',
  deepseek: '通常可留空，Hermes 会使用 DeepSeek 默认地址',
  zai: '通常可留空，Hermes 会使用智谱 GLM 默认地址',
  'kimi-coding': '通常可留空，Hermes 会使用 Moonshot 默认地址',
  'kimi-coding-cn': '通常可留空，Hermes 会使用 Moonshot 国内默认地址',
  minimax: '通常可留空，Hermes 会使用 MiniMax 默认地址',
  'minimax-cn': '通常可留空，Hermes 会使用 MiniMax 国内默认地址',
  alibaba: '通常可留空，Hermes 会使用阿里云百炼默认地址',
  'qwen-oauth': '通常可留空，Hermes 会复用本机 Qwen 登录'
}

export function ModelConfigModal({
  modelCatalog,
  hermesModel,
  providerId,
  modelId,
  modelLabel,
  baseUrl,
  apiKey,
  apiMode,
  notice,
  saving,
  catalogRefreshing,
  onClose,
  onSubmit,
  onProviderChange,
  onModelIdChange,
  onModelLabelChange,
  onBaseUrlChange,
  onApiKeyChange,
  onApiModeChange,
  onRefreshCatalog
}: {
  modelCatalog: HermesModelCatalogProvider[]
  hermesModel: HermesModelOverview | null
  providerId: string
  modelId: string
  modelLabel: string
  baseUrl: string
  apiKey: string
  apiMode: string
  notice: string | null
  saving: boolean
  catalogRefreshing: boolean
  onClose: () => void
  onSubmit: (event: FormEvent) => void
  onProviderChange: (providerId: string) => void
  onModelIdChange: (value: string) => void
  onModelLabelChange: (value: string) => void
  onBaseUrlChange: (value: string) => void
  onApiKeyChange: (value: string) => void
  onApiModeChange: (value: string) => void
  onRefreshCatalog: () => void
}) {
  const rememberedProviderConfig = providerSavedModelConfig(providerId, hermesModel)
  const providerModels = modelCatalog.find((provider) => provider.id === providerId)?.models ?? []

  return (
    <form className="modal model-config-modal" onSubmit={onSubmit}>
      <h2>配置或重填模型 Key</h2>
      <p>如果模型报 401、无返回或凭据失效，就在这里选择服务商并重新输入 Key / Plan Key。保存后写入 Hermes 本机配置与 .env，Key 只保存在你的 Mac 上。</p>
      <div className="model-catalog-refresh-line">
        <span>模型列表来自 Hermes 目录，并可从供应商官网补充新版本。</span>
        <button type="button" className="settings-add-button" onClick={onRefreshCatalog} disabled={catalogRefreshing}>
          {catalogRefreshing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          刷新官网模型
        </button>
      </div>
      {notice && <div className="modal-inline-error">{notice}</div>}
      <label>
        服务商
        <select value={providerId} onChange={(event) => onProviderChange(event.target.value)}>
          <option value="">选择模型服务商</option>
          {modelCatalog.map((provider) => (
            <option key={provider.id} value={provider.id}>{provider.label}</option>
          ))}
        </select>
      </label>
      {rememberedProviderConfig.canReuse && (
        <div className="model-config-memory">
          <CheckCircle2 size={14} />
          已记住 {rememberedProviderConfig.label} 的 Base URL 和 API 模式。修复 401 时请重新输入 Key；留空会继续沿用当前凭据。
        </div>
      )}
      <label>
        默认模型
        <select
          value={modelLabel}
          onChange={(event) => {
            const value = event.target.value
            onModelLabelChange(value)
            onModelIdChange(value)
          }}
          disabled={!providerId}
        >
          <option value="">选择模型</option>
          {modelGroupsForProvider(providerId, providerModels).map((group) => (
            group.label ? (
              <optgroup key={group.label} label={group.label}>
                {group.models.map((model) => <option key={model} value={model}>{model}</option>)}
              </optgroup>
            ) : (
              group.models.map((model) => <option key={model} value={model}>{model}</option>)
            )
          ))}
          <option value="custom">使用其他模型</option>
        </select>
      </label>
      {(modelLabel === 'custom' || !modelLabel) && (
        <label>
          自定义模型 ID
          <input
            value={modelId}
            onChange={(event) => {
              onModelIdChange(event.target.value)
              onModelLabelChange(event.target.value)
            }}
            placeholder="例如 mimo-v2.5-pro 或 kimi-k2.5"
          />
        </label>
      )}
      <label>
        Base URL
        <input
          value={baseUrl}
          onChange={(event) => onBaseUrlChange(event.target.value)}
          placeholder={rememberedProviderConfig.baseUrl || providerBaseUrlHints[providerId] || '非自定义服务通常可留空'}
        />
      </label>
      <label>
        API Key
        <input
          type="password"
          value={apiKey}
          onChange={(event) => onApiKeyChange(event.target.value)}
          placeholder={rememberedProviderConfig.canReuse ? '修复 401 请重新输入 Key；留空则沿用当前凭据' : '请输入 Key 或 Plan Key'}
          autoComplete="off"
        />
      </label>
      <label>
        API 模式
        <select value={apiMode} onChange={(event) => onApiModeChange(event.target.value)}>
          <option value="chat_completions">OpenAI 兼容 / Chat Completions</option>
          <option value="anthropic_messages">Anthropic Messages</option>
          <option value="responses">OpenAI Responses</option>
        </select>
      </label>
      <div className="model-config-note">
        保存后会把模型写入 Hermes `config.yaml`，把供应商 Key 写入 Hermes `.env`，并设为 Hermes 默认模型。同一供应商后续切换模型时，Base URL 和 API 模式会自动带入。
      </div>
      <div className="modal-actions">
        <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>
          取消
        </button>
        <button className="send-button" disabled={saving || !providerId || !(modelId.trim() || modelLabel.trim())}>
          {saving ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
          保存 Key 到 Hermes
        </button>
      </div>
    </form>
  )
}

export function ModelSettingsSection({
  selectedModel,
  models,
  modelCatalog,
  selectedModelId,
  hermesModel,
  hermesModelUpdating,
  hermesModelError,
  modelCatalogRefreshing,
  onSelectModel,
  onDeleteModel,
  onSetHermesDefaultModel,
  onSetHermesFallbackProviders,
  onDeleteHermesModelProvider,
  onRefreshModels,
  onRefreshModelCatalog,
  onOpenAddModel
}: {
  selectedModel: ModelOption
  models: ModelOption[]
  modelCatalog: HermesModelCatalogProvider[]
  selectedModelId: string
  hermesModel: HermesModelOverview | null
  hermesModelUpdating: string | null
  hermesModelError: string | null
  modelCatalogRefreshing: boolean
  onSelectModel: (model: ModelOption) => void
  onDeleteModel: (model: ModelOption) => void
  onSetHermesDefaultModel: (modelId: string, provider?: string) => void
  onSetHermesFallbackProviders: (providers: string[]) => void
  onDeleteHermesModelProvider: (providerId: string, label: string) => void
  onRefreshModels: () => void
  onRefreshModelCatalog: () => void
  onOpenAddModel: (providerId?: string, modelId?: string) => void
}) {
  const modelProvidersForView = dedupeModelProvidersForView(hermesModel?.providers ?? [])
  const modelCredentialsForView = hermesModel?.credentials ?? []
  const fallbackProviderIds = hermesModel?.fallbackProviders ?? []
  const fallbackProviderSet = new Set(fallbackProviderIds)
  const configuredCredentialCount = modelCredentialsForView.filter((credential) => credential.configured).length
  const fallbackCandidates = modelProvidersForView.filter((provider) => provider.configured && !provider.isCurrent)
  const currentProviderId = hermesProviderId(hermesModel?.provider ?? selectedModel.provider ?? '')
  const currentProviderLabel = hermesModel?.providerLabel || modelProvidersForView.find((provider) => hermesProviderId(provider.id) === currentProviderId)?.label || currentProviderId || '当前服务商'
  const visibleProviderIds = new Set(modelProvidersForView.map((provider) => hermesProviderId(provider.id)))
  const credentialAlerts = [
    ...modelProvidersForView
      .filter((provider) => providerNeedsCredentialAttention(provider))
      .map((provider) => ({ id: provider.id, label: provider.label, detail: provider.credentialSummary, modelId: provider.isCurrent ? hermesModel?.defaultModel : provider.models[0] })),
    ...modelCredentialsForView
      .filter((credential) => credentialNeedsAttention(credential) && (visibleProviderIds.has(hermesProviderId(credential.id)) || hermesProviderId(credential.id) === currentProviderId))
      .map((credential) => ({ id: credential.id, label: credential.label, detail: credential.detail, modelId: undefined }))
  ]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 3)

  return (
    <div className="settings-section-content">
      <h2>模型</h2>
      <SettingsBlock title="Hermes 的模型能力">
        <div className="model-user-summary">
          <div>
            <span>当前默认模型</span>
            <strong>{hermesModel?.defaultModel || '未配置'}</strong>
            <p>{hermesModel?.providerLabel || 'Hermes 自动选择'} · {hermesModel?.apiMode || '自动 API 模式'}</p>
          </div>
          <div className="model-summary-actions">
            <button className="settings-add-button" onClick={onRefreshModelCatalog} disabled={modelCatalogRefreshing}>
              {modelCatalogRefreshing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
              刷新官网模型
            </button>
            <button className="icon-button" title="刷新模型状态" onClick={onRefreshModels}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        {hermesModelError && <div className="settings-error-line">{hermesModelError}</div>}
        <div className="model-ability-grid">
          <ModelAbilityCard title="默认大脑" value={hermesModel?.defaultModel || '未配置'} detail="决定 Hermes 日常任务默认用哪个模型。" />
          <ModelAbilityCard title="本次任务临时模型" value={selectedModel.label} detail="只影响 Cowork 发起的新任务，不改 Hermes 配置。" />
          <ModelAbilityCard title="备用路线" value={fallbackProviderIds.length ? `${fallbackProviderIds.length} 个备用` : '未开启'} detail="主模型失败时，Hermes 可尝试备用服务。" />
          <ModelAbilityCard title="模型服务状态" value={`${configuredCredentialCount} 个可用凭据`} detail="只展示可用状态，不显示 API key 或 token。" />
        </div>
        <div className="settings-info-banner">
          <Info size={15} />
          普通使用只需要关注默认模型、本次任务模型和备用路线；Provider、Base URL、凭据属于高级配置。
        </div>
        <div className={credentialAlerts.length ? 'model-key-repair-panel attention' : 'model-key-repair-panel'}>
          <div>
            <strong>{credentialAlerts.length ? '检测到模型凭据需要处理' : '模型报 401 或无返回时，先重填 Key'}</strong>
            <span>
              {credentialAlerts.length
                ? `${credentialAlerts[0].label}：${credentialAlerts[0].detail}`
                : `当前默认服务：${currentProviderLabel}。这里会写入 Hermes 本机配置。`}
            </span>
          </div>
          <button
            className="settings-primary-button"
            onClick={() => onOpenAddModel(credentialAlerts[0]?.id || currentProviderId, credentialAlerts[0]?.modelId || hermesModel?.defaultModel)}
          >
            <Shield size={14} />
            重填 Key
          </button>
        </div>
      </SettingsBlock>

      <SettingsBlock title="本次任务用哪个模型">
        <p className="settings-section-copy">选择“使用 Hermes 默认”时，Cowork 不传模型参数，完全跟随 Hermes 当前配置。</p>
        <div className="cowork-model-list simplified">
          {models.map((model) => (
            <div
              className={modelSelectionKey(model) === selectedModelId ? 'cowork-model-row active' : 'cowork-model-row'}
              key={modelSelectionKey(model)}
            >
              <button
                className="cowork-model-select"
                onClick={() => onSelectModel(model)}
                disabled={modelSelectionKey(model) === selectedModelId || hermesModelUpdating === `delete-model:${modelSelectionKey(model)}`}
              >
                <div>
                  <strong>{model.label}</strong>
                  <span>{model.description ?? model.provider ?? model.id}</span>
                </div>
                <em>{modelSelectionKey(model) === selectedModelId ? '当前使用' : '选择'}</em>
              </button>
              {!model.builtIn && (
                <button
                  className="model-delete-button"
                  onClick={() => onDeleteModel(model)}
                  disabled={Boolean(hermesModelUpdating)}
                  title="从已配置模型中移除"
                >
                  {hermesModelUpdating === `delete-model:${modelSelectionKey(model)}` ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                </button>
              )}
            </div>
          ))}
        </div>
        <button className="settings-add-button" onClick={() => onOpenAddModel()}>
          <Plus size={14} />
          添加或重填模型 Key
        </button>
      </SettingsBlock>

      <SettingsBlock title="长期默认模型">
        <p className="settings-section-copy">这里会写回 Hermes `config.yaml`。适合你决定以后所有 Hermes 新任务都使用某个模型。</p>
        <div className="settings-info-banner">
          <Info size={15} />
          供应商只展示中国大模型服务。模型候选来自 Hermes 内置目录，并可点击“刷新官网模型”从公开官网补充新版本；当前读取到 {modelCatalog.length || '0'} 个供应商。当前默认服务需要先切换，才能删除。
        </div>
        <div className="model-provider-list compact">
          {modelProvidersForView.slice(0, 5).map((provider) => {
            const providerCanDelete = !provider.isCurrent && (provider.source === 'config' || provider.source === 'custom')
            return (
              <div className={provider.isCurrent ? 'model-provider-card current' : 'model-provider-card'} key={provider.id}>
                <div className="model-provider-head">
                  <div>
                    <strong>{provider.label}</strong>
                    <span>{provider.credentialSummary || (provider.configured ? '已配置' : '未配置')}</span>
                  </div>
                  <div className="model-provider-actions">
                    <em>{providerNeedsCredentialAttention(provider) ? '需重填 Key' : provider.isCurrent ? '当前' : provider.configured ? '可用' : '未配置'}</em>
                    <button
                      className="model-key-inline-button"
                      onClick={() => onOpenAddModel(provider.id, provider.isCurrent ? hermesModel?.defaultModel : provider.models[0])}
                      title={`重填 ${provider.label} 的 Key`}
                    >
                      <Shield size={13} />
                      Key
                    </button>
                    {providerCanDelete && (
                      <button
                        className="model-delete-button"
                        onClick={() => onDeleteHermesModelProvider(provider.id, provider.label)}
                        disabled={Boolean(hermesModelUpdating)}
                        title="删除这个 Hermes 模型服务配置"
                      >
                        {hermesModelUpdating === `delete-provider:${provider.id}` ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="model-chip-list">
                  {provider.models.length ? modelGroupsForProvider(provider.id, provider.models).map((group) => (
                    <div className="model-chip-group" key={group.label || `${provider.id}-models`}>
                      {group.label && <span className="model-chip-group-label">{group.label}</span>}
                      <div className="model-chip-group-options">
                        {group.models.map((nextModelId) => (
                          <button
                            key={nextModelId}
                            disabled={Boolean(hermesModelUpdating) || (provider.isCurrent && hermesModel?.defaultModel === nextModelId)}
                            onClick={() => onSetHermesDefaultModel(nextModelId, provider.id.startsWith('custom:') ? 'custom' : provider.id)}
                          >
                            {hermesModelUpdating === `${provider.id}:${nextModelId}` ? <Loader2 size={12} className="spin" /> : null}
                            {provider.isCurrent && hermesModel?.defaultModel === nextModelId ? '当前默认 · ' : ''}
                            {nextModelId}
                          </button>
                        ))}
                      </div>
                    </div>
                  )) : <span className="model-chip-empty">暂无可选模型</span>}
                </div>
              </div>
            )
          })}
        </div>
      </SettingsBlock>

      <SettingsBlock title="备用路线">
        <div className="fallback-model-summary">
          <div>
            <span>主模型失败时</span>
            <strong>{fallbackProviderIds.length ? fallbackProviderIds.join(' → ') : '直接提示失败'}</strong>
          </div>
          <button
            className="settings-link-button"
            disabled={!fallbackProviderIds.length || hermesModelUpdating === 'fallbacks'}
            onClick={() => onSetHermesFallbackProviders([])}
          >
            关闭备用
          </button>
        </div>
        <div className="fallback-provider-list">
          {fallbackCandidates.length ? fallbackCandidates.slice(0, 6).map((provider) => {
            const checked = fallbackProviderSet.has(provider.id)
            return (
              <div className={checked ? 'fallback-provider-row active' : 'fallback-provider-row'} key={provider.id}>
                <div>
                  <strong>{provider.label}</strong>
                  <span>{provider.credentialSummary || provider.id}</span>
                </div>
                <SettingsToggle
                  checked={checked}
                  disabled={hermesModelUpdating === 'fallbacks'}
                  onChange={(value) => {
                    const next = value
                      ? [...fallbackProviderIds, provider.id]
                      : fallbackProviderIds.filter((id) => id !== provider.id)
                    onSetHermesFallbackProviders(next)
                  }}
                />
              </div>
            )
          }) : (
            <div className="model-table-empty">暂未发现可作为备用的已配置模型服务。</div>
          )}
        </div>
      </SettingsBlock>

      <details className="settings-block model-advanced-details">
        <summary>高级：模型服务与凭据状态</summary>
        <div className="model-advanced-body">
          <InfoGrid items={[
            ['配置文件', hermesModel?.configPath ?? '/Users/lucas/.hermes/config.yaml'],
            ['环境变量文件', hermesModel?.envPath ?? '/Users/lucas/.hermes/.env'],
            ['Provider', hermesModel?.provider || 'auto'],
            ['Base URL', hermesModel?.baseUrl || '跟随 Hermes/provider 默认值']
          ]} />
          <div className="model-credential-grid">
            {modelCredentialsForView.map((credential) => (
              <div className={credentialPillClass(credential)} key={`${credential.id}-${credential.kind}`}>
                <div>
                  <strong>{credential.label}</strong>
                  <span>{credential.configured ? credential.detail : credential.detail || '未配置'}</span>
                </div>
                {(credentialNeedsAttention(credential) || hermesProviderId(credential.id) === currentProviderId) && (
                  <button className="model-key-mini-button" onClick={() => onOpenAddModel(credential.id)}>
                    重填 Key
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  )
}

export function hermesProviderId(label: string) {
  const map: Record<string, string> = {
    'Hermes 当前 Provider': 'auto',
    'Custom endpoint': 'custom',
    Anthropic: 'anthropic',
    'OpenAI Codex': 'openai-codex',
    MiniMax: 'minimax',
    'Xiaomi MiMo': 'xiaomi',
    OpenRouter: 'openrouter',
    'Kimi / Moonshot': 'kimi',
    'Z.AI / GLM': 'zai'
  }
  return map[label] ?? label.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._:-]/g, '')
}

export function defaultModelApiMode(providerId: string) {
  return hermesProviderId(providerId) === 'anthropic' ? 'anthropic_messages' : 'chat_completions'
}

export function providerSavedModelConfig(providerId: string, overview: HermesModelOverview | null) {
  const id = hermesProviderId(providerId)
  if (!id) {
    return {
      label: '',
      baseUrl: '',
      apiMode: 'chat_completions',
      canReuse: false
    }
  }

  const currentProviderId = hermesProviderId(overview?.provider ?? '')
  const provider = overview?.providers.find((item) => hermesProviderId(item.id) === id)
  const isCurrent = id === currentProviderId
  return {
    label: provider?.label || overview?.providerLabel || id,
    baseUrl: provider?.baseUrl || (isCurrent ? overview?.baseUrl : '') || '',
    apiMode: provider?.apiMode || (isCurrent ? overview?.apiMode : '') || defaultModelApiMode(id),
    canReuse: Boolean(provider?.configured || isCurrent)
  }
}

export function groupModelOptionsForMenu(models: ModelOption[]) {
  const autoModels = models.filter((model) => model.id === 'auto')
  const providerGroups = new Map<string, ModelOption[]>()
  const otherModels: ModelOption[] = []

  for (const model of models) {
    if (model.id === 'auto') continue
    const providerId = hermesProviderId(model.provider ?? '')
    if (!providerId || providerId === 'auto') {
      otherModels.push(model)
      continue
    }
    providerGroups.set(providerId, [...(providerGroups.get(providerId) ?? []), model])
  }

  const groups: Array<{ label: string; models: ModelOption[] }> = []
  if (autoModels.length) groups.push({ label: '常用', models: autoModels })

  for (const [, providerModels] of providerGroups) {
    groups.push({
      label: providerLabelFromModel(providerModels[0]),
      models: providerModels
    })
  }

  if (otherModels.length) groups.push({ label: '本次任务模型', models: otherModels })
  return groups.filter((group) => group.models.length)
}

export function configuredModelOptionsForComposer(models: ModelOption[]) {
  const filtered = models.filter(isConfiguredComposerModel)
  const hasAuto = filtered.some((model) => model.id === 'auto')
  const autoModel = models.find((model) => model.id === 'auto')
  return hasAuto || !autoModel ? filtered : [autoModel, ...filtered]
}

function SettingsBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="settings-block">
      <h3>{title}</h3>
      <div className="settings-card">{children}</div>
    </div>
  )
}

function ModelAbilityCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="model-ability-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  )
}

function SettingsToggle({
  checked,
  disabled = false,
  onChange
}: {
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      className={checked ? 'settings-toggle active' : 'settings-toggle'}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="settings-info-grid">
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  )
}

function dedupeModelProvidersForView(providers: HermesModelOverview['providers']) {
  const byId = new Map<string, HermesModelOverview['providers'][number]>()
  for (const provider of providers) {
    const key = provider.id.startsWith('custom:') ? provider.id.replace(/^custom:/, '') : provider.id
    const existing = byId.get(key)
    if (!existing) {
      byId.set(key, { ...provider, id: key })
      continue
    }
    byId.set(key, {
      ...existing,
      configured: existing.configured || provider.configured,
      isCurrent: existing.isCurrent || provider.isCurrent,
      baseUrl: provider.baseUrl || existing.baseUrl,
      apiMode: provider.apiMode || existing.apiMode,
      models: [...new Set([...existing.models, ...provider.models])],
      credentialSummary: [...new Set([existing.credentialSummary, provider.credentialSummary].filter(Boolean))].join('；')
    })
  }
  return [...byId.values()]
}

function credentialNeedsAttention(credential: HermesModelCredential) {
  return /(验证失败|不可用|401|403|invalid|expired|exhausted|denied|forbidden|unauthorized|error)/i.test(credential.detail)
}

function providerNeedsCredentialAttention(provider: HermesModelProvider) {
  return /(验证失败|不可用|401|403|invalid|expired|exhausted|denied|forbidden|unauthorized|error)/i.test(provider.credentialSummary)
}

function credentialPillClass(credential: HermesModelCredential) {
  if (credentialNeedsAttention(credential)) return 'model-credential-pill attention'
  if (credential.configured) return 'model-credential-pill configured'
  return 'model-credential-pill'
}

function modelGroupsForProvider(providerId: string, models: string[]) {
  const uniqueModels = [...new Set(models.filter(Boolean))]
  if (hermesProviderId(providerId) !== 'xiaomi') {
    return [{ label: '', models: uniqueModels }]
  }

  const v25 = uniqueModels.filter((model) => /^mimo-v2\.5(?:-|$)/i.test(model))
  const v2 = uniqueModels.filter((model) => /^mimo-v2(?:-|$)/i.test(model) && !/^mimo-v2\.5(?:-|$)/i.test(model))
  const other = uniqueModels.filter((model) => !v25.includes(model) && !v2.includes(model))
  return [
    v25.length ? { label: 'MiMo V2.5 系列', models: v25 } : null,
    v2.length ? { label: 'MiMo V2 系列', models: v2 } : null,
    other.length ? { label: '其他模型', models: other } : null
  ].filter((group): group is { label: string; models: string[] } => Boolean(group))
}

function isConfiguredComposerModel(model: ModelOption) {
  if (model.id === 'auto') return true
  if (model.source === 'catalog') return false
  if (model.description?.includes('Hermes 模型目录')) return false
  return true
}

function providerLabelFromModel(model?: ModelOption) {
  if (model?.provider === 'xiaomi') return 'Xiaomi MiMo'
  if (model?.provider === 'minimax') return 'MiniMax'
  const label = model?.description?.split('·')[0]?.trim()
  if (label) return label
  return model?.provider || '模型服务'
}

function modelSelectionKey(model: ModelOption) {
  return model.selectedModelKey || model.id
}
