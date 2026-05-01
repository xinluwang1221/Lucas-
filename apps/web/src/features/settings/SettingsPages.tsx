import { FileText, LogOut, Play } from 'lucide-react'
import type {
  HermesAutoUpdateResult,
  HermesCompatibilityTestResult,
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

      <SettingsBlock title="浅色主题">
        <SettingsControlRow title="强调色" detail="用于主按钮、进度、选中态和关键状态。">
          <ColorControl
            value={prefs.appearanceAccentColor}
            onChange={(value) => onPrefChange('appearanceAccentColor', value)}
          />
        </SettingsControlRow>
        <SettingsControlRow title="背景" detail="应用最底层背景色。">
          <ColorControl
            value={prefs.appearanceBackgroundColor}
            onChange={(value) => onPrefChange('appearanceBackgroundColor', value)}
          />
        </SettingsControlRow>
        <SettingsControlRow title="前景" detail="主要文字颜色。">
          <ColorControl
            value={prefs.appearanceForegroundColor}
            onChange={(value) => onPrefChange('appearanceForegroundColor', value)}
          />
        </SettingsControlRow>
        <SettingsControlRow title="UI 字体" detail="全局界面字体栈。">
          <SelectControl
            value={prefs.appearanceUiFont}
            options={[
              '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ui-sans-serif, sans-serif',
              '"Avenir Next", "PingFang SC", ui-sans-serif, sans-serif',
              '"Inter", "PingFang SC", ui-sans-serif, sans-serif'
            ]}
            onChange={(value) => onPrefChange('appearanceUiFont', value)}
          />
        </SettingsControlRow>
        <SettingsControlRow title="代码字体" detail="代码块、路径和命令使用的字体。">
          <SelectControl
            value={prefs.appearanceCodeFont}
            options={[
              '"SFMono-Regular", "SF Mono", ui-monospace, "Cascadia Code", Menlo, Consolas, monospace',
              '"JetBrains Mono", "SFMono-Regular", ui-monospace, monospace',
              'ui-monospace, Menlo, Monaco, Consolas, monospace'
            ]}
            onChange={(value) => onPrefChange('appearanceCodeFont', value)}
          />
        </SettingsControlRow>
        <SettingsControlRow title="半透明侧边栏" detail="让侧栏和主工作区的层级更轻。">
          <Toggle
            checked={prefs.appearanceTranslucentSidebar}
            onChange={(value) => onPrefChange('appearanceTranslucentSidebar', value)}
          />
        </SettingsControlRow>
        <SettingsControlRow title="对比度" detail="用于后续进一步控制边框、阴影和背景层级。">
          <div className="settings-range-control">
            <input
              type="range"
              min={20}
              max={90}
              value={prefs.appearanceContrast}
              onChange={(event) => onPrefChange('appearanceContrast', Number(event.target.value))}
            />
            <span>{prefs.appearanceContrast}</span>
          </div>
        </SettingsControlRow>
      </SettingsBlock>

      <SettingsBlock title="字体">
        <SettingsControlRow title="UI 字号" detail="正文基准字号，标题和说明会按层级自动推导。">
          <NumberControl
            value={prefs.appearanceUiFontSize}
            min={12}
            max={18}
            onChange={(value) => onPrefChange('appearanceUiFontSize', value)}
          />
        </SettingsControlRow>
        <SettingsControlRow title="代码字体大小" detail="代码块和命令片段的基准字号。">
          <NumberControl
            value={prefs.appearanceCodeFontSize}
            min={11}
            max={16}
            onChange={(value) => onPrefChange('appearanceCodeFontSize', value)}
          />
        </SettingsControlRow>
        <SettingsControlRow title="字体平滑" detail="使用 macOS 原生字体抗锯齿。">
          <Toggle
            checked={prefs.appearanceFontSmoothing}
            onChange={(value) => onPrefChange('appearanceFontSmoothing', value)}
          />
        </SettingsControlRow>
      </SettingsBlock>
    </SettingsSection>
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

function NumberControl({
  value,
  min,
  max,
  onChange
}: {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="settings-number-with-unit">
      <input
        className="settings-number-input"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span>px</span>
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

export function CloudRuntimeSettingsSection({ runtime }: { runtime: HermesRuntime | null }) {
  return (
    <InfoSettingsSection
      title="云端运行环境"
      items={[
        ['运行范围', '本机'],
        ['后端', 'Hermes Cowork API'],
        ['Hermes', runtime?.bridgeMode ?? '未知']
      ]}
    />
  )
}
