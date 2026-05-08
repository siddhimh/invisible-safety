function rToCellStyle(r) {
  if (r == null || !Number.isFinite(r)) {
    return { background: 'rgba(255,255,255,0.04)', color: '#9ca3af' }
  }
  const abs = Math.min(1, Math.abs(r))
  const alpha = 0.15 + abs * 0.6
  const rgb = r >= 0 ? '220,60,60' : '60,130,220'
  // Light text once the cell gets dark enough to need it.
  const color = abs >= 0.45 ? '#f8fafc' : '#e5e7eb'
  return { background: `rgba(${rgb},${alpha})`, color }
}

const INSIGHT_KIND_TINT = {
  strongest: '#ef4444',
  infrastructure: '#1d9e75',
  independence: '#3b82f6',
}

export function FactorCorrelations({ correlations, className = '' }) {
  if (!correlations) return null
  const { factors, shortLabels, labels, matrix, insights, n } = correlations

  return (
    <div
      className={['risk-correlations', className].filter(Boolean).join(' ')}
    >
      <div className="risk-correlations-header">
        <span className="risk-correlations-title">Observed relationships</span>
        <span className="risk-correlations-n">
          n = {n.toLocaleString()} cells
        </span>
      </div>

      <table className="risk-corr-grid">
        <thead>
          <tr>
            <th aria-hidden="true" />
            {factors.map((f) => (
              <th key={f} scope="col" title={labels[f]}>
                {shortLabels[f]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {factors.map((rowKey, i) => (
            <tr key={rowKey}>
              <th scope="row" title={labels[rowKey]}>
                {shortLabels[rowKey]}
              </th>
              {factors.map((colKey, j) => {
                const r = matrix[i][j]
                const isDiag = i === j
                const display = !Number.isFinite(r) ? '—' : r.toFixed(2)
                return (
                  <td
                    key={colKey}
                    className={
                      isDiag ? 'risk-corr-cell risk-corr-diag' : 'risk-corr-cell'
                    }
                    style={isDiag ? undefined : rToCellStyle(r)}
                    title={
                      isDiag
                        ? `${labels[rowKey]} (self)`
                        : `${labels[rowKey]} ↔ ${labels[colKey]}: r = ${
                            Number.isFinite(r) ? r.toFixed(3) : '—'
                          }`
                    }
                  >
                    {display}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {insights.length > 0 && (
        <ul className="risk-insights">
          {insights.map((ins, i) => (
            <li
              key={i}
              className="risk-insight"
              style={{
                borderLeftColor:
                  INSIGHT_KIND_TINT[ins.kind] ?? 'rgba(255,255,255,0.2)',
              }}
            >
              {ins.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
