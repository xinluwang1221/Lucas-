import type { McpScope } from './mcp'

export type SettingsTab =
  | 'account'
  | 'general'
  | 'mcp'
  | 'models'
  | 'conversation'
  | 'external'
  | 'cloud'
  | 'commands'
  | 'rules'
  | 'about'

export type RulesScope = 'local' | 'cloud'

export type McpServer = {
  id: string
  name: string
  logo: string
  status: 'ready' | 'offline'
  enabled: boolean
}

export type SettingsPrefs = {
  linkOpenMode: string
  mcpScope: McpScope
  mcpServers: McpServer[]
  autoRunMcp: boolean
  commandRunMode: string
  commandWhitelist: string[]
  sandboxMode: string
  editExternalFilesMode: string
  externalPathRules: string[]
  browserAutomation: string
  terminalAutoOpen: string
  notifyBanner: boolean
  notifySound: boolean
  notifyMenu: boolean
  soundVolume: number
  multiThreadDownload: boolean
  maxDownloadRetries: number
  rulesScope: RulesScope
  includeAgentsMd: boolean
  includeClaudeMd: boolean
  rules: string[]
}

export const defaultSettingsPrefs: SettingsPrefs = {
  linkOpenMode: '始终询问',
  mcpScope: 'local',
  mcpServers: [
    { id: 'playwright', name: 'Playwright', logo: 'P', status: 'ready', enabled: true },
    { id: 'chrome-devtools', name: 'Chrome DevTools MCP', logo: 'C', status: 'ready', enabled: true },
    { id: 'apple-shortcuts', name: 'apple shortcuts', logo: '', status: 'ready', enabled: true },
    { id: 'lark-mcp', name: 'lark-mcp', logo: 'L', status: 'ready', enabled: true }
  ],
  autoRunMcp: true,
  commandRunMode: '沙箱运行（支持白名单）',
  commandWhitelist: [],
  sandboxMode: '打开配置',
  editExternalFilesMode: '使用白名单',
  externalPathRules: [],
  browserAutomation: '内置浏览器',
  terminalAutoOpen: '不打开',
  notifyBanner: true,
  notifySound: true,
  notifyMenu: true,
  soundVolume: 100,
  multiThreadDownload: false,
  maxDownloadRetries: 3,
  rulesScope: 'local',
  includeAgentsMd: true,
  includeClaudeMd: false,
  rules: []
}
