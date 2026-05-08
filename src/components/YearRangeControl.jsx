import { Dropdown } from './Dropdown'

export function YearRangeControl({ bounds, value, onChange }) {
  if (!bounds || !value) return null

  const [minY, maxY] = bounds
  const [from, to] = value
  const options = []
  for (let y = minY; y <= maxY; y++) options.push({ value: y, label: String(y) })

  return (
    <div
      className="top-bar-card year-range"
      role="group"
      aria-label="Year range filter"
    >
      <span className="year-range-label">Years</span>
      <div className="year-range-values">
        <Dropdown
          value={from}
          options={options}
          onChange={(v) => onChange([Math.min(v, to), to])}
          ariaLabel="From year"
          align="start"
          minWidth={88}
        />
        <Dropdown
          value={to}
          options={options}
          onChange={(v) => onChange([from, Math.max(v, from)])}
          ariaLabel="To year"
          align="end"
          minWidth={88}
        />
      </div>
    </div>
  )
}
