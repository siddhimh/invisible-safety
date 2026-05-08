
const DEPTH_BANDS = [
  {
    id: 'above',
    label: 'Above',
    sub: 'Buildings',
    swatch: '#94a3b8',
    note: 'Real Mapbox footprints tower around the camera.',
  },
  {
    id: 'eye',
    label: 'Eye level',
    sub: '311 · crashes · hotspot rings',
    swatch: 'linear-gradient(90deg,#ef4444,#3b82f6,#f59e0b)',
    note: 'Incident dots and ring markers sit at the horizon line.',
  },
  {
    id: 'floor',
    label: 'Floor',
    sub: 'Urban Risk grid',
    swatch: 'linear-gradient(90deg,#ffffcc,#fed976,#feb24c,#fd8d3c,#bd0026)',
    note: 'The composite risk choropleth is the colored ground.',
  },
  {
    id: 'subsurface',
    label: 'Subsurface',
    sub: 'Sewer trunk lines · CSOs',
    swatch: '#00e676',
    note: 'Trunk lines run along the street and discharge at outfalls.',
  },
]

export function StreetViewGuide({ onResetCamera }) {
  return (
    <div className="street-panel">
      <div className="street-header">
        <span className="street-title">Street View</span>
      </div>

      <ul className="street-bands">
        {DEPTH_BANDS.map((b) => (
          <li key={b.id} className="street-band">
            <span
              className="street-band-swatch"
              style={{ background: b.swatch }}
              aria-hidden="true"
            />
            <span className="street-band-text">
              <span className="street-band-label">
                {b.label}
                <span className="street-band-sub">{b.sub}</span>
              </span>
              <span className="street-band-note">{b.note}</span>
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="street-reset"
        onClick={onResetCamera}
        title="Fly back to the curated street-level vantage point"
      >
        Reset camera
      </button>
    </div>
  )
}
