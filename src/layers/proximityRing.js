import { ScatterplotLayer } from '@deck.gl/layers'

const RING_COLOR = [253, 246, 220, 235]

export function proximityRingLayer(insideFeatures) {
  return new ScatterplotLayer({
    id: 'proximity-ring',
    data: insideFeatures,
    getPosition: (f) => f.geometry.coordinates,
    getRadius: 7,
    radiusUnits: 'pixels',
    filled: false,
    stroked: true,
    getLineColor: RING_COLOR,
    lineWidthUnits: 'pixels',
    getLineWidth: 1.25,
    pickable: false,
    parameters: { depthTest: false },
  })
}
