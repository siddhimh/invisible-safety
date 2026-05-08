import { ScatterplotLayer } from '@deck.gl/layers'

const PALETTES = {
  default: {
    fill: [29, 158, 117, 170],
    radiusMeters: 80,
    minPx: 3,
    maxPx: 12,
  },
  infrastructure: {
    fill: [45, 212, 191, 250],
    dim: [45, 212, 191, 90],
    highlight: [240, 253, 250, 255],
    radiusMeters: 110,
    minPx: 5,
    maxPx: 16,
  },
}

export function csoLocationsLayer(
  features,
  { palette = 'default', hoverActive = false, highlightedSet } = {},
) {
  const p = PALETTES[palette] ?? PALETTES.default
  const isInfra = palette === 'infrastructure'

  const getFillColor = isInfra
    ? (f) => {
        if (!hoverActive) return p.fill
        if (highlightedSet?.has(f)) return p.highlight
        return p.dim
      }
    : p.fill

  return new ScatterplotLayer({
    id: 'cso-locations',
    data: features,
    getPosition: (f) => f.geometry.coordinates,
    getRadius: p.radiusMeters,
    radiusUnits: 'meters',
    radiusMinPixels: p.minPx,
    radiusMaxPixels: p.maxPx,
    getFillColor,
    stroked: false,
    pickable: true,
    autoHighlight: !isInfra,
    highlightColor: [255, 255, 255, 60],
    parameters: { depthTest: false },
    updateTriggers: isInfra
      ? { getFillColor: [hoverActive, highlightedSet] }
      : undefined,
  })
}

export function csoGlowLayer(features) {
  return new ScatterplotLayer({
    id: 'cso-glow',
    data: features,
    getPosition: (f) => f.geometry.coordinates,
    getRadius: 240,
    radiusUnits: 'meters',
    radiusMinPixels: 10,
    radiusMaxPixels: 36,
    getFillColor: [45, 212, 191, 60],
    stroked: false,
    pickable: false,
    parameters: { depthTest: false },
  })
}
