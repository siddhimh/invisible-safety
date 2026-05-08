import { GeoJsonLayer } from '@deck.gl/layers'

const PALETTES = {
  default: {
    base: [0, 230, 118, 200],
    width: 2,
  },
  proximity: {
    base: [125, 211, 196, 235],
    width: 2.5,
  },
  infrastructure: {
    base: [34, 211, 238, 235],
    dim: [34, 211, 238, 70],
    highlight: [165, 243, 252, 255],
    width: 4,
    highlightWidth: 6,
  },
}

export function interceptorsLayer({
  features,
  palette = 'default',
  hoverActive = false,
  highlightedSet,
} = {}) {
  const p = PALETTES[palette] ?? PALETTES.default

  const dataProp = features ?? 'data/interceptors_force_mains.geojson'

  const isInfra = palette === 'infrastructure' && Array.isArray(features)

  const getLineColor = isInfra
    ? (_f, info) => {
        if (!hoverActive) return p.base
        if (highlightedSet?.has(info.index)) return p.highlight
        return p.dim
      }
    : p.base

  const getLineWidth = isInfra
    ? (_f, info) =>
        hoverActive && highlightedSet?.has(info.index)
          ? p.highlightWidth
          : p.width
    : p.width

  return new GeoJsonLayer({
    id: 'interceptors',
    data: dataProp,
    stroked: true,
    filled: false,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: isInfra ? 2 : 2,
    getLineWidth,
    getLineColor,
    pickable: true,
    autoHighlight: !isInfra,
    highlightColor: [255, 255, 255, 60],
    parameters: { depthTest: false },
    updateTriggers: isInfra
      ? {
          getLineColor: [hoverActive, highlightedSet],
          getLineWidth: [hoverActive, highlightedSet],
        }
      : undefined,
  })
}
