import { useState } from 'react'
export function LayerLegend({ layerMeta, visibility, onToggle, mode, modes }) {
  const [collapsed, setCollapsed] = useState(false)
  const activeMode = modes.find((m) => m.id === mode)
  const relevantLayers = activeMode
    ? layerMeta.filter((m) => activeMode.layers.has(m.id))
    : layerMeta

  const onCount = relevantLayers.filter((m) => visibility[m.id]).length

  return (
    <aside
      className={`map-card map-card-right${collapsed ? ' is-collapsed' : ''}`}
    >
      <button
        type="button"
        className="legend-toggle"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-controls="layer-legend-list"
        title={collapsed ? 'Expand layers' : 'Collapse layers'}
      >
        <span className="legend-toggle-title">Layers</span>
        <span className="legend-toggle-meta">
          {onCount} / {relevantLayers.length}
        </span>
        <span className="legend-chevron" aria-hidden="true">
          {collapsed ? '▴' : '▾'}
        </span>
      </button>

      {!collapsed && (
        <ul id="layer-legend-list" className="legend-list">
          {relevantLayers.map((m) => {
            const swatch = m.swatchByMode?.[mode] ?? m.swatch
            return (
              <li key={m.id} className="legend-row">
                <label>
                  <input
                    type="checkbox"
                    checked={visibility[m.id] ?? false}
                    onChange={() => onToggle(m.id)}
                  />
                  <span
                    className="legend-swatch"
                    style={{ background: swatch }}
                  />
                  <span className="legend-label">{m.label}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
