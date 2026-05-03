import { FileText, Play } from 'lucide-react'
import type { ReactNode } from 'react'
import type {
  HermesAutoUpdateResult,
  HermesCompatibilityTestResult,
  HermesDiagnosticsStatus,
  HermesRuntime,
  HermesUpdateStatus
} from '../../lib/api'
import { HermesUpdatePanel } from './HermesUpdatePanel'
import {
  InfoGrid,
  InlineAddControl,
  MusicIcon,
  SelectControl,
  SettingsBlock,
  SettingsControlRow,
  SettingsSection,
  SettingsSubtabs,
  Toggle
} from './settingsControls'
import type { RulesScope, SettingsPrefs } from './settingsTypes'

type PrefChange = <K extends keyof SettingsPrefs>(key: K, value: SettingsPrefs[K]) => void

export function AccountSettingsSection({
  privacyMode,
  onPrivacyChange
}: {
  privacyMode: boolean
  onPrivacyChange: (value: boolean) => void
}) {
  return (
    <SettingsSection title="本机">
      <div className="settings-block">
        <h3>本机身份</h3>
        <div className="account-card">
          <div>
            <strong>Lucas</strong>
            <span>仅用于本机界面显示和本机配置，不涉及登录账户。</span>
          </div>
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
    </SettingsSection>
  )
}

export function GeneralSettingsSection({
  language,
  prefs,
  onLanguageChange,
  onPrefChange
}: {
  language: string
  theme: string
  prefs: SettingsPrefs
  onLanguageChange: (value: string) => void
  onThemeChange: (value: string) => void
  onPrefChange: PrefChange
}) {
  return (
    <SettingsSection title="通用">
      <SettingsBlock title="基础设置">
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
  )
}

export function AppearanceSettingsSection({
  theme,
  prefs,
  onThemeChange,
  onPrefChange
}: {
  theme: string
  prefs: SettingsPrefs
  onThemeChange: (value: string) => void
  onPrefChange: PrefChange
}) {
  return (
    <SettingsSection title="外观">
      <div className="appearance-preview-card">
        <div className="appearance-preview-header">
          <div>
            <strong>界面层级预览</strong>
            <span>一级标题、区域标题、正文、说明和代码会跟随这里的主题设置。</span>
          </div>
          <div className="settings-segmented">
            {['亮色', '暗色', '跟随系统'].map((option) => (
              <button key={option} className={theme === option ? 'active' : ''} onClick={() => onThemeChange(option)}>
                {option}
              </button>
            ))}
          </div>
        </div>
        <div className="appearance-preview-body">
          <div className="appearance-preview-sidebar">
            <strong>Hermes Cowork</strong>
            <span>本机智能体工作台</span>
            <em>新建任务</em>
          </div>
          <div className="appearance-preview-main">
            <h4>任务标题层级</h4>
            <p>正文用于承载 Hermes 的回答，说明文字保持克制，不抢主要内容。</p>
            <code>~/workspaces/default</code>
          </div>
          <div className="appearance-preview-inspector">
            <h4>工作区</h4>
            <ol>
              <li>任务拆解</li>
              <li>任务产出物</li>
              <li>上下文资源</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="appearance-config-grid">
        <section className="appearance-config-card">
          <h3>主题与色彩</h3>
          <div className="appearance-config-list">
            <AppearanceColorRow
              title="主色"
              detail="用于按钮、链接、进度和选中态。"
              value={prefs.appearanceAccentColor}
              onChange={(value) => onPrefChange('appearanceAccentColor', value)}
            />
            <AppearanceColorRow
              title="强调色"
              detail="用于高亮、焦点和关键状态。"
              value={prefs.appearanceAccentStrongColor}
              onChange={(value) => onPrefChange('appearanceAccentStrongColor', value)}
            />
            <AppearanceColorRow
              title="背景"
              detail="应用最底层背景色。"
              value={prefs.appearanceBackgroundColor}
              onChange={(value) => onPrefChange('appearanceBackgroundColor', value)}
            />
            <AppearanceColorRow
              title="表面"
              detail="卡片、弹窗和面板背景色。"
              value={prefs.appearanceSurfaceColor}
              onChange={(value) => onPrefChange('appearanceSurfaceColor', value)}
            />
            <AppearanceColorRow
              title="文本"
              detail="主要内容和标题颜色。"
              value={prefs.appearanceForegroundColor}
              onChange={(value) => onPrefChange('appearanceForegroundColor', value)}
            />
            <AppearanceColorRow
              title="次要文本"
              detail="说明、元信息和弱化文本颜色。"
              value={prefs.appearanceMutedColor}
              onChange={(value) => onPrefChange('appearanceMutedColor', value)}
            />
          </div>
        </section>

        <div className="appearance-config-stack">
          <section className="appearance-config-card">
            <h3>字体设置</h3>
            <div className="appearance-config-list">
              <AppearanceControlRow title="界面字体" detail="影响界面和大部分文本的显示效果。">
                <AppearanceSelectControl
                  value={prefs.appearanceUiFont}
                  options={UI_FONT_OPTIONS}
                  onChange={(value) => onPrefChange('appearanceUiFont', value)}
                />
              </AppearanceControlRow>
              <AppearanceControlRow title="等宽字体" detail="用于代码块、命令、表格等宽场景。">
                <AppearanceSelectControl
                  value={prefs.appearanceCodeFont}
                  options={CODE_FONT_OPTIONS}
                  onChange={(value) => onPrefChange('appearanceCodeFont', value)}
                />
              </AppearanceControlRow>
              <AppearanceControlRow title="字体大小" detail="调整界面正文的基准大小。">
                <AppearanceSelectControl
                  value={String(prefs.appearanceUiFontSize)}
                  options={UI_FONT_SIZE_OPTIONS}
                  onChange={(value) => onPrefChange('appearanceUiFontSize', Number(value))}
                />
              </AppearanceControlRow>
              <AppearanceControlRow title="代码字体大小" detail="调整代码和命令片段的基准大小。">
                <AppearanceSelectControl
                  value={String(prefs.appearanceCodeFontSize)}
                  options={CODE_FONT_SIZE_OPTIONS}
                  onChange={(value) => onPrefChange('appearanceCodeFontSize', Number(value))}
                />
              </AppearanceControlRow>
            </div>
          </section>

          <section className="appearance-config-card">
            <h3>界面选项</h3>
            <div className="appearance-config-list">
              <AppearanceControlRow title="半透明侧边栏" detail="开启后，侧栏更接近 macOS 轻量层级。">
                <Toggle
                  checked={prefs.appearanceTranslucentSidebar}
                  onChange={(value) => onPrefChange('appearanceTranslucentSidebar', value)}
                />
              </AppearanceControlRow>
              <AppearanceControlRow title="圆角强度" detail="调节卡片、按钮等元素的圆角大小。">
                <AppearanceRangeControl
                  min={4}
                  max={16}
                  value={prefs.appearanceCornerRadius}
                  suffix="px"
                  onChange={(value) => onPrefChange('appearanceCornerRadius', value)}
                />
              </AppearanceControlRow>
              <AppearanceControlRow title="对比度" detail="控制边框、阴影和背景层级。">
                <AppearanceRangeControl
                  min={20}
                  max={90}
                  value={prefs.appearanceContrast}
                  onChange={(value) => onPrefChange('appearanceContrast', value)}
                />
              </AppearanceControlRow>
              <AppearanceControlRow title="紧凑模式" detail="减少行高与面板留白，提高信息密度。">
                <Toggle
                  checked={prefs.appearanceCompactMode}
                  onChange={(value) => onPrefChange('appearanceCompactMode', value)}
                />
              </AppearanceControlRow>
              <AppearanceControlRow title="动画效果" detail="关闭后，界面切换和悬停动效会尽量减少。">
                <Toggle
                  checked={prefs.appearanceMotionEnabled}
                  onChange={(value) => onPrefChange('appearanceMotionEnabled', value)}
                />
              </AppearanceControlRow>
              <AppearanceControlRow title="字体平滑" detail="使用 macOS 原生字体抗锯齿。">
                <Toggle
                  checked={prefs.appearanceFontSmoothing}
                  onChange={(value) => onPrefChange('appearanceFontSmoothing', value)}
                />
              </AppearanceControlRow>
            </div>
          </section>
        </div>
      </div>
    </SettingsSection>
  )
}

const UI_FONT_OPTIONS = [
  {
    label: 'SF Pro Text',
    value: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ui-sans-serif, sans-serif'
  },
  { label: 'Avenir Next', value: '"Avenir Next", "PingFang SC", ui-sans-serif, sans-serif' },
  { label: 'PingFang SC', value: '"PingFang SC", -apple-system, BlinkMacSystemFont, ui-sans-serif, sans-serif' }
]

const CODE_FONT_OPTIONS = [
  {
    label: 'SF Mono',
    value: '"SFMono-Regular", "SF Mono", ui-monospace, "Cascadia Code", Menlo, Consolas, monospace'
  },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", "SFMono-Regular", ui-monospace, monospace' },
  { label: 'System Mono', value: 'ui-monospace, Menlo, Monaco, Consolas, monospace' }
]

const UI_FONT_SIZE_OPTIONS = [
  { label: '小', value: '13' },
  { label: '中（推荐）', value: '14' },
  { label: '大', value: '15' }
]

const CODE_FONT_SIZE_OPTIONS = [
  { label: '小', value: '11' },
  { label: '中（推荐）', value: '12' },
  { label: '大', value: '13' }
]

function AppearanceColorRow({
  title,
  detail,
  value,
  onChange
}: {
  title: string
  detail: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <AppearanceControlRow title={title} detail={detail}>
      <ColorControl value={value} onChange={onChange} />
    </AppearanceControlRow>
  )
}

function AppearanceControlRow({
  title,
  detail,
  children
}: {
  title: string
  detail: string
  children: ReactNode
}) {
  return (
    <div className="appearance-config-row">
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <div className="appearance-config-action">{children}</div>
    </div>
  )
}

function AppearanceSelectControl({
  value,
  options,
  onChange
}: {
  value: string
  options: Array<{ label: string; value: string }>
  onChange: (value: string) => void
}) {
  return (
    <select className="appearance-select-control" value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option value={option.value} key={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function AppearanceRangeControl({
  min,
  max,
  value,
  suffix = '',
  onChange
}: {
  min: number
  max: number
  value: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <div className="appearance-range-control">
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <span>{value}{suffix}</span>
    </div>
  )
}

export function ConversationSettingsSection({
  prefs,
  commandDraft,
  pathDraft,
  onCommandDraftChange,
  onPathDraftChange,
  onPrefChange
}: {
  prefs: SettingsPrefs
  commandDraft: string
  pathDraft: string
  onCommandDraftChange: (value: string) => void
  onPathDraftChange: (value: string) => void
  onPrefChange: PrefChange
}) {
  return (
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
            onChange={onCommandDraftChange}
            onAdd={() => {
              const nextCommand = commandDraft.trim()
              if (!nextCommand) return
              onPrefChange('commandWhitelist', prefs.commandWhitelist.includes(nextCommand) ? prefs.commandWhitelist : [...prefs.commandWhitelist, nextCommand])
              onCommandDraftChange('')
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
            onChange={onPathDraftChange}
            onAdd={() => {
              const nextPath = pathDraft.trim()
              if (!nextPath) return
              onPrefChange('externalPathRules', prefs.externalPathRules.includes(nextPath) ? prefs.externalPathRules : [...prefs.externalPathRules, nextPath])
              onPathDraftChange('')
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
  )
}

function ColorControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="appearance-color-control">
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label="选择颜色" />
      <span>{value.toUpperCase()}</span>
    </label>
  )
}

export function InfoSettingsSection({ title, items }: { title: string; items: Array<[string, string]> }) {
  return (
    <SettingsSection title={title}>
      <InfoGrid items={items} />
    </SettingsSection>
  )
}

export function RulesSettingsSection({
  prefs,
  ruleDraft,
  onRuleDraftChange,
  onAddRule,
  onPrefChange
}: {
  prefs: SettingsPrefs
  ruleDraft: string
  onRuleDraftChange: (value: string) => void
  onAddRule: (rule: string) => void
  onPrefChange: PrefChange
}) {
  return (
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
            onChange={onRuleDraftChange}
            onAdd={() => {
              onAddRule(ruleDraft)
              onRuleDraftChange('')
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
  )
}

export function AboutSettingsSection({
  hermesUpdate,
  hermesUpdateLoading,
  hermesUpdateError,
  hermesCompatibilityResult,
  hermesCompatibilityRunning,
  hermesCompatibilityError,
  hermesAutoUpdateResult,
  hermesAutoUpdating,
  hermesAutoUpdateError,
  onRefreshHermesUpdate,
  onRunHermesCompatibilityTest,
  onRunHermesAutoUpdate
}: {
  hermesUpdate: HermesUpdateStatus | null
  hermesUpdateLoading: boolean
  hermesUpdateError: string | null
  hermesCompatibilityResult: HermesCompatibilityTestResult | null
  hermesCompatibilityRunning: boolean
  hermesCompatibilityError: string | null
  hermesAutoUpdateResult: HermesAutoUpdateResult | null
  hermesAutoUpdating: boolean
  hermesAutoUpdateError: string | null
  onRefreshHermesUpdate: () => void
  onRunHermesCompatibilityTest: () => void
  onRunHermesAutoUpdate: () => void
}) {
  return (
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
  )
}

export function CloudRuntimeSettingsSection({
  runtime,
  dashboardStarting,
  dashboardError,
  onRefreshRuntime,
  onStartDashboard
}: {
  runtime: HermesRuntime | null
  dashboardStarting: boolean
  dashboardError: string | null
  onRefreshRuntime: () => void
  onStartDashboard: () => void
}) {
  const dashboard = runtime?.dashboard
  const dashboardReady = Boolean(dashboard?.available && dashboard.protectedApiReady)
  const dashboardStatus = dashboardReady ? '已连接' : dashboard?.running ? '需重新连接' : '未启动'

  return (
    <SettingsSection title="运行环境">
      <SettingsBlock title="Hermes 官方后台">
        <div className="runtime-dashboard-card">
          <div className="runtime-dashboard-head">
            <div>
              <strong>官方 Dashboard API</strong>
              <p>
                {dashboardReady
                  ? 'Cowork 已能读取 Hermes 官方状态、Skills、Cron 和工具集。'
                  : '启动后，Cowork 会用 Hermes 官方结构化状态校验后续页面。'}
              </p>
            </div>
            <span className={dashboardReady ? 'status-pill ok' : 'status-pill warn'}>{dashboardStatus}</span>
          </div>
          <InfoGrid
            items={[
              ['地址', dashboard?.baseUrl ?? '未连接'],
              ['Hermes 版本', dashboard?.version ?? '未知'],
              ['Gateway', dashboard?.gatewayState ?? '未知'],
              ['官方 API', dashboard?.protectedApiReady ? '可读取' : '不可读取'],
              ['配置版本', formatConfigVersion(dashboard?.configVersion, dashboard?.latestConfigVersion)],
              ['活动会话', dashboard?.activeSessions === undefined ? '未知' : `${dashboard.activeSessions} 个`]
            ]}
          />
          {dashboard?.error && <p className="runtime-dashboard-error">{dashboard.error}</p>}
          {dashboardError && <p className="runtime-dashboard-error">{dashboardError}</p>}
          <div className="runtime-dashboard-actions">
            <button className="settings-button" onClick={onRefreshRuntime}>刷新状态</button>
            <button className="settings-primary-button" disabled={dashboardStarting} onClick={onStartDashboard}>
              {dashboardStarting ? '启动中' : '启动 Hermes 后台'}
            </button>
          </div>
        </div>
      </SettingsBlock>
      <SettingsBlock title="Cowork 本机后端">
        <InfoGrid
          items={[
            ['运行范围', '本机'],
            ['后端', 'Hermes Cowork API'],
            ['任务通道', runtime?.bridgeMode ?? '未知']
          ]}
        />
      </SettingsBlock>
    </SettingsSection>
  )
}

export function RuntimeDiagnosticsSettingsSection({
  diagnostics,
  loading,
  error,
  onRefresh,
  onStartDashboard
}: {
  diagnostics: HermesDiagnosticsStatus | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onStartDashboard: () => void
}) {
  const status = diagnostics?.status ?? 'unavailable'
  const statusLabel = status === 'ok' ? '正常' : status === 'warn' ? '需要关注' : '未连接'
  const usage = diagnostics?.usage
  const taskHealth = diagnostics?.taskHealth
  return (
    <SettingsSection title="诊断">
      <SettingsBlock title="运行诊断">
        <div className="diagnostics-summary-card">
          <div>
            <strong>Hermes 后台状态</strong>
            <p>{diagnostics?.summary ?? '连接 Hermes 官方后台后，这里会显示最近使用、异常和下一步动作。'}</p>
          </div>
          <span className={status === 'ok' ? 'status-pill ok' : 'status-pill warn'}>{statusLabel}</span>
        </div>
        {error && <p className="runtime-dashboard-error">{error}</p>}
        <div className="diagnostics-actions">
          <button className="settings-button" disabled={loading} onClick={onRefresh}>
            {loading ? '刷新中' : '刷新诊断'}
          </button>
          <button className="settings-primary-button" disabled={loading} onClick={onStartDashboard}>
            启动后台并刷新
          </button>
        </div>
      </SettingsBlock>

      <SettingsBlock title="最近使用">
        <div className="diagnostics-metric-grid">
          <MetricCard label="会话" value={formatNumber(usage?.totalSessions)} />
          <MetricCard label="模型调用" value={formatNumber(usage?.totalApiCalls)} />
          <MetricCard label="Token" value={formatCompactNumber(usage?.totalTokens)} />
          <MetricCard label="预估费用" value={formatUsd(usage?.estimatedCostUsd)} />
        </div>
        <div className="diagnostics-model-list">
          {(usage?.topModels.length ? usage.topModels : []).map((model) => (
            <div key={model.model}>
              <strong>{model.model}</strong>
              <span>{formatNumber(model.sessions)} 个会话 · {formatCompactNumber(model.tokens)} tokens</span>
            </div>
          ))}
          {!usage?.topModels.length && <p className="diagnostics-empty">暂无模型使用记录。</p>}
        </div>
      </SettingsBlock>

      <SettingsBlock title="任务与工具">
        <div className="diagnostics-metric-grid">
          <MetricCard label="近期任务" value={formatNumber(taskHealth?.recentTasks)} />
          <MetricCard label="运行中" value={formatNumber(taskHealth?.runningTasks)} />
          <MetricCard label="失败任务" value={formatNumber(taskHealth?.failedTasks)} />
          <MetricCard label="需关注" value={formatNumber(taskHealth?.tasksWithIssues)} />
        </div>
        {taskHealth?.tools.length ? (
          <div className="diagnostics-tool-list">
            {taskHealth.tools.map((tool) => (
              <div key={tool.name}>
                <div>
                  <strong>{tool.name}</strong>
                  <span>{tool.calls} 次调用 · {tool.failures} 次失败 · {tool.failureRate}% 失败率{tool.averageMs !== undefined ? ` · 平均 ${formatDurationMs(tool.averageMs)}` : ''}</span>
                </div>
                {tool.lastError && <p>{tool.lastError}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="diagnostics-empty">暂无可统计的工具调用。任务开始通过 Cowork 执行后，这里会显示工具调用和失败率。</p>
        )}
        {taskHealth?.recentTaskIssues.length ? (
          <div className="diagnostics-task-issues">
            {taskHealth.recentTaskIssues.map((issue) => (
              <div key={issue.id}>
                <span>{formatTaskStatus(issue.status)}</span>
                <strong>{issue.title}</strong>
                <p>{issue.toolName ? `${issue.toolName}：${issue.message}` : issue.message}</p>
                {issue.hermesSessionId && <em>Session {issue.hermesSessionId}</em>}
              </div>
            ))}
          </div>
        ) : (
          <p className="diagnostics-empty">暂无可关联的任务异常。</p>
        )}
      </SettingsBlock>

      <SettingsBlock title="近期异常">
        <div className="diagnostics-log-files">
          {(diagnostics?.logHealth.files ?? []).map((file) => (
            <div key={file.id}>
              <strong>{file.label}</strong>
              <span>{file.status === 'unavailable' ? '不可读' : `${file.issueCount} 条异常`}</span>
            </div>
          ))}
          {!diagnostics?.logHealth.files.length && <p className="diagnostics-empty">暂无日志状态。</p>}
        </div>
        <div className="diagnostics-issue-list">
          {(diagnostics?.logHealth.recentIssues ?? []).map((issue) => (
            <div key={issue.id} className={`diagnostics-issue ${issue.level}`}>
              <span>{issue.level === 'error' ? '错误' : '警告'}</span>
              <p>{issue.message}</p>
            </div>
          ))}
          {!diagnostics?.logHealth.recentIssues.length && <p className="diagnostics-empty">没有发现近期错误日志。</p>}
        </div>
      </SettingsBlock>

      <SettingsBlock title="下一步">
        <div className="diagnostics-next-actions">
          {(diagnostics?.nextActions ?? ['先启动 Hermes 官方后台，然后刷新诊断。']).map((action) => (
            <div key={action}>{action}</div>
          ))}
        </div>
      </SettingsBlock>
    </SettingsSection>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="diagnostics-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatNumber(value?: number) {
  return new Intl.NumberFormat('zh-CN').format(value ?? 0)
}

function formatCompactNumber(value?: number) {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value ?? 0)
}

function formatUsd(value?: number) {
  return `$${(value ?? 0).toFixed(2)}`
}

function formatDurationMs(value: number) {
  if (value < 1000) return `${value}ms`
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`
  return `${Math.round(value / 60_000)}min`
}

function formatTaskStatus(status: HermesDiagnosticsStatus['taskHealth']['recentTaskIssues'][number]['status']) {
  if (status === 'running') return '运行中'
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '失败'
  if (status === 'stopped') return '已停止'
  return '等待'
}

function formatConfigVersion(current?: number, latest?: number) {
  if (current === undefined && latest === undefined) return '未知'
  if (current !== undefined && latest !== undefined) return `${current} / ${latest}`
  return String(current ?? latest)
}
