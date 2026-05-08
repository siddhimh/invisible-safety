import { useMemo } from 'react'
import {
  AR_RADIUS_M,
  featureCenter,
  lineFeatureBbox,
  lngLatToLocalMeters,
  withinRadius,
} from './projection'

const MAX_CELLS = 60
const MAX_PIPES = 8
const MAX_INCIDENTS = 50
const MAX_HOTSPOTS = 8

function cellCentroid(feature) {
  const ring = feature?.geometry?.coordinates?.[0]
  if (!ring || ring.length < 4) return null
  return [
    (ring[0][0] + ring[1][0] + ring[2][0] + ring[3][0]) / 4,
    (ring[0][1] + ring[1][1] + ring[2][1] + ring[3][1]) / 4,
  ]
}
function sampleLineToLocal(feature, center) {
  const g = feature?.geometry
  if (!g) return []
  const lines =
    g.type === 'LineString'
      ? [g.coordinates]
      : g.type === 'MultiLineString'
        ? g.coordinates
        : []

  const out = []
  for (const coords of lines) {
    if (!coords || coords.length < 2) continue
    const flat = new Float32Array(coords.length * 2)
    let length = 0
    let prevX = 0
    let prevZ = 0
    for (let i = 0; i < coords.length; i++) {
      const [x, z] = lngLatToLocalMeters(coords[i], center)
      flat[i * 2] = x
      flat[i * 2 + 1] = z
      if (i > 0) {
        const dx = x - prevX
        const dz = z - prevZ
        length += Math.sqrt(dx * dx + dz * dz)
      }
      prevX = x
      prevZ = z
    }
    out.push({ flat, length })
  }
  return out
}

function lineIntersectsRadius(feature, center, radiusM = AR_RADIUS_M) {
  const bb = lineFeatureBbox(feature)
  if (!bb) return false
  const [minLng, minLat, maxLng, maxLat] = bb
  const cosLat = Math.cos((center[1] * Math.PI) / 180)
  const padLat = radiusM / 111000
  const padLng = radiusM / (111000 * cosLat)
  if (
    maxLng < center[0] - padLng ||
    minLng > center[0] + padLng ||
    maxLat < center[1] - padLat ||
    minLat > center[1] + padLat
  ) {
    return false
  }

  const g = feature.geometry
  const lines =
    g.type === 'LineString'
      ? [g.coordinates]
      : g.type === 'MultiLineString'
        ? g.coordinates
        : []
  for (const coords of lines) {
    for (const c of coords) {
      if (withinRadius(c, center, radiusM)) return true
    }
  }
  return false
}
function squaredDistanceM(coord, center) {
  const [x, z] = lngLatToLocalMeters(coord, center)
  return x * x + z * z
}

export function useARData({
  selectedFeature,
  riskGeoJson,
  surfaceHotspots,
  interceptorFeatures,
  complaints,
  csoFeatures,
}) {
  return useMemo(() => {
    if (!selectedFeature) return null
    const center = featureCenter(selectedFeature.object ?? selectedFeature)
    if (!center) return null
    const cellCandidates = []
    for (const f of riskGeoJson?.features ?? []) {
      const centroid = cellCentroid(f)
      if (!centroid) continue
      if (!withinRadius(centroid, center)) continue
      const [x, z] = lngLatToLocalMeters(centroid, center)
      cellCandidates.push({
        x,
        z,
        risk: f.properties?.risk ?? 0,
        d2: x * x + z * z,
      })
    }
    cellCandidates.sort((a, b) => a.d2 - b.d2)
    const cells = cellCandidates.slice(0, MAX_CELLS).map(({ x, z, risk }) => ({
      x,
      z,
      risk,
    }))
    const pipes = []
    for (const f of interceptorFeatures ?? []) {
      if (pipes.length >= MAX_PIPES) break
      if (!lineIntersectsRadius(f, center)) continue
      const sampled = sampleLineToLocal(f, center)
      for (const seg of sampled) {
        if (pipes.length >= MAX_PIPES) break
        // Drop tiny stubs — too short to look like flowing pipes.
        if (seg.length < 5) continue
        pipes.push(seg)
      }
    }
    const incidentCandidates = []
    for (const f of complaints ?? []) {
      const c = f?.geometry?.coordinates
      if (!Array.isArray(c) || c.length < 2) continue
      if (!withinRadius(c, center)) continue
      const [x, z] = lngLatToLocalMeters(c, center)
      incidentCandidates.push({
        x,
        z,
        type: f.properties?.type ?? 'Other',
        d2: x * x + z * z,
      })
    }
    incidentCandidates.sort((a, b) => a.d2 - b.d2)
    const incidents = incidentCandidates
      .slice(0, MAX_INCIDENTS)
      .map(({ x, z, type }) => ({ x, z, type }))
    const csos = []
    for (const f of csoFeatures ?? []) {
      const c = f?.geometry?.coordinates
      if (!Array.isArray(c) || c.length < 2) continue
      if (!withinRadius(c, center)) continue
      const [x, z] = lngLatToLocalMeters(c, center)
      csos.push({ x, z })
    }

    const hotspots = []
    for (const h of surfaceHotspots ?? []) {
      if (hotspots.length >= MAX_HOTSPOTS) break
      const c = h?.geometry?.coordinates
      if (!Array.isArray(c) || c.length < 2) continue
      if (!withinRadius(c, center)) continue
      const [x, z] = lngLatToLocalMeters(c, center)
      hotspots.push({
        x,
        z,
        intensity: h.properties?.intensity ?? 0,
      })
    }

    return {
      center,
      cells,
      pipes,
      incidents,
      csos,
      hotspots,
      counts: {
        cells: cells.length,
        pipes: pipes.length,
        incidents: incidents.length,
        csos: csos.length,
        hotspots: hotspots.length,
      },
    }
  }, [
    selectedFeature,
    riskGeoJson,
    surfaceHotspots,
    interceptorFeatures,
    complaints,
    csoFeatures,
  ])
}

export { sampleLineToLocal, squaredDistanceM }
