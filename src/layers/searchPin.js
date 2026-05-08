import { ScatterplotLayer } from '@deck.gl/layers'

const PIN_COLOR = [0, 230, 118]
const PIN_HALO = [0, 230, 118, 80]

export function searchPinLayer(point) {
  return new ScatterplotLayer({
    id: 'search-pin',
    data: point ? [point] : [],
    getPosition: (d) => [d.longitude, d.latitude],
    getRadius: 12,
    radiusUnits: 'pixels',
    getFillColor: PIN_COLOR,
    getLineColor: PIN_HALO,
    getLineWidth: 8,
    lineWidthUnits: 'pixels',
    stroked: true,
    filled: true,
    pickable: false,
    parameters: { depthTest: false },
  })
}
