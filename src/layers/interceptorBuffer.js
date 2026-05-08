import { GeoJsonLayer } from '@deck.gl/layers'

const TEAL_RGB = [20, 184, 166]

const GLOW_OUTLINE_ALPHA = 28
const GLOW_OUTLINE_WIDTH_PX = 24

const FILL_ALPHA = 38
const OUTLINE_ALPHA = 95
const OUTLINE_WIDTH_PX = 1.25

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

function asFC(bufferFeature) {
  return bufferFeature
    ? { type: 'FeatureCollection', features: [bufferFeature] }
    : EMPTY_FC
}

export function interceptorBufferGlowLayer(bufferFeature) {
  return new GeoJsonLayer({
    id: 'interceptor-buffer-glow',
    data: asFC(bufferFeature),
    stroked: true,
    filled: false,
    getLineColor: [...TEAL_RGB, GLOW_OUTLINE_ALPHA],
    lineWidthUnits: 'pixels',
    getLineWidth: GLOW_OUTLINE_WIDTH_PX,
    pickable: false,
    parameters: { depthTest: false },
    updateTriggers: {
      getLineColor: bufferFeature,
    },
  })
}

export function interceptorBufferLayer(bufferFeature) {
  return new GeoJsonLayer({
    id: 'interceptor-buffer',
    data: asFC(bufferFeature),
    stroked: true,
    filled: true,
    getFillColor: [...TEAL_RGB, FILL_ALPHA],
    getLineColor: [...TEAL_RGB, OUTLINE_ALPHA],
    lineWidthUnits: 'pixels',
    getLineWidth: OUTLINE_WIDTH_PX,
    pickable: false,
    parameters: { depthTest: false },
    updateTriggers: {
      getFillColor: bufferFeature,
      getLineColor: bufferFeature,
    },
  })
}
