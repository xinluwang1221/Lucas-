import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="settings-section-content">
      <h2>{title}</h2>
      {children}
    </div>
  )
}

export function SettingsBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="settings-block">
      <h3>{title}</h3>
      <div className="settings-card">{children}</div>
    </div>
  )
}

export function SettingsControlRow({
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

export function SelectControl({
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

export function SettingsSubtabs({
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

export function InlineAddControl({
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

export function MusicIcon() {
  return <span className="music-note">♪</span>
}

export function Toggle({
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

export function InfoGrid({ items }: { items: Array<[string, string]> }) {
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
