import { ScatterplotLayer } from '@deck.gl/layers'


const COMPLAINT_COLORS = {
  Sewer: [239, 68, 68, 200],
  'Water System': [59, 130, 246, 200],
  'Street Condition': [245, 158, 11, 180],
}
const DEFAULT_COMPLAINT_COLOR = [200, 200, 200, 160]
const COMPLAINT_RGB_PROXIMITY = {
  Sewer: [212, 110, 110],
  'Water System': [120, 156, 210],
  'Street Condition': [216, 168, 100],
}
const DEFAULT_RGB_PROXIMITY = [180, 180, 185]

const EMPHASIS_ALPHA = 235
const FADE_ALPHA = 55

const EMPHASIS_RADIUS_PX = 5.5
const FADE_RADIUS_PX = 1.5

export function complaints311Layer(
  features,
  { emphasisSet = null, proximityMode = false } = {},
) {
  if (proximityMode) {
    const getFillColor = (f) => {
      const rgb =
        COMPLAINT_RGB_PROXIMITY[f.properties.type] ?? DEFAULT_RGB_PROXIMITY
      if (!emphasisSet) return [...rgb, EMPHASIS_ALPHA]
      return emphasisSet.has(f)
        ? [...rgb, EMPHASIS_ALPHA]
        : [...rgb, FADE_ALPHA]
    }
    const getRadius = emphasisSet
      ? (f) => (emphasisSet.has(f) ? EMPHASIS_RADIUS_PX : FADE_RADIUS_PX)
      : EMPHASIS_RADIUS_PX

    return new ScatterplotLayer({
      id: '311-complaints',
      data: features,
      getPosition: (f) => f.geometry.coordinates,
      getFillColor,
      getRadius,
      radiusUnits: 'pixels',
      stroked: false,
      pickable: true,
      parameters: { depthTest: false },
      updateTriggers: {
        getFillColor: emphasisSet,
        getRadius: emphasisSet,
      },
    })
  }

  return new ScatterplotLayer({
    id: '311-complaints',
    data: features,
    getPosition: (f) => f.geometry.coordinates,
    getFillColor: (f) =>
      COMPLAINT_COLORS[f.properties.type] ?? DEFAULT_COMPLAINT_COLOR,
    getRadius: 30,
    radiusUnits: 'meters',
    radiusMinPixels: 2,
    radiusMaxPixels: 6,
    stroked: false,
    pickable: true,
    opacity: 0.8,
    parameters: { depthTest: false },
  })
}
