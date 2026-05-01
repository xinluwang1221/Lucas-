import {
  Bot,
  FileText,
  Globe2,
  Info,
  LogOut,
  MessageSquarePlus,
  Play,
  Plus,
  Plug,
  Settings,
  Shield,
  Terminal,
  User,
  XCircle
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type {
  BackgroundServiceStatus,
  HermesAutoUpdateResult,
  HermesCompatibilityTestResult,
  HermesMcpConfig,
  HermesMcpRecommendations,
  HermesMcpServeStatus,
  HermesMcpTestResult,
  HermesModelCatalogProvider,
  HermesModelOverview,
  HermesRuntime,
  HermesUpdateStatus,
  ModelOption
} from '../../lib/api'
import { HermesUpdatePanel } from './HermesUpdatePanel'
import { McpSettingsSection } from './mcp'
import { ModelSettingsSection } from './models'
import type { RulesScope, SettingsPrefs, SettingsTab } from './settingsTypes'

export function SettingsModal({
  tab,
  language,
  theme,
  privacyMode,
  runtime,
  hermesUpdate,
  hermesUpdateLoading,
  hermesUpdateError,
  hermesCompatibilityResult,
  hermesCompatibilityRunning,
  hermesCompatibilityError,
  hermesAutoUpdateResult,
  hermesAutoUpdating,
  hermesAutoUpdateError,
  selectedModel,
  models,
  modelCatalog,
  selectedModelId,
  hermesModel,
  hermesModelUpdating,
  hermesModelError,
  modelCatalogRefreshing,
  prefs,
  hermesMcp,
  mcpError,
  mcpTestResults,
  mcpTestingId,
  mcpUpdatingId,
  mcpDeletingId,
  mcpToolUpdatingId,
  mcpRecommendations,
  mcpRecommendationsLoading,
  mcpRecommendationsError,
  backgroundStatus,
  backgroundUpdating,
  backgroundError,
  mcpServeStatus,
  mcpServeUpdating,
  mcpServeError,
  onTabChange,
  onClose,
  onRefreshHermesUpdate,
  onRunHermesCompatibilityTest,
  onRunHermesAutoUpdate,
  onLanguageChange,
  onThemeChange,
  onPrivacyChange,
  onPrefChange,
  onToggleMcpServer,
  onRefreshMcp,
  onTestMcpServer,
  onEditMcpServer,
  onSetMcpToolSelection,
  onDeleteMcpServer,
  onOpenMcpMarketplace,
  onOpenManualMcp,
  onRefreshMcpRecommendationsWithAi,
  onToggleBackgroundServices,
  onToggleMcpServe,
  onRefreshMcpServe,
  onSelectModel,
  onDeleteModel,
  onSetHermesDefaultModel,
  onSetHermesFallbackProviders,
  onDeleteHermesModelProvider,
  onRefreshModels,
  onRefreshModelCatalog,
  onAddRule,
  onOpenAddModel
}: {
  tab: SettingsTab
  language: string
  theme: string
  privacyMode: boolean
  runtime: HermesRuntime | null
  hermesUpdate: HermesUpdateStatus | null
  hermesUpdateLoading: boolean
  hermesUpdateError: string | null
  hermesCompatibilityResult: HermesCompatibilityTestResult | null
  hermesCompatibilityRunning: boolean
  hermesCompatibilityError: string | null
  hermesAutoUpdateResult: HermesAutoUpdateResult | null
  hermesAutoUpdating: boolean
  hermesAutoUpdateError: string | null
  selectedModel: ModelOption
  models: ModelOption[]
  modelCatalog: HermesModelCatalogProvider[]
  selectedModelId: string
  hermesModel: HermesModelOverview | null
  hermesModelUpdating: string | null
  hermesModelError: string | null
  modelCatalogRefreshing: boolean
  prefs: SettingsPrefs
  hermesMcp: HermesMcpConfig | null
  mcpError: string | null
  mcpTestResults: Record<string, HermesMcpTestResult>
  mcpTestingId: string | null
  mcpUpdatingId: string | null
  mcpDeletingId: string | null
  mcpToolUpdatingId: string | null
  mcpRecommendations: HermesMcpRecommendations | null
  mcpRecommendationsLoading: boolean
  mcpRecommendationsError: string | null
  backgroundStatus: BackgroundServiceStatus | null
  backgroundUpdating: boolean
  backgroundError: string | null
  mcpServeStatus: HermesMcpServeStatus | null
  mcpServeUpdating: boolean
  mcpServeError: string | null
  onTabChange: (tab: SettingsTab) => void
  onClose: () => void
  onRefreshHermesUpdate: () => void
  onRunHermesCompatibilityTest: () => void
  onRunHermesAutoUpdate: () => void
  onLanguageChange: (value: string) => void
  onThemeChange: (value: string) => void
  onPrivacyChange: (value: boolean) => void
  onPrefChange: <K extends keyof SettingsPrefs>(key: K, value: SettingsPrefs[K]) => void
  onToggleMcpServer: (serverId: string, enabled: boolean) => void
  onRefreshMcp: () => void
  onTestMcpServer: (serverId: string) => void
  onEditMcpServer: (server: HermesMcpConfig['servers'][number]) => void
  onSetMcpToolSelection: (serverId: string, mode: 'all' | 'include' | 'exclude', tools: string[]) => void
  onDeleteMcpServer: (serverId: string) => void
  onOpenMcpMarketplace: () => void
  onOpenManualMcp: () => void
  onRefreshMcpRecommendationsWithAi: () => void
  onToggleBackgroundServices: (enabled: boolean) => void
  onToggleMcpServe: (enabled: boolean) => void
  onRefreshMcpServe: () => void
  onSelectModel: (model: ModelOption) => void
  onDeleteModel: (model: ModelOption) => void
  onSetHermesDefaultModel: (modelId: string, provider?: string) => void
  onSetHermesFallbackProviders: (providers: string[]) => void
  onDeleteHermesModelProvider: (providerId: string, label: string) => void
  onRefreshModels: () => void
  onRefreshModelCatalog: () => void
  onAddRule: (rule: string) => void
  onOpenAddModel: (providerId?: string, modelId?: string) => void
}) {
  const [commandDraft, setCommandDraft] = useState('')
  const [pathDraft, setPathDraft] = useState('')
  const [ruleDraft, setRuleDraft] = useState('')
  const tabs: Array<{ id: SettingsTab; label: string; icon: ReactNode; group?: 'main' | 'tools' | 'about' }> = [
    { id: 'account', label: '账号', icon: <User size={15} />, group: 'main' },
    { id: 'general', label: '通用', icon: <Settings size={15} />, group: 'main' },
    { id: 'mcp', label: 'MCP', icon: <Plug size={15} />, group: 'tools' },
    { id: 'models', label: '模型', icon: <Bot size={15} />, group: 'tools' },
    { id: 'conversation', label: '对话流', icon: <MessageSquarePlus size={15} />, group: 'tools' },
    { id: 'external', label: '外部应用授权', icon: <Shield size={15} />, group: 'tools' },
    { id: 'cloud', label: '云端运行环境', icon: <CloudIcon />, group: 'tools' },
    { id: 'commands', label: '命令', icon: <Terminal size={15} />, group: 'about' },
    { id: 'rules', label: '规则', icon: <FileText size={15} />, group: 'about' },
    { id: 'about', label: '关于 Hermes Cowork', icon: <Info size={15} />, group: 'about' }
  ]

  return (
    <div className="settings-modal">
      <aside className="settings-sidebar">
        <div className="settings-user">
          <span className="account-avatar"><User size={16} /></span>
          <strong>Lucas</strong>
          <span className="local-badge">本机</span>
        </div>
        <div className="settings-nav">
          {tabs.map((item, index) => (
            <button
              className={tab === item.id ? 'active' : ''}
              key={item.id}
              onClick={() => onTabChange(item.id)}
            >
              {item.icon}
              {item.label}
              {(index === 1 || index === 6) && <span className="settings-divider" />}
            </button>
          ))}
        </div>
      </aside>
      <section className="settings-panel">
        <button className="settings-close" onClick={onClose} aria-label="关闭设置">
          <XCircle size={18} />
        </button>
        {tab === 'account' && (
          <SettingsSection title="账号">
            <div className="settings-block">
              <h3>账户信息</h3>
              <div className="account-card">
                <div>
                  <strong>Lucas</strong>
                  <span>Hermes Cowork 本机账户</span>
                </div>
                <button className="ghost-button">管理账号</button>
              </div>
            </div>
            <div className="settings-block">
              <div className="settings-row">
                <div>
                  <strong>隐私模式</strong>
                  <p>开启后，界面会弱化任务内容预览。后续可接入日志脱敏和引用隐藏。</p>
                </div>
                <Toggle checked={privacyMode} onChange={onPrivacyChange} />
              </div>
            </div>
            <button className="settings-logout">
              <LogOut size={14} />
              退出登录
            </button>
          </SettingsSection>
        )}
        {tab === 'general' && (
          <SettingsSection title="通用">
            <SettingsBlock title="基础设置">
              <SettingsControlRow title="主题" detail="选择主题">
                <SelectControl value={theme} options={['亮色', '跟随系统', '暗色']} onChange={onThemeChange} />
              </SettingsControlRow>
              <SettingsControlRow title="语言" detail="选择您喜欢的按钮标签和应用内其他文本的语言">
                <SelectControl value={language} options={['简体中文', '英文']} onChange={onLanguageChange} />
              </SettingsControlRow>
            </SettingsBlock>
            <SettingsBlock title="偏好设置">
              <SettingsControlRow title="本地链接的默认打开方式" detail="点击终端中的本地链接时，是否自动使用内置浏览器打开">
                <SelectControl
                  value={prefs.linkOpenMode}
                  options={['始终询问', '内置浏览器', '系统默认浏览器']}
                  onChange={(value) => onPrefChange('linkOpenMode', value)}
                />
              </SettingsControlRow>
            </SettingsBlock>
            <SettingsBlock title="数据管理">
              <SettingsControlRow title="浏览器数据" detail="浏览器中的站点数据（如 Cookies、本地存储等）">
                <button className="settings-danger-button">清除</button>
              </SettingsControlRow>
            </SettingsBlock>
          </SettingsSection>
        )}
        {tab === 'mcp' && (
          <McpSettingsSection
            mcpScope={prefs.mcpScope}
            hermesMcp={hermesMcp}
            mcpError={mcpError}
            mcpTestResults={mcpTestResults}
            mcpTestingId={mcpTestingId}
            mcpUpdatingId={mcpUpdatingId}
            mcpDeletingId={mcpDeletingId}
            mcpToolUpdatingId={mcpToolUpdatingId}
            mcpRecommendations={mcpRecommendations}
            mcpRecommendationsLoading={mcpRecommendationsLoading}
            mcpRecommendationsError={mcpRecommendationsError}
            backgroundStatus={backgroundStatus}
            backgroundUpdating={backgroundUpdating}
            backgroundError={backgroundError}
            mcpServeStatus={mcpServeStatus}
            mcpServeUpdating={mcpServeUpdating}
            mcpServeError={mcpServeError}
            onMcpScopeChange={(value) => onPrefChange('mcpScope', value)}
            onToggleMcpServer={onToggleMcpServer}
            onRefreshMcp={onRefreshMcp}
            onTestMcpServer={onTestMcpServer}
            onEditMcpServer={onEditMcpServer}
            onSetMcpToolSelection={onSetMcpToolSelection}
            onDeleteMcpServer={onDeleteMcpServer}
            onOpenMcpMarketplace={onOpenMcpMarketplace}
            onOpenManualMcp={onOpenManualMcp}
            onRefreshMcpRecommendationsWithAi={onRefreshMcpRecommendationsWithAi}
            onToggleBackgroundServices={onToggleBackgroundServices}
            onToggleMcpServe={onToggleMcpServe}
            onRefreshMcpServe={onRefreshMcpServe}
          />
        )}
        {tab === 'models' && (
          <ModelSettingsSection
            selectedModel={selectedModel}
            models={models}
            modelCatalog={modelCatalog}
            selectedModelId={selectedModelId}
            hermesModel={hermesModel}
            hermesModelUpdating={hermesModelUpdating}
            hermesModelError={hermesModelError}
            modelCatalogRefreshing={modelCatalogRefreshing}
            onSelectModel={onSelectModel}
            onDeleteModel={onDeleteModel}
            onSetHermesDefaultModel={onSetHermesDefaultModel}
            onSetHermesFallbackProviders={onSetHermesFallbackProviders}
            onDeleteHermesModelProvider={onDeleteHermesModelProvider}
            onRefreshModels={onRefreshModels}
            onRefreshModelCatalog={onRefreshModelCatalog}
            onOpenAddModel={onOpenAddModel}
          />
        )}
        {tab === 'conversation' && (
          <SettingsSection title="对话流">
            <SettingsBlock title="手动任务">
              <SettingsControlRow title="自动运行 MCP" detail="使用智能体时，自动运行 MCP 工具">
                <Toggle checked={prefs.autoRunMcp} onChange={(value) => onPrefChange('autoRunMcp', value)} />
              </SettingsControlRow>
              <SettingsControlRow title="命令运行方式" detail="命令在沙箱中自动执行，白名单中的命令可绕过沙箱。">
                <SelectControl
                  value={prefs.commandRunMode}
                  options={['沙箱运行（支持白名单）', '每次询问', '直接运行']}
                  onChange={(value) => onPrefChange('commandRunMode', value)}
                />
              </SettingsControlRow>
              <SettingsControlRow title="白名单列表">
                <InlineAddControl
                  value={commandDraft}
                  placeholder="请输入命令"
                  onChange={setCommandDraft}
                  onAdd={() => {
                    const nextCommand = commandDraft.trim()
                    if (!nextCommand) return
                    onPrefChange('commandWhitelist', prefs.commandWhitelist.includes(nextCommand) ? prefs.commandWhitelist : [...prefs.commandWhitelist, nextCommand])
                    setCommandDraft('')
                  }}
                />
              </SettingsControlRow>
              <SettingsControlRow title="沙箱自定义配置" detail="配置沙箱环境的文件系统访问规则。">
                <button className="settings-button">打开配置</button>
              </SettingsControlRow>
              <SettingsControlRow title="编辑工作区外的文件" detail="控制工作区外文件编辑的处理方式，不包含删除操作。">
                <SelectControl
                  value={prefs.editExternalFilesMode}
                  options={['使用白名单', '每次询问', '禁止编辑']}
                  onChange={(value) => onPrefChange('editExternalFilesMode', value)}
                />
              </SettingsControlRow>
              <SettingsControlRow title="白名单路径">
                <InlineAddControl
                  value={pathDraft}
                  placeholder="输入路径规则"
                  onChange={setPathDraft}
                  onAdd={() => {
                    const nextPath = pathDraft.trim()
                    if (!nextPath) return
                    onPrefChange('externalPathRules', prefs.externalPathRules.includes(nextPath) ? prefs.externalPathRules : [...prefs.externalPathRules, nextPath])
                    setPathDraft('')
                  }}
                />
              </SettingsControlRow>
            </SettingsBlock>
            <SettingsBlock title="浏览器">
              <SettingsControlRow title="浏览器自动化" detail="连接到内置浏览器">
                <SelectControl
                  value={prefs.browserAutomation}
                  options={['内置浏览器', '系统 Chrome', '关闭']}
                  onChange={(value) => onPrefChange('browserAutomation', value)}
                />
              </SettingsControlRow>
            </SettingsBlock>
            <SettingsBlock title="终端工具偏好">
              <SettingsControlRow title="执行命令时自动打开终端" detail="智能体执行终端命令时，是否自动显示终端面板">
                <SelectControl
                  value={prefs.terminalAutoOpen}
                  options={['不打开', '仅错误时打开', '总是打开']}
                  onChange={(value) => onPrefChange('terminalAutoOpen', value)}
                />
              </SettingsControlRow>
            </SettingsBlock>
            <SettingsBlock title="任务状态通知">
              <SettingsControlRow title="允许在任务完成或失败时接收通知" detail="允许在任务完成或失败时接收通知，请在 Mac 的系统设置 > 通知中开启通知，以便及时收到提醒">
                <div className="notification-toggles">
                  <label>横幅 <Toggle checked={prefs.notifyBanner} onChange={(value) => onPrefChange('notifyBanner', value)} /></label>
                  <label>声音 <Toggle checked={prefs.notifySound} onChange={(value) => onPrefChange('notifySound', value)} /></label>
                  <label>菜单栏 <Toggle checked={prefs.notifyMenu} onChange={(value) => onPrefChange('notifyMenu', value)} /></label>
                </div>
              </SettingsControlRow>
              <SettingsControlRow title="音量设置">
                <input
                  className="settings-number-input"
                  type="number"
                  min={0}
                  max={100}
                  value={prefs.soundVolume}
                  onChange={(event) => onPrefChange('soundVolume', Number(event.target.value))}
                />
              </SettingsControlRow>
              <div className="sound-list">
                {['任务完成', '等待操作', '异常打断'].map((name) => (
                  <div key={name}>
                    <span className="sound-icon"><MusicIcon /></span>
                    <strong>{name}</strong>
                    <small>默认</small>
                    <button><Play size={13} /></button>
                    <button><FileText size={13} /></button>
                  </div>
                ))}
              </div>
            </SettingsBlock>
            <SettingsBlock title="工作空间下载（需重启）">
              <SettingsControlRow title="禁用多线程下载" detail="禁用工作空间下载的多连接并行下载器，并切换为单线程下载">
                <Toggle checked={prefs.multiThreadDownload} onChange={(value) => onPrefChange('multiThreadDownload', value)} />
              </SettingsControlRow>
              <SettingsControlRow title="最大下载重试次数" detail="工作空间下载的最大重试次数">
                <input
                  className="settings-number-input"
                  type="number"
                  min={0}
                  max={20}
                  value={prefs.maxDownloadRetries}
                  onChange={(event) => onPrefChange('maxDownloadRetries', Number(event.target.value))}
                />
              </SettingsControlRow>
            </SettingsBlock>
          </SettingsSection>
        )}
        {tab === 'external' && (
          <SettingsSection title="外部应用授权">
            <InfoGrid items={[
              ['飞书', '使用 lark-cli / Hermes skill'],
              ['浏览器', '使用本机 Browser 能力'],
              ['状态', '后续补 OAuth 状态面板']
            ]} />
          </SettingsSection>
        )}
        {tab === 'cloud' && (
          <SettingsSection title="云端运行环境">
            <InfoGrid items={[
              ['运行范围', '本机'],
              ['后端', 'Hermes Cowork API'],
              ['Hermes', runtime?.bridgeMode ?? '未知']
            ]} />
          </SettingsSection>
        )}
        {tab === 'commands' && (
          <SettingsSection title="命令">
            <InfoGrid items={[
              ['启动', 'npm run dev'],
              ['类型检查', 'npm run typecheck'],
              ['构建前端', 'npm run build:web']
            ]} />
          </SettingsSection>
        )}
        {tab === 'rules' && (
          <SettingsSection title="规则">
            <SettingsSubtabs
              value={prefs.rulesScope}
              options={[['local', '本地'], ['cloud', '云端']]}
              onChange={(value) => onPrefChange('rulesScope', value as RulesScope)}
            />
            <SettingsBlock title="导入设置">
              <SettingsControlRow title="将 AGENTS.md 包含在上下文中" detail="智能体将读取根目录中的 AGENTS.md 文件并将其添加到上下文中。">
                <Toggle checked={prefs.includeAgentsMd} onChange={(value) => onPrefChange('includeAgentsMd', value)} />
              </SettingsControlRow>
              <SettingsControlRow title="将 CLAUDE.md 包含在上下文中" detail="智能体将读取根目录中的 CLAUDE.md 和 CLAUDE.local.md 文件并将其添加到上下文中。">
                <Toggle checked={prefs.includeClaudeMd} onChange={(value) => onPrefChange('includeClaudeMd', value)} />
              </SettingsControlRow>
            </SettingsBlock>
            <SettingsBlock title="规则">
              <div className="settings-card-header compact">
                <div>
                  <strong>规则</strong>
                  <span>创建并管理规则，在聊天过程中遵循这些规则。</span>
                </div>
                <InlineAddControl
                  value={ruleDraft}
                  placeholder="输入规则名称"
                  onChange={setRuleDraft}
                  onAdd={() => {
                    onAddRule(ruleDraft)
                    setRuleDraft('')
                  }}
                  label="创建"
                />
              </div>
              <div className="rules-empty">
                {prefs.rules.length === 0 ? (
                  <>
                    <FileText size={20} />
                    <strong>暂无规则</strong>
                    <span>点击新建以添加你的第一个规则</span>
                  </>
                ) : (
                  prefs.rules.map((rule) => <div className="rule-item" key={rule}>{rule}</div>)
                )}
              </div>
            </SettingsBlock>
          </SettingsSection>
        )}
        {tab === 'about' && (
          <SettingsSection title="关于 Hermes Cowork">
            <div className="about-summary-card">
              <div>
                <span>本机智能体工作台</span>
                <strong>Hermes Cowork</strong>
                <p>负责把 Hermes 的模型、MCP、任务流和升级状态整理成可操作的前端。</p>
              </div>
              <em>v0.1.0</em>
            </div>
            <SettingsBlock title="Hermes 后台更新">
              <HermesUpdatePanel
                status={hermesUpdate}
                loading={hermesUpdateLoading}
                error={hermesUpdateError}
                testResult={hermesCompatibilityResult}
                testRunning={hermesCompatibilityRunning}
                testError={hermesCompatibilityError}
                autoUpdateResult={hermesAutoUpdateResult}
                autoUpdating={hermesAutoUpdating}
                autoUpdateError={hermesAutoUpdateError}
                onRefresh={onRefreshHermesUpdate}
                onRunTest={onRunHermesCompatibilityTest}
                onRunAutoUpdate={onRunHermesAutoUpdate}
              />
            </SettingsBlock>
          </SettingsSection>
        )}
      </section>
    </div>
  )
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="settings-section-content">
      <h2>{title}</h2>
      {children}
    </div>
  )
}

function SettingsBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="settings-block">
      <h3>{title}</h3>
      <div className="settings-card">{children}</div>
    </div>
  )
}

function SettingsControlRow({
  title,
  detail,
  children
}: {
  title: string
  detail?: string
  children?: ReactNode
}) {
  return (
    <div className="settings-control-row">
      <div className="settings-control-copy">
        <strong>{title}</strong>
        {detail && <span>{detail}</span>}
      </div>
      {children && <div className="settings-control-action">{children}</div>}
    </div>
  )
}

function SelectControl({
  value,
  options,
  onChange
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <select className="settings-select-control" value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option}>{option}</option>)}
    </select>
  )
}

function SettingsSubtabs({
  value,
  options,
  onChange
}: {
  value: string
  options: Array<[string, string]>
  onChange: (value: string) => void
}) {
  return (
    <div className="settings-subtabs">
      {options.map(([id, label]) => (
        <button className={value === id ? 'active' : ''} key={id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function InlineAddControl({
  value,
  placeholder,
  label = '',
  onChange,
  onAdd
}: {
  value: string
  placeholder: string
  label?: string
  onChange: (value: string) => void
  onAdd: () => void
}) {
  return (
    <div className="inline-add-control">
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onAdd()
          }
        }}
      />
      <button onClick={onAdd}>
        <Plus size={13} />
        {label}
      </button>
    </div>
  )
}

function MusicIcon() {
  return <span className="music-note">♪</span>
}

function Toggle({
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

function CloudIcon() {
  return <Globe2 size={15} />
}
