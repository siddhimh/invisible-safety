import { ScatterplotLayer } from '@deck.gl/layers'

const COLLISION_MAGENTA = [236, 72, 153]
const RADIUS_DEFAULT_PX = 2
const RADIUS_FATAL_PX = 6

function getCollisionRadius(feature) {
  const killed = feature.properties.killed ?? 0
  return killed > 0 ? RADIUS_FATAL_PX : RADIUS_DEFAULT_PX
}

export function collisionsLayer(features) {
  return new ScatterplotLayer({
    id: 'collisions',
    data: features,
    getPosition: (f) => f.geometry.coordinates,
    getFillColor: COLLISION_MAGENTA,
    getRadius: getCollisionRadius,
    radiusUnits: 'pixels',
    stroked: false,
    pickable: true,
    opacity: 0.85,
    parameters: { depthTest: false },
  })
}
