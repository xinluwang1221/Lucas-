import { useCallback, useState } from 'react'
import {
  defaultSettingsPrefs,
  type SettingsPrefs
} from './settingsTypes'

export function useSettingsPreferences() {
  const [language, setLanguage] = useState('简体中文')
  const [theme, setTheme] = useState('亮色')
  const [privacyMode, setPrivacyMode] = useState(false)
  const [settingsPrefs, setSettingsPrefs] = useState<SettingsPrefs>(defaultSettingsPrefs)

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
