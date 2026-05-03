import {
  Bot,
  FileText,
  Globe2,
  Info,
  MessageSquarePlus,
  Palette,
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
import { McpSettingsSection } from './mcp'
import { ModelSettingsSection } from './models'
import {
  AccountSettingsSection,
  AboutSettingsSection,
  AppearanceSettingsSection,
  CloudRuntimeSettingsSection,
  ConversationSettingsSection,
  GeneralSettingsSection,
  InfoSettingsSection,
  RulesSettingsSection
} from './SettingsPages'
import type { SettingsPrefs, SettingsTab } from './settingsTypes'

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
  hermesDashboardStarting,
  hermesDashboardError,
  onTabChange,
  onClose,
  onRefreshRuntime,
  onStartHermesDashboard,
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
  hermesDashboardStarting: boolean
  hermesDashboardError: string | null
  onTabChange: (tab: SettingsTab) => void
  onClose: () => void
  onRefreshRuntime: () => void
  onStartHermesDashboard: () => void
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
    { id: 'account', label: '本机', icon: <User size={15} />, group: 'main' },
    { id: 'general', label: '通用', icon: <Settings size={15} />, group: 'main' },
    { id: 'appearance', label: '外观', icon: <Palette size={15} />, group: 'main' },
    { id: 'mcp', label: 'MCP', icon: <Plug size={15} />, group: 'tools' },
    { id: 'models', label: '模型', icon: <Bot size={15} />, group: 'tools' },
    { id: 'conversation', label: '对话流', icon: <MessageSquarePlus size={15} />, group: 'tools' },
    { id: 'external', label: '外部应用授权', icon: <Shield size={15} />, group: 'tools' },
    { id: 'cloud', label: '运行环境', icon: <CloudIcon />, group: 'tools' },
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
          {tabs.map((item) => (
            <button
              className={tab === item.id ? 'active' : ''}
              key={item.id}
              onClick={() => onTabChange(item.id)}
            >
              {item.icon}
              {item.label}
              {(item.id === 'appearance' || item.id === 'cloud') && <span className="settings-divider" />}
            </button>
          ))}
        </div>
      </aside>
      <section className="settings-panel">
        <button className="settings-close" onClick={onClose} aria-label="关闭设置">
          <XCircle size={18} />
        </button>
        {tab === 'account' && (
          <AccountSettingsSection privacyMode={privacyMode} onPrivacyChange={onPrivacyChange} />
        )}
        {tab === 'general' && (
          <GeneralSettingsSection
            language={language}
            theme={theme}
            prefs={prefs}
            onLanguageChange={onLanguageChange}
            onThemeChange={onThemeChange}
            onPrefChange={onPrefChange}
          />
        )}
        {tab === 'appearance' && (
          <AppearanceSettingsSection
            theme={theme}
            prefs={prefs}
            onThemeChange={onThemeChange}
            onPrefChange={onPrefChange}
          />
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
          <ConversationSettingsSection
            prefs={prefs}
            commandDraft={commandDraft}
            pathDraft={pathDraft}
            onCommandDraftChange={setCommandDraft}
            onPathDraftChange={setPathDraft}
            onPrefChange={onPrefChange}
          />
        )}
        {tab === 'external' && (
          <InfoSettingsSection
            title="外部应用授权"
            items={[
              ['飞书', '使用 lark-cli / Hermes skill'],
              ['浏览器', '使用本机 Browser 能力'],
              ['状态', '后续补 OAuth 状态面板']
            ]}
          />
        )}
        {tab === 'cloud' && (
          <CloudRuntimeSettingsSection
            runtime={runtime}
            dashboardStarting={hermesDashboardStarting}
            dashboardError={hermesDashboardError}
            onRefreshRuntime={onRefreshRuntime}
            onStartDashboard={onStartHermesDashboard}
          />
        )}
        {tab === 'commands' && (
          <InfoSettingsSection
            title="命令"
            items={[
              ['启动', 'npm run dev'],
              ['类型检查', 'npm run typecheck'],
              ['构建前端', 'npm run build:web']
            ]}
          />
        )}
        {tab === 'rules' && (
          <RulesSettingsSection
            prefs={prefs}
            ruleDraft={ruleDraft}
            onRuleDraftChange={setRuleDraft}
            onAddRule={onAddRule}
            onPrefChange={onPrefChange}
          />
        )}
        {tab === 'about' && (
          <AboutSettingsSection
            hermesUpdate={hermesUpdate}
            hermesUpdateLoading={hermesUpdateLoading}
            hermesUpdateError={hermesUpdateError}
            hermesCompatibilityResult={hermesCompatibilityResult}
            hermesCompatibilityRunning={hermesCompatibilityRunning}
            hermesCompatibilityError={hermesCompatibilityError}
            hermesAutoUpdateResult={hermesAutoUpdateResult}
            hermesAutoUpdating={hermesAutoUpdating}
            hermesAutoUpdateError={hermesAutoUpdateError}
            onRefreshHermesUpdate={onRefreshHermesUpdate}
            onRunHermesCompatibilityTest={onRunHermesCompatibilityTest}
            onRunHermesAutoUpdate={onRunHermesAutoUpdate}
          />
        )}
      </section>
    </div>
  )
}

function CloudIcon() {
  return <Globe2 size={15} />
}
