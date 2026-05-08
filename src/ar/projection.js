export const AR_RADIUS_M = 500
export const AR_SCALE = 1 / 300
const KM_PER_DEG_LAT = 111.0
const M_PER_DEG_LAT = KM_PER_DEG_LAT * 1000
export function lngLatToLocalMeters([lng, lat], [cLng, cLat]) {
  const cosLat = Math.cos((cLat * Math.PI) / 180)
  const x = (lng - cLng) * M_PER_DEG_LAT * cosLat
  const z = -(lat - cLat) * M_PER_DEG_LAT
  return [x, z]
}
export function withinRadius(coord, center, radiusM = AR_RADIUS_M) {
  if (!Array.isArray(coord) || coord.length < 2) return false
  const [x, z] = lngLatToLocalMeters(coord, center)
  return x * x + z * z <= radiusM * radiusM
}
function ringCentroid(ring) {
  let sx = 0
  let sy = 0
  for (let i = 0; i < ring.length; i++) {
    sx += ring[i][0]
    sy += ring[i][1]
  }
  return [sx / ring.length, sy / ring.length]
}
function lineMidpoint(coords) {
  if (!coords?.length) return null
  return coords[Math.floor(coords.length / 2)]
}
export function featureCenter(feature) {
  if (!feature) return null
  const g = feature.geometry ?? feature
  if (!g || !g.type) return null

  if (g.type === 'Point') {
    return Array.isArray(g.coordinates) ? g.coordinates : null
  }
  if (g.type === 'Polygon') {
    return ringCentroid(g.coordinates?.[0] ?? [])
  }
  if (g.type === 'MultiPolygon') {
    return ringCentroid(g.coordinates?.[0]?.[0] ?? [])
  }
  if (g.type === 'LineString') {
    return lineMidpoint(g.coordinates)
  }
  if (g.type === 'MultiLineString') {
    const first = g.coordinates?.[0]
    return first ? lineMidpoint(first) : null
  }
  return null
}
export function lineFeatureBbox(feature) {
  const g = feature?.geometry
  if (!g) return null
  const lines =
    g.type === 'LineString'
      ? [g.coordinates]
      : g.type === 'MultiLineString'
        ? g.coordinates
        : null
  if (!lines) return null
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const line of lines) {
    for (const c of line) {
      const lng = c[0]
      const lat = c[1]
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }
  if (!Number.isFinite(minLng)) return null
  return [minLng, minLat, maxLng, maxLat]
}
