const FACTOR_LABELS = {
  crime: 'Crime',
  crash: 'Crashes',
  complaint: '311 reports',
}

const FACTOR_ACCENT = {
  crime: '#bd0026',
  crash: '#ec4899',
  complaint: '#f59e0b',
}

function formatCount(n) {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString()
}

function StatCell({ label, value, sub, accent }) {
  return (
    <div className={`surface-stat${accent ? ' surface-stat--accent' : ''}`}>
      <div className="surface-stat-label">{label}</div>
      <div className="surface-stat-value">{value}</div>
      {sub && <div className="surface-stat-sub">{sub}</div>}
    </div>
  )
}

function CityOverview({ cityStats }) {
  if (!cityStats) {
    return <p className="surface-loading">Loading surface signals…</p>
  }
  const fatal = cityStats.crashFatal
  return (
    <>
      <div className="surface-stats-grid">
        <StatCell
          label="Crashes"
          value={formatCount(cityStats.crashCount)}
          sub={
            fatal > 0
              ? `${formatCount(fatal)} fatal · ${formatCount(cityStats.crashInjured)} injury`
              : `${formatCount(cityStats.crashInjured)} injury`
          }
          accent={fatal > 0}
        />
        <StatCell
          label="Crime"
          value={formatCount(cityStats.crimeCount)}
        />
        <StatCell
          label="311 reports"
          value={formatCount(cityStats.complaintCount)}
        />
      </div>
      <p className="surface-hint">
        Click a hotspot ring for the local risk breakdown.
      </p>
    </>
  )
}
function FactorBars({ rows, total }) {
  if (!total) return null
  return (
    <ul className="surface-bars" aria-label="Local risk breakdown">
      {rows.map((r) => {
        const pct = total > 0 ? Math.round((r.count / total) * 100) : 0
        return (
          <li key={r.id} className="surface-bar-row">
            <span className="surface-bar-label">{r.label}</span>
            <span className="surface-bar-track">
              <span
                className="surface-bar-fill"
                style={{
                  width: `${pct}%`,
                  background: FACTOR_ACCENT[r.id] ?? '#94a3b8',
                }}
              />
            </span>
            <span className="surface-bar-count">{formatCount(r.count)}</span>
            <span className="surface-bar-pct">{pct}%</span>
          </li>
        )
      })}
    </ul>
  )
}

function HotspotDetail({ feature, onClear }) {
  const p = feature.properties ?? {}
  const total = p.totalEvents ?? 0
  const dominant = p.dominant ?? 'crime'
  const dominantLabel = FACTOR_LABELS[dominant] ?? '—'

  const breakdown = [
    { id: 'crime', label: 'Crime', count: p.crimeCount ?? 0 },
    { id: 'crash', label: 'Crashes', count: p.crashCount ?? 0 },
    { id: 'complaint', label: '311 reports', count: p.complaintCount ?? 0 },
  ]

  const fatal = p.crashFatal ?? 0
  const injured = p.crashInjured ?? 0
  const property = p.crashProperty ?? 0

  return (
    <div className="surface-selected">
      <div className="surface-selected-header">
        <span className="surface-selected-kicker">Hotspot</span>
        <span className="surface-selected-title">#{p.rank ?? '—'}</span>
        <button
          type="button"
          className="surface-selected-clear"
          onClick={onClear}
          aria-label="Clear hotspot selection"
          title="Clear selection"
        >
          ×
        </button>
      </div>

      <div className="surface-dominant">
        <span className="surface-dominant-label">Dominant surface risk</span>
        <span className="surface-dominant-value">{dominantLabel}</span>
        <span className="surface-dominant-meta">
          {formatCount(total)} events in ~{((p.cellSizeKm ?? 0.4) * 1000).toFixed(0)} m cell
        </span>
      </div>

      <div className="surface-section-title">Crash · crime · 311 breakdown</div>
      <FactorBars rows={breakdown} total={total} />

      <div className="surface-section-title">Severity summary</div>
      <ul className="surface-severity">
        <li
          className={`surface-severity-row${fatal > 0 ? ' surface-severity-row--fatal' : ''}`}
        >
          <span className="surface-severity-label">Fatal crashes</span>
          <span className="surface-severity-value">{formatCount(fatal)}</span>
        </li>
        <li className="surface-severity-row">
          <span className="surface-severity-label">Injury crashes</span>
          <span className="surface-severity-value">{formatCount(injured)}</span>
        </li>
        <li className="surface-severity-row">
          <span className="surface-severity-label">Other crashes</span>
          <span className="surface-severity-value">{formatCount(property)}</span>
        </li>
      </ul>
    </div>
  )
}

function FeatureDetail({ kicker, title, rows, onClear }) {
  return (
    <div className="surface-selected">
      <div className="surface-selected-header">
        <span className="surface-selected-kicker">{kicker}</span>
        <span className="surface-selected-title">{title}</span>
        <button
          type="button"
          className="surface-selected-clear"
          onClick={onClear}
          aria-label="Clear selection"
          title="Clear selection"
        >
          ×
        </button>
      </div>

      <ul className="surface-detail-list">
        {rows.map((r) => (
          <li
            key={r.label}
            className={`surface-detail-row${r.accent ? ' surface-detail-row--accent' : ''}`}
          >
            <span className="surface-detail-label">{r.label}</span>
            <span className="surface-detail-value">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CrashDetail({ feature, onClear }) {
  const p = feature.properties ?? {}
  const killed = Number(p.killed ?? 0)
  const injured = Number(p.injured ?? 0)
  const titleHead =
    killed > 0
      ? `${formatCount(killed)} killed`
      : injured > 0
        ? `${formatCount(injured)} injured`
        : 'No casualties'

  const rows = [
    { label: 'Date', value: p.date ?? '—' },
    { label: 'Factor', value: p.factor ?? 'unknown' },
    { label: 'Injured', value: formatCount(injured) },
    { label: 'Killed', value: formatCount(killed), accent: killed > 0 },
  ]
  return (
    <FeatureDetail
      kicker="Crash"
      title={titleHead}
      rows={rows}
      onClear={onClear}
    />
  )
}

function ComplaintDetail({ feature, onClear }) {
  const p = feature.properties ?? {}
  const rows = []
  if (p.descriptor) rows.push({ label: 'Descriptor', value: p.descriptor })
  rows.push({ label: 'Date', value: p.date ?? '—' })
  rows.push({ label: 'Status', value: p.status ?? 'unknown' })
  return (
    <FeatureDetail
      kicker="311 report"
      title={p.type ?? 'Complaint'}
      rows={rows}
      onClear={onClear}
    />
  )
}

export function SurfaceRiskInspector({
  cityStats,
  selection,
  onClear,
}) {
  const layerId = selection?.layerId
  const feature = selection?.object

  let body
  if (feature && layerId === 'surface-hotspots') {
    body = <HotspotDetail feature={feature} onClear={onClear} />
  } else if (feature && layerId === 'collisions') {
    body = <CrashDetail feature={feature} onClear={onClear} />
  } else if (feature && layerId === '311-complaints') {
    body = <ComplaintDetail feature={feature} onClear={onClear} />
  } else {
    body = <CityOverview cityStats={cityStats} />
  }

  return (
    <div className="surface-panel">
      <div className="surface-header">
        <span className="surface-title">Surface Risk</span>
        <span className="surface-subtitle">Street-level signals</span>
      </div>
      {body}
    </div>
  )
}
