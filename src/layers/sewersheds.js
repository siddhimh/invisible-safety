import { GeoJsonLayer } from '@deck.gl/layers'


const PALETTES = {
  default: {
    line: [255, 255, 255, 50],
    fill: null,
    opacity: 0.1,
  },
  infrastructure: {
    line: [94, 234, 212, 110],
    fill: [94, 234, 212, 18],
    opacity: 1,
  },
}

export function sewershedsLayer({ palette = 'default' } = {}) {
  const p = PALETTES[palette] ?? PALETTES.default
  return new GeoJsonLayer({
    id: 'sewersheds',
    data: 'data/sewershed.geojson',
    stroked: true,
    filled: p.fill != null,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 1,
    lineWidthMaxPixels: 1,
    getLineWidth: 1,
    getLineColor: p.line,
    getFillColor: p.fill ?? [0, 0, 0, 0],
    opacity: p.opacity,
    pickable: true,
  })
}
