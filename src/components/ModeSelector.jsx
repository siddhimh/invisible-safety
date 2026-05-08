import { Dropdown } from './Dropdown'

export function ModeSelector({ modes, value, onChange }) {
  const options = modes.map((m) => ({ value: m.id, label: m.label }))

  return (
    <div className="top-bar-card mode-selector">
      <span className="mode-selector-label">Mode</span>
      <Dropdown
        value={value}
        options={options}
        onChange={onChange}
        ariaLabel="Analysis mode"
        align="stretch"
      />
    </div>
  )
}
