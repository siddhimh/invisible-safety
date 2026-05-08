import { HeatmapLayer } from '@deck.gl/aggregation-layers'

const CRIME_HEAT_COLOR_RANGE = [
  [255, 255, 178],
  [254, 178, 76],
  [253, 141, 60],
  [240, 59, 32],
  [189, 0, 38],
]

export function crimeHeatmapLayer(features) {
  return new HeatmapLayer({
    id: 'crime-heat',
    data: features,
    getPosition: (f) => f.geometry.coordinates,
    getWeight: 1,
    radiusPixels: 30,
    intensity: 1,
    threshold: 0.05,
    colorRange: CRIME_HEAT_COLOR_RANGE,
    pickable: true,
  })
}
