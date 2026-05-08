function formatKm(km) {
  if (!Number.isFinite(km)) return '—'
  if (km >= 100) return `${km.toFixed(0)} km`
  if (km >= 10) return `${km.toFixed(1)} km`
  return `${km.toFixed(2)} km`
}

function formatCount(n) {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString()
}

const TYPE_INFO = {
  interceptors: {
    title: 'Trunk-line segment',
    type: 'Sewer interceptor / force main',
  },
  'cso-locations': {
    title: 'CSO outfall',
    type: 'Combined sewer overflow point',
  },
  sewersheds: {
    title: 'Sewershed',
    type: 'Drainage basin boundary',
  },
}

function StatCell({ label, value, sub }) {
  return (
    <div className="infra-stat">
      <div className="infra-stat-label">{label}</div>
      <div className="infra-stat-value">{value}</div>
      {sub && <div className="infra-stat-sub">{sub}</div>}
    </div>
  )
}

function NetworkOverview({ cityStats }) {
  if (!cityStats) {
    return (
      <p className="infra-loading">Loading interceptor network…</p>
    )
  }
  return (
    <>
      <div className="infra-stats-grid">
        <StatCell
          label="Trunk lines"
          value={formatKm(cityStats.totalLengthKm)}
          sub={`${formatCount(cityStats.segmentCount)} segments`}
        />
        <StatCell
          label="CSO outfalls"
          value={formatCount(cityStats.outfallCount)}
          sub={`${formatCount(cityStats.receivingWaterCount)} receiving waters`}
        />
      </div>
      <p className="infra-hint">
        Click a line or outfall for details · Hover to highlight
        connected systems.
      </p>
    </>
  )
}

function SelectedSegmentDetail({
  selection,
  derived,
  csoFeatures,
  onClear,
}) {
  const info = TYPE_INFO[selection.layerId]
  if (!info) return null

  const p = selection.object?.properties ?? {}

  let nearbyCount = null
  if (selection.layerId === 'cso-locations' && derived?.complaintsNearCso) {
    nearbyCount = derived.complaintsNearCso.get(selection.object) ?? 0
  } else if (selection.layerId === 'interceptors' && derived?.complaintsNearInterceptor) {
    if (typeof selection.featureIndex === 'number') {
      nearbyCount =
        derived.complaintsNearInterceptor.get(selection.featureIndex) ?? 0
    }
  }
  const extras = []
  if (selection.layerId === 'cso-locations') {
    if (p.spdes) extras.push({ label: 'SPDES', value: p.spdes })
    if (p.Waterbody) extras.push({ label: 'Waterbody', value: p.Waterbody })
    if (p.Waterbod_1)
      extras.push({ label: 'Receives', value: p.Waterbod_1 })
  }
  if (selection.layerId === 'interceptors' && derived) {
    const idx = selection.featureIndex
    if (typeof idx === 'number') {
      const km = (derived.segmentLengths?.[idx] ?? 0) / 1000
      extras.push({ label: 'Length', value: formatKm(km) })
      const connected = derived.interceptorToCsos?.get(idx)
      if (connected && connected.size > 0) {
        extras.push({
          label: 'Outfalls within 600 m',
          value: formatCount(connected.size),
        })
      }
    }
  }
  if (selection.layerId === 'sewersheds') {
    const name = p.Name ?? p.name ?? p.SHED_ID ?? p.WPCP ?? null
    if (name) extras.push({ label: 'Basin', value: String(name) })
    if (p.WPCP && p.WPCP !== name)
      extras.push({ label: 'Plant', value: p.WPCP })
  }
  const cityStats = derived?.cityStats

  return (
    <>
      <div className="infra-selected">
        <div className="infra-selected-header">
          <span className="infra-selected-kicker">Selected</span>
          <span className="infra-selected-title">{info.title}</span>
          <button
            type="button"
            className="infra-selected-clear"
            onClick={onClear}
            aria-label="Clear selection"
            title="Clear selection"
          >
            ×
          </button>
        </div>

        <ul className="infra-detail-list">
          <li className="infra-detail-row">
            <span className="infra-detail-label">Type</span>
            <span className="infra-detail-value">{info.type}</span>
          </li>
          {extras.map((row) => (
            <li key={row.label} className="infra-detail-row">
              <span className="infra-detail-label">{row.label}</span>
              <span className="infra-detail-value">{row.value}</span>
            </li>
          ))}
          {nearbyCount != null && (
            <li className="infra-detail-row infra-detail-row-accent">
              <span className="infra-detail-label">Complaints nearby</span>
              <span className="infra-detail-value">
                {formatCount(nearbyCount)}
                <span className="infra-detail-suffix"> · within 250 m</span>
              </span>
            </li>
          )}
        </ul>
      </div>

      {cityStats && (
        <div className="infra-stats-grid infra-stats-grid--compact">
          <StatCell
            label="Network"
            value={formatKm(cityStats.totalLengthKm)}
          />
          <StatCell
            label="Outfalls"
            value={formatCount(csoFeatures.length)}
            sub={`${formatCount(cityStats.receivingWaterCount)} waters`}
          />
        </div>
      )}
    </>
  )
}

export function InfrastructureInspector({
  derived,
  selection,
  csoFeatures = [],
  onClear,
}) {
  const isSelectedInfra =
    selection && TYPE_INFO[selection.layerId] != null

  return (
    <div className="infra-panel">
      <div className="infra-header">
        <span className="infra-title">Infrastructure</span>
        <span className="infra-subtitle">Subsurface network</span>
      </div>

      {isSelectedInfra ? (
        <SelectedSegmentDetail
          selection={selection}
          derived={derived}
          csoFeatures={csoFeatures}
          onClear={onClear}
        />
      ) : (
        <NetworkOverview cityStats={derived?.cityStats} />
      )}
    </div>
  )
}
