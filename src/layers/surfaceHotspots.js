import { ScatterplotLayer } from '@deck.gl/layers'

const HOTSPOT_FILL = [255, 255, 255, 70]
const HOTSPOT_STROKE = [15, 23, 42, 230]

const MIN_RADIUS_PX = 10
const MAX_RADIUS_PX = 22

function getRadius(feature) {
  const t = Math.max(0, Math.min(1, feature.properties.intensity ?? 0))
  return MIN_RADIUS_PX + (MAX_RADIUS_PX - MIN_RADIUS_PX) * t
}

export function surfaceHotspotsLayer(features) {
  return new ScatterplotLayer({
    id: 'surface-hotspots',
    data: features ?? [],
    getPosition: (f) => f.geometry.coordinates,
    getRadius,
    radiusUnits: 'pixels',
    getFillColor: HOTSPOT_FILL,
    getLineColor: HOTSPOT_STROKE,
    stroked: true,
    filled: true,
    lineWidthUnits: 'pixels',
    getLineWidth: 1.5,
    pickable: true,
    parameters: { depthTest: false },
    updateTriggers: {
      getRadius: features,
    },
  })
}
