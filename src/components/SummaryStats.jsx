function formatRatio(n) {
  if (!Number.isFinite(n)) return '—'
  if (n >= 100) return `${Math.round(n)}×`
  if (n >= 10) return `${n.toFixed(0)}×`
  return `${n.toFixed(1)}×`
}

function buildInsightCards({ proximityStats, proximityActive }) {
  const cards = []

  if (proximityActive && proximityStats) {
    const buffered = proximityStats.typeBreakdown ?? []
    const ranked = buffered
      .filter((t) => Number.isFinite(t.enrichment) && t.in >= 5)
      .sort((a, b) => b.enrichment - a.enrichment)
    const top = ranked[0]
    if (top && top.enrichment >= 1.2) {
      cards.push({
        key: 'pipe-proximity',
        kicker: 'Pipe corridor effect',
        headline: (
          <>
            <strong>{top.type}</strong> 311s {formatRatio(top.enrichment)}{' '}
            denser near trunk lines
          </>
        ),
        meta: `${top.in.toLocaleString()} inside · ${proximityStats.bufferMeters} m buffer`,
      })
    } else if (Number.isFinite(proximityStats.overallEnrichment)) {
      cards.push({
        key: 'pipe-proximity',
        kicker: 'Pipe corridor effect',
        headline: (
          <>
            311 reports overall{' '}
            <strong>{formatRatio(proximityStats.overallEnrichment)}</strong>{' '}
            denser inside the buffer
          </>
        ),
        meta: `${proximityStats.totalIn.toLocaleString()} inside · ${proximityStats.bufferMeters} m buffer`,
      })
    }
  }

  return cards
}

export function SummaryStats({ proximityStats, proximityActive }) {
  const cards = buildInsightCards({ proximityStats, proximityActive })

  if (cards.length === 0) return null

  return (
    <div className="insight-row" role="status" aria-label="Map context">
      {cards.map((c) => (
        <article key={c.key} className="insight-card">
          <div className="insight-card-kicker">
            <span className="insight-card-mark" aria-hidden="true" />
            {c.kicker}
          </div>
          <div className="insight-card-headline">{c.headline}</div>
          {c.meta && <div className="insight-card-meta">{c.meta}</div>}
        </article>
      ))}
    </div>
  )
}
