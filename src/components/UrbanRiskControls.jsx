const FACTORS = [
  { id: 'crime', label: 'Crime', color: '#ef4444' },
  { id: 'crash', label: 'Crashes', color: '#ec4899' },
  { id: 'complaint', label: '311 complaints', color: '#3b82f6' },
  { id: 'infra', label: 'CSO proximity', color: '#1d9e75' },
]

const DEFAULT_WEIGHTS = { crime: 25, crash: 25, complaint: 25, infra: 25 }

// Same renormalization rule as `useUrbanRisk` (absolute scale irrelevant).
function normalizedWeights(weights) {
  const wRaw = {
    crime: Math.max(0, weights?.crime ?? 0),
    crash: Math.max(0, weights?.crash ?? 0),
    complaint: Math.max(0, weights?.complaint ?? 0),
    infra: Math.max(0, weights?.infra ?? 0),
  }
  const sum =
    wRaw.crime + wRaw.crash + wRaw.complaint + wRaw.infra
  if (sum <= 0)
    return { crime: 0, crash: 0, complaint: 0, infra: 0 }
  return {
    crime: wRaw.crime / sum,
    crash: wRaw.crash / sum,
    complaint: wRaw.complaint / sum,
    infra: wRaw.infra / sum,
  }
}

function SelectedCellPanel({ cell, weights, onClear }) {
  const p = cell?.properties ?? {}
  const w = normalizedWeights(weights)
  const fmtPct = (v) => `${Math.round((v ?? 0) * 100)}%`
  const risk = Number(p.risk ?? 0)

  const rows = [
    {
      id: 'crime',
      label: 'Crime',
      norm: p.crimeNorm ?? 0,
      raw: p.crimeCount ?? 0,
    },
    {
      id: 'crash',
      label: 'Crashes',
      norm: p.crashNorm ?? 0,
      raw: p.crashCount ?? 0,
    },
    {
      id: 'complaint',
      label: '311 reports',
      norm: p.complaintNorm ?? 0,
      raw: p.complaintCount ?? 0,
    },
    {
      id: 'infra',
      label: 'CSO proximity',
      norm: p.infraNorm ?? 0,
      raw: `${(p.csoDistKm ?? 0).toFixed(2)} km`,
    },
  ]

  const withContrib = rows.map((r) => ({
    ...r,
    contribution: w[r.id] * r.norm,
  }))

  const dominant = withContrib.reduce((best, cur) =>
    cur.contribution > best.contribution ? cur : best,
  withContrib[0])

  const domSharePct =
    risk > 0 ? Math.round((dominant.contribution / risk) * 100) : null

  return (
    <div className="risk-selected-cell">
      <div className="risk-selected-header">
        <span className="risk-selected-title">Selected cell</span>
        <span className="risk-selected-risk">{fmtPct(risk)}</span>
        <button
          type="button"
          className="risk-selected-clear"
          onClick={onClear}
          aria-label="Clear cell selection"
          title="Clear selection"
        >
          ×
        </button>
      </div>

      <div className="risk-dominant">
        <span className="risk-dominant-label">Dominant factor</span>
        <span className="risk-dominant-value">{dominant.label}</span>
        {domSharePct != null && (
          <span className="risk-dominant-share">
            {domSharePct}% of this cell&apos;s score
          </span>
        )}
      </div>

      <div className="risk-breakdown-title">Component breakdown</div>
      <ul className="risk-breakdown-list" aria-label="Component breakdown">
        <li className="risk-breakdown-head" aria-hidden="true">
          <span>Factor</span>
          <span>Raw</span>
          <span>Percentage</span>
        </li>
        {withContrib.map((r) => (
          <li key={r.id} className="risk-breakdown-row">
            <span className="risk-breakdown-factor">{r.label}</span>
            <span className="risk-breakdown-raw">{r.raw}</span>
            <span className="risk-breakdown-pct">
              {risk > 0
                ? `${Math.round((r.contribution / risk) * 100)}%`
                : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function UrbanRiskControls({
  weights,
  onChange,
  onReset,
  selectedCell,
  onClearSelection,
}) {
  const total =
    (weights.crime || 0) +
    (weights.crash || 0) +
    (weights.complaint || 0) +
    (weights.infra || 0)

  return (
    <div className="risk-panel risk-panel--compact">
      <div className="risk-header">
        <span className="risk-title">Urban Risk Index</span>
        <button
          type="button"
          className="risk-reset"
          onClick={() => onReset?.(DEFAULT_WEIGHTS)}
          title="Reset to even weights"
        >
          Reset
        </button>
      </div>

      <div className="risk-sliders">
        {FACTORS.map((f) => {
          const v = weights[f.id] ?? 0
          const share = total > 0 ? Math.round((v / total) * 100) : 0
          return (
            <label key={f.id} className="risk-slider">
              <span className="risk-slider-label">
                <span
                  className="risk-slider-dot"
                  style={{ background: f.color }}
                />
                {f.label}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={v}
                onChange={(e) =>
                  onChange({ ...weights, [f.id]: Number(e.target.value) })
                }
                style={{ accentColor: f.color }}
              />
              <span className="risk-slider-value">{share}%</span>
            </label>
          )
        })}
      </div>

      {selectedCell ? (
        <SelectedCellPanel
          cell={selectedCell}
          weights={weights}
          onClear={onClearSelection}
        />
      ) : (
        <p className="risk-cell-placeholder">
          Click grid cell to see the risk score.
        </p>
      )}
    </div>
  )
}

export { DEFAULT_WEIGHTS }
