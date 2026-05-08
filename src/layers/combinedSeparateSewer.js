import { GeoJsonLayer } from '@deck.gl/layers'

const COMBINED_TINT = [168, 85, 247, 38]   // purple
const SEPARATE_TINT = [59, 130, 246, 38]   // blue
const UNKNOWN_TINT = [120, 120, 120, 25]

function getSewerType(feature) {
  const p = feature.properties ?? {}
  const raw = (
    p.COMB_OR_SE ?? p.sewer_type ?? p.SewerType ?? p.system_type ?? p.TYPE ?? p.Type ?? ''
  )
    .toString()
    .toLowerCase()
  if (raw.includes('combined')) return 'combined'
  if (raw.includes('separate') || raw.includes('storm') || raw.includes('sanitary'))
    return 'separate'
  return 'unknown'
}

export function combinedSeparateSewerLayer() {
  return new GeoJsonLayer({
    id: 'combined-separate-sewer',
    data: '/data/combined_separate_sewer.geojson',
    stroked: false,
    filled: true,
    getFillColor: (f) => {
      const t = getSewerType(f)
      if (t === 'combined') return COMBINED_TINT
      if (t === 'separate') return SEPARATE_TINT
      return UNKNOWN_TINT
    },
    pickable: true,
  })
}
