// Landing screen: ranked CSO outfalls the user can anchor the AR storm
// model to. Replaces the old 2D map's click-to-select flow.

const BAR_RAMP = [0.35, 0.55, 0.75, 0.9, 1]

function ScoreBars({ score }) {
  return (
    <span className="hotspot-bars" aria-hidden="true">
      {BAR_RAMP.map((r, i) => (
        <i
          key={i}
          style={{ height: `${Math.round(4 + 12 * r * Math.max(score, 0.15))}px` }}
        />
      ))}
    </span>
  )
}

export function HotspotList({ hotspots, loading, error, onSelect }) {
  return (
    <div className="hotspot-screen">
      <header className="hotspot-brand" aria-label="Invisible Safety NYC">
        <span className="brand-mark" aria-hidden="true">IS</span>
        <span className="brand-name">Invisible Safety</span>
      </header>

      <section className="hotspot-panel">
        <div className="hotspot-kicker">AR Storm Event Simulation</div>
        <h1 className="hotspot-title">Pick a place to anchor the storm model</h1>
        <p className="hotspot-sub">
          Ranked by nearby complaints and risk to the sewer system. Tapping a
          location builds a tabletop storm model of the streets, sewers, and
          outfall around it.
        </p>

        {error && (
          <div className="hotspot-error" role="alert">
            <span className="status-dot" aria-hidden="true" />
            Failed to load: {error}
          </div>
        )}

        {loading ? (
          <div className="hotspot-loading" role="status" aria-live="polite">
            <span className="status-spinner" aria-hidden="true" />
            Loading city data & ranking outfalls…
          </div>
        ) : (
          <ol className="hotspot-list">
            {hotspots.map((h, i) => (
              <li key={`${h.id}-${i}`}>
                <button
                  type="button"
                  className="hotspot-card"
                  onClick={() => onSelect(h)}
                >
                  <span className="hotspot-rank" aria-hidden="true">{i + 1}</span>
                  <span className="hotspot-body">
                    <span className="hotspot-name">
                      {h.id}
                      {h.waterbody ? ` — ${h.waterbody}` : ''}
                    </span>
                    <span className="hotspot-meta">
                      {h.complaintsNear.toLocaleString()} complaints nearby
                      <span className="hotspot-meta-sep" aria-hidden="true">·</span>
                      Peak risk: <strong>{Math.round(h.riskNear * 100)}%</strong>
                    </span>
                    {h.receives && (
                      <span className="hotspot-receives">Receives: {h.receives}</span>
                    )}
                  </span>
                  <ScoreBars score={h.score} />
                  <span className="hotspot-chevron" aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ol>
        )}

        {!loading && hotspots.length === 0 && !error && (
          <p className="hotspot-empty">
            No ranked outfalls yet — data may still be processing.
          </p>
        )}

        <p className="hotspot-disclaimer">
          <span className="hotspot-info-glyph" aria-hidden="true">i</span>
          Conceptual simulation — not a hydrological model. For educational and
          exploratory purposes only.
        </p>
      </section>
    </div>
  )
}
