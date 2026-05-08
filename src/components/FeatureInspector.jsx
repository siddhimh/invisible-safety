const TITLES = {
  collisions: 'Crash',
  '311-complaints': '311 complaint',
  'cso-locations': 'CSO outfall',
  interceptors: 'Sewer interceptor',
  sewersheds: 'Sewershed',
  'combined-separate-sewer': 'Sewer system zone',
}

function renderBody(layerId, p) {
  switch (layerId) {
    case 'collisions': {
      const killed = p.killed ?? 0
      return (
        <>
          <Row label="Date" value={p.date ?? '—'} />
          <Row label="Factor" value={p.factor ?? 'unknown'} />
          <Row label="Injured" value={p.injured ?? 0} />
          <Row label="Killed" value={killed} accent={killed > 0} />
        </>
      )
    }
    case '311-complaints':
      return (
        <>
          {p.type && <Row label="Type" value={p.type} />}
          {p.descriptor && <Row label="Descriptor" value={p.descriptor} />}
          <Row label="Date" value={p.date ?? '—'} />
          <Row label="Status" value={p.status ?? 'unknown'} />
        </>
      )
    case 'cso-locations':
      return (
        <>
          {p.spdes && <Row label="SPDES" value={p.spdes} />}
          {p.Waterbody && <Row label="Waterbody" value={p.Waterbody} />}
          {p.Waterbod_1 && <Row label="Receives" value={p.Waterbod_1} />}
        </>
      )
    case 'interceptors':
      return <Row label="Type" value="Force main / trunk line" />
    case 'sewersheds':
      return <Row label="Type" value="Drainage basin outline" />
    case 'combined-separate-sewer': {
      const raw = (
        p.COMB_OR_SE ?? p.sewer_type ?? p.SewerType ?? p.system_type ?? '—'
      )
      return <Row label="System" value={raw} />
    }
    default:
      return null
  }
}

function Row({ label, value, accent }) {
  return (
    <li className={`inspector-row${accent ? ' inspector-row-accent' : ''}`}>
      <span className="inspector-row-label">{label}</span>
      <span className="inspector-row-value">{value}</span>
    </li>
  )
}

export function FeatureInspector({ feature, layerId, onClose }) {
  if (!feature || !layerId) return null
  const title = TITLES[layerId]
  if (!title) return null

  const p = feature.properties ?? {}
  const body = renderBody(layerId, p)

  return (
    <aside className="map-card map-card-top-right inspector">
      <div className="inspector-header">
        <span className="inspector-title">{title}</span>
        <button
          type="button"
          className="inspector-close"
          onClick={onClose}
          aria-label="Close inspector"
          title="Close (clears selection)"
        >
          ×
        </button>
      </div>
      <ul className="inspector-body">{body}</ul>
    </aside>
  )
}
