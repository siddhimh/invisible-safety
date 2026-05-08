const TYPE_COLORS = {
  Sewer: '#d46e6e',
  'Water System': '#789cd2',
  'Street Condition': '#d8a864',
  Other: '#9ca3af',
}

function formatNumber(n) {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return n.toFixed(n >= 10 ? 0 : 1)
}

function formatEnrichment(e) {
  if (e == null || !Number.isFinite(e)) return '—'
  if (e >= 100) return `${e.toFixed(0)}×`
  if (e >= 10) return `${e.toFixed(1)}×`
  return `${e.toFixed(2)}×`
}

function SelectedComplaint({
  feature,
  corridorReady,
  inCorridor,
  onClear,
}) {
  const p = feature.properties ?? {}
  const rows = []
  if (p.descriptor) rows.push({ label: 'Descriptor', value: p.descriptor })
  rows.push({ label: 'Date', value: p.date ?? '—' })
  rows.push({ label: 'Status', value: p.status ?? 'unknown' })

  return (
    <div className="proximity-selected surface-selected">
      <div className="surface-selected-header">
        <span className="surface-selected-kicker">311 report</span>
        <span className="surface-selected-title">{p.type ?? 'Complaint'}</span>
        <button
          type="button"
          className="surface-selected-clear"
          onClick={onClear}
          aria-label="Clear complaint selection"
          title="Clear selection"
        >
          ×
        </button>
      </div>
      {corridorReady && (
        <div
          className={`proximity-corridor-pill${inCorridor ? ' proximity-corridor-pill--in' : ''}`}
        >
          {inCorridor ? 'Inside pipe corridor' : 'Outside pipe corridor'}
        </div>
      )}
      <ul className="surface-detail-list">
        {rows.map((r) => (
          <li key={r.label} className="surface-detail-row">
            <span className="surface-detail-label">{r.label}</span>
            <span className="surface-detail-value">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ProximityStats({
  stats,
  loading,
  complaintSelection,
  proximityInsideSet,
  onClearComplaintSelection,
}) {
  const showComplaint =
    complaintSelection?.layerId === '311-complaints' && complaintSelection.object

  if (loading) {
    return (
      <div className="proximity-panel">
        <div className="proximity-header">
          <span className="proximity-title">Pipe proximity</span>
        </div>
        <div className="proximity-loading">Buffering trunk lines…</div>
        {showComplaint && (
          <SelectedComplaint
            feature={complaintSelection.object}
            corridorReady={false}
            inCorridor={false}
            onClear={onClearComplaintSelection}
          />
        )}
      </div>
    )
  }
  if (!stats) return null

  const inCorridor = showComplaint
    ? proximityInsideSet.has(complaintSelection.object)
    : false

  const maxBarEnrichment = Math.max(
    1,
    ...stats.typeBreakdown.map((t) =>
      Number.isFinite(t.enrichment) ? t.enrichment : 0,
    ),
  )

  return (
    <div className="proximity-panel">
      <div className="proximity-header">
        <span className="proximity-title">Pipe proximity</span>
        <span className="proximity-radius">{stats.bufferMeters} m corridor</span>
      </div>

      <div className="proximity-metrics">
        <div className="proximity-metric">
          <div className="proximity-metric-label">Nearby complaint density</div>
          <div className="proximity-metric-value">
            {formatNumber(stats.densityIn)}
            <span className="proximity-metric-unit">/ km²</span>
          </div>
          <div className="proximity-metric-sub">
            {formatNumber(stats.totalIn)} reports inside the corridor
          </div>
        </div>

        <div className="proximity-metric proximity-metric-influence">
          <div className="proximity-metric-label">Infrastructure influence</div>
          <div className="proximity-metric-value">
            {formatEnrichment(stats.overallEnrichment)}
          </div>
        </div>
      </div>

      {stats.typeBreakdown.length > 0 && (
        <div className="proximity-types">
          <div className="proximity-types-header">By complaint type</div>
          <ul className="proximity-types-list">
            {stats.typeBreakdown.map((t) => {
              const color = TYPE_COLORS[t.type] ?? TYPE_COLORS.Other
              const barFrac = Number.isFinite(t.enrichment)
                ? Math.min(1, t.enrichment / maxBarEnrichment)
                : 1
              return (
                <li key={t.type} className="proximity-type-row">
                  <span className="proximity-type-name">
                    <span
                      className="proximity-type-dot"
                      style={{ background: color }}
                    />
                    {t.type}
                  </span>
                  <span className="proximity-type-bar-track">
                    <span
                      className="proximity-type-bar-fill"
                      style={{
                        width: `${barFrac * 100}%`,
                        background: color,
                      }}
                    />
                  </span>
                  <span className="proximity-type-enrichment">
                    {formatEnrichment(t.enrichment)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {showComplaint && (
        <SelectedComplaint
          feature={complaintSelection.object}
          corridorReady
          inCorridor={inCorridor}
          onClear={onClearComplaintSelection}
        />
      )}
    </div>
  )
}
