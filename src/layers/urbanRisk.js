import { GeoJsonLayer } from '@deck.gl/layers'

const RISK_COLOR_STOPS = [
  { t: 0.0,  rgb: [255, 255, 204] }, // pale yellow
  { t: 0.25, rgb: [254, 217, 118] }, // light yellow
  { t: 0.5,  rgb: [254, 178,  76] }, // orange
  { t: 0.75, rgb: [253, 141,  60] }, // deep orange
  { t: 1.0,  rgb: [189,   0,  38] }, // dark red
]

function riskToRGB(t) {
  const tt = t < 0 ? 0 : t > 1 ? 1 : t
  for (let i = 1; i < RISK_COLOR_STOPS.length; i++) {
    const b = RISK_COLOR_STOPS[i]
    if (tt <= b.t) {
      const a = RISK_COLOR_STOPS[i - 1]
      const f = (tt - a.t) / (b.t - a.t)
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * f),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * f),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * f),
      ]
    }
  }
  return RISK_COLOR_STOPS[RISK_COLOR_STOPS.length - 1].rgb
}

export function urbanRiskLayer(featureCollection) {
  return new GeoJsonLayer({
    id: 'urban-risk',
    data: featureCollection,
    stroked: true,
    filled: true,
    lineWidthUnits: 'pixels',
    getLineWidth: 0.5,
    getLineColor: [255, 255, 255, 30],
    getFillColor: (f) => {
      const risk = f.properties.risk ?? 0
      const [r, g, b] = riskToRGB(risk)
      // Low-risk cells go nearly transparent so hotspots dominate.
      const alpha = Math.round(60 + 160 * risk)
      return [r, g, b, alpha]
    },
    pickable: true,
    updateTriggers: {
      getFillColor: featureCollection,
    },
    parameters: { depthTest: false },
  })
}
