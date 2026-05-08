import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers'

const HIGHLIGHT_COLOR = [253, 224, 71, 240] // amber-yellow, high alpha

export function selectionHighlightLayer(feature) {
  if (!feature) {
    return new ScatterplotLayer({
      id: 'selection-highlight',
      data: [],
      getPosition: () => [0, 0],
      pickable: false,
    })
  }

  const geomType = feature.geometry?.type

  if (geomType === 'Point') {
    return new ScatterplotLayer({
      id: 'selection-highlight',
      data: [feature],
      getPosition: (f) => f.geometry.coordinates,
      getRadius: 14,
      radiusUnits: 'pixels',
      stroked: true,
      filled: false,
      getLineColor: HIGHLIGHT_COLOR,
      lineWidthUnits: 'pixels',
      getLineWidth: 3,
      pickable: false,
      parameters: { depthTest: false },
      updateTriggers: { getPosition: feature },
    })
  }

  return new GeoJsonLayer({
    id: 'selection-highlight',
    data: { type: 'FeatureCollection', features: [feature] },
    stroked: true,
    filled: false,
    getLineColor: HIGHLIGHT_COLOR,
    lineWidthUnits: 'pixels',
    getLineWidth: 3,
    lineWidthMinPixels: 2,
    pickable: false,
    parameters: { depthTest: false },
    updateTriggers: { getLineColor: feature },
  })
}
