import { useCallback, useEffect, useState } from 'react'
import {
  defaultSettingsPrefs,
  type SettingsPrefs
} from './settingsTypes'

const SETTINGS_PREFS_STORAGE_KEY = 'hermes-cowork.settingsPrefs.v1'
const LANGUAGE_STORAGE_KEY = 'hermes-cowork.language.v1'
const THEME_STORAGE_KEY = 'hermes-cowork.theme.v1'
const PRIVACY_STORAGE_KEY = 'hermes-cowork.privacyMode.v1'

const LEGACY_APPEARANCE_DEFAULTS: Partial<Record<keyof SettingsPrefs, string>> = {
  appearanceAccentColor: '#2f8f56',
  appearanceAccentStrongColor: '#1f7a43',
  appearanceBackgroundColor: '#fbfcfa',
  appearanceForegroundColor: '#171a16',
  appearanceMutedColor: '#606a5f'
}

function readStoredValue(key: string, fallback: string) {
  if (typeof window === 'undefined') return fallback
  try {
    return window.localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function writeStoredValue(key: string, value: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Local storage can be unavailable in restricted browser contexts.
  }
}

function readStoredSettingsPrefs(): SettingsPrefs {
  if (typeof window === 'undefined') return defaultSettingsPrefs
  try {
    const raw = window.localStorage.getItem(SETTINGS_PREFS_STORAGE_KEY)
    if (!raw) return defaultSettingsPrefs
    const parsed = JSON.parse(raw) as Partial<SettingsPrefs>
    const prefs = {
      ...defaultSettingsPrefs,
      ...parsed,
      commandWhitelist: Array.isArray(parsed.commandWhitelist) ? parsed.commandWhitelist : defaultSettingsPrefs.commandWhitelist,
      externalPathRules: Array.isArray(parsed.externalPathRules) ? parsed.externalPathRules : defaultSettingsPrefs.externalPathRules,
      mcpServers: Array.isArray(parsed.mcpServers) ? parsed.mcpServers : defaultSettingsPrefs.mcpServers,
      rules: Array.isArray(parsed.rules) ? parsed.rules : defaultSettingsPrefs.rules
    }
    for (const [key, legacyValue] of Object.entries(LEGACY_APPEARANCE_DEFAULTS) as Array<[keyof SettingsPrefs, string]>) {
      if (prefs[key] === legacyValue) {
        prefs[key] = defaultSettingsPrefs[key] as never
      }
    }
    return prefs
  } catch {
    return defaultSettingsPrefs
  }
}

function resolveThemeMode(theme: string) {
  if (theme === '暗色') return 'dark'
  if (theme === '跟随系统' && typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export function useSettingsPreferences() {
  const [language, setLanguageState] = useState(() => readStoredValue(LANGUAGE_STORAGE_KEY, '简体中文'))
  const [theme, setThemeState] = useState(() => readStoredValue(THEME_STORAGE_KEY, '亮色'))
  const [privacyMode, setPrivacyModeState] = useState(() => readStoredValue(PRIVACY_STORAGE_KEY, 'false') === 'true')
  const [settingsPrefs, setSettingsPrefs] = useState<SettingsPrefs>(() => readStoredSettingsPrefs())

  const setLanguage = useCallback((value: string) => {
    setLanguageState(value)
    writeStoredValue(LANGUAGE_STORAGE_KEY, value)
  }, [])

  const setTheme = useCallback((value: string) => {
    setThemeState(value)
    writeStoredValue(THEME_STORAGE_KEY, value)
  }, [])

  const setPrivacyMode = useCallback((value: boolean) => {
    setPrivacyModeState(value)
    writeStoredValue(PRIVACY_STORAGE_KEY, String(value))
  }, [])

  const updateSettingsPref = useCallback(<K extends keyof SettingsPrefs>(key: K, value: SettingsPrefs[K]) => {
    setSettingsPrefs((current) => ({ ...current, [key]: value }))
  }, [])

  const handleAddSettingsRule = useCallback((rule: string) => {
    const nextRule = rule.trim()
    if (!nextRule) return
    setSettingsPrefs((current) => ({
      ...current,
      rules: current.rules.includes(nextRule) ? current.rules : [...current.rules, nextRule]
    }))
  }, [])

  useEffect(() => {
    writeStoredValue(SETTINGS_PREFS_STORAGE_KEY, JSON.stringify(settingsPrefs))
  }, [settingsPrefs])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const root = document.documentElement
    const applyAppearance = () => {
      const mode = resolveThemeMode(theme)
      root.dataset.themeMode = mode
      root.dataset.sidebarTranslucent = settingsPrefs.appearanceTranslucentSidebar ? 'true' : 'false'
      root.dataset.fontSmoothing = settingsPrefs.appearanceFontSmoothing ? 'true' : 'false'
      root.dataset.compactMode = settingsPrefs.appearanceCompactMode ? 'true' : 'false'
      root.dataset.motionEnabled = settingsPrefs.appearanceMotionEnabled ? 'true' : 'false'
      root.style.setProperty('--accent', settingsPrefs.appearanceAccentColor)
      root.style.setProperty('--accent-strong', settingsPrefs.appearanceAccentStrongColor)
      if (mode === 'dark') {
        root.style.removeProperty('--background')
        root.style.removeProperty('--surface')
        root.style.removeProperty('--foreground')
        root.style.removeProperty('--muted')
      } else {
        root.style.setProperty('--background', settingsPrefs.appearanceBackgroundColor)
        root.style.setProperty('--surface', settingsPrefs.appearanceSurfaceColor)
        root.style.setProperty('--foreground', settingsPrefs.appearanceForegroundColor)
        root.style.setProperty('--muted', settingsPrefs.appearanceMutedColor)
      }
      root.style.setProperty('--font-ui', settingsPrefs.appearanceUiFont)
      root.style.setProperty('--font-code', settingsPrefs.appearanceCodeFont)
      root.style.setProperty('--ui-font-size', `${settingsPrefs.appearanceUiFontSize}px`)
      root.style.setProperty('--code-font-size', `${settingsPrefs.appearanceCodeFontSize}px`)
      root.style.setProperty('--theme-contrast', String(settingsPrefs.appearanceContrast))
      root.style.setProperty('--radius-card', `${settingsPrefs.appearanceCornerRadius}px`)
      root.style.setProperty('--radius-panel', `${settingsPrefs.appearanceCornerRadius}px`)
      root.style.setProperty('--radius-control', `${Math.max(4, settingsPrefs.appearanceCornerRadius - 1)}px`)
    }

    applyAppearance()

    if (theme !== '跟随系统' || typeof window === 'undefined') return undefined
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', applyAppearance)
    return () => mediaQuery.removeEventListener('change', applyAppearance)
  }, [settingsPrefs, theme])

  return {
    language,
    setLanguage,
    theme,
    setTheme,
    privacyMode,
    setPrivacyMode,
    settingsPrefs,
    updateSettingsPref,
    handleAddSettingsRule
  }
}
