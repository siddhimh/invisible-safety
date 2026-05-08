import { useEffect, useMemo, useState } from 'react'

const INTERCEPTORS_URL = 'data/interceptors_force_mains.geojson'
const CONNECTION_M = 600
const NEARBY_COMPLAINT_M = 250
const NYC_LAT_RAD = (40.75 * Math.PI) / 180
const M_PER_DEG_LAT = 111_000
const M_PER_DEG_LNG = 111_000 * Math.cos(NYC_LAT_RAD)

function meterDistanceSq(aLng, aLat, bLng, bLat) {
  const dx = (aLng - bLng) * M_PER_DEG_LNG
  const dy = (aLat - bLat) * M_PER_DEG_LAT
  return dx * dx + dy * dy
}

function pointToPolylineMin2(lng, lat, coords) {
  let best = Infinity
  for (let i = 0; i < coords.length - 1; i++) {
    const ax = coords[i][0]
    const ay = coords[i][1]
    const bx = coords[i + 1][0]
    const by = coords[i + 1][1]
    const dxAB = (bx - ax) * M_PER_DEG_LNG
    const dyAB = (by - ay) * M_PER_DEG_LAT
    const dxAP = (lng - ax) * M_PER_DEG_LNG
    const dyAP = (lat - ay) * M_PER_DEG_LAT
    const segLen2 = dxAB * dxAB + dyAB * dyAB
    let t = segLen2 > 0 ? (dxAP * dxAB + dyAP * dyAB) / segLen2 : 0
    if (t < 0) t = 0
    else if (t > 1) t = 1
    const px = dxAP - t * dxAB
    const py = dyAP - t * dyAB
    const d2 = px * px + py * py
    if (d2 < best) best = d2
  }
  return best
}

function polylineLengthM(coords) {
  let total = 0
  for (let i = 0; i < coords.length - 1; i++) {
    total += Math.sqrt(
      meterDistanceSq(
        coords[i][0],
        coords[i][1],
        coords[i + 1][0],
        coords[i + 1][1],
      ),
    )
  }
  return total
}

function extractPolylines(feature) {
  const g = feature?.geometry
  if (!g) return []
  if (g.type === 'LineString') return [g.coordinates]
  if (g.type === 'MultiLineString') return g.coordinates
  return []
}

export function useInfrastructure({
  enabled = true,
  csoFeatures = [],
  complaints = [],
}) {
  const [interceptors, setInterceptors] = useState(null)

  // Lazy fetch — only pay the cost when the mode is active. Same
  // cancelled-flag discipline as elsewhere in the codebase.
  useEffect(() => {
    if (!enabled || interceptors) return
    let cancelled = false
    fetch(INTERCEPTORS_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((j) => {
        if (!cancelled) setInterceptors(j)
      })
      .catch((e) =>
        console.error('infrastructure: failed to load interceptors', e),
      )
    return () => {
      cancelled = true
    }
  }, [enabled, interceptors])

  const derived = useMemo(() => {
    if (!enabled || !interceptors) return null
    const features = interceptors.features ?? []

    // Per-segment length + total km.
    const segmentLengths = features.map((f) => {
      const polylines = extractPolylines(f)
      let m = 0
      for (const c of polylines) m += polylineLengthM(c)
      return m
    })
    const totalLengthKm =
      segmentLengths.reduce((a, b) => a + b, 0) / 1000
    const csoToInterceptor = new Map()
    const csoToInterceptorDist = new Map()
    for (const cso of csoFeatures) {
      const c = cso?.geometry?.coordinates
      if (!Array.isArray(c) || c.length < 2) continue
      const [lng, lat] = c
      let bestIdx = -1
      let bestDist2 = Infinity
      for (let i = 0; i < features.length; i++) {
        for (const poly of extractPolylines(features[i])) {
          const d2 = pointToPolylineMin2(lng, lat, poly)
          if (d2 < bestDist2) {
            bestDist2 = d2
            bestIdx = i
          }
        }
      }
      if (bestIdx >= 0) {
        csoToInterceptor.set(cso, bestIdx)
        csoToInterceptorDist.set(cso, Math.sqrt(bestDist2))
      }
    }

    const interceptorToCsos = new Map()
    for (const [cso, idx] of csoToInterceptor.entries()) {
      const dist = csoToInterceptorDist.get(cso) ?? Infinity
      if (dist > CONNECTION_M) continue
      const set = interceptorToCsos.get(idx) ?? new Set()
      set.add(cso)
      interceptorToCsos.set(idx, set)
    }
    const complaintsNearCso = new Map()
    const radDegLat = NEARBY_COMPLAINT_M / M_PER_DEG_LAT
    const radDegLng = NEARBY_COMPLAINT_M / M_PER_DEG_LNG
    const r2 = NEARBY_COMPLAINT_M * NEARBY_COMPLAINT_M
    for (const cso of csoFeatures) {
      const c = cso?.geometry?.coordinates
      if (!Array.isArray(c) || c.length < 2) continue
      const [lng, lat] = c
      let count = 0
      for (const cf of complaints) {
        const cc = cf?.geometry?.coordinates
        if (!Array.isArray(cc) || cc.length < 2) continue
        const [clng, clat] = cc
        if (
          Math.abs(clng - lng) > radDegLng ||
          Math.abs(clat - lat) > radDegLat
        )
          continue
        if (meterDistanceSq(lng, lat, clng, clat) <= r2) count += 1
      }
      complaintsNearCso.set(cso, count)
    }
    const complaintsNearInterceptor = new Map()
    for (let i = 0; i < features.length; i++) {
      const polys = extractPolylines(features[i])
      let minLng = Infinity
      let minLat = Infinity
      let maxLng = -Infinity
      let maxLat = -Infinity
      for (const poly of polys) {
        for (const [lng, lat] of poly) {
          if (lng < minLng) minLng = lng
          if (lat < minLat) minLat = lat
          if (lng > maxLng) maxLng = lng
          if (lat > maxLat) maxLat = lat
        }
      }
      if (!Number.isFinite(minLng)) {
        complaintsNearInterceptor.set(i, 0)
        continue
      }
      minLng -= radDegLng
      maxLng += radDegLng
      minLat -= radDegLat
      maxLat += radDegLat

      let count = 0
      for (const cf of complaints) {
        const cc = cf?.geometry?.coordinates
        if (!Array.isArray(cc) || cc.length < 2) continue
        const [clng, clat] = cc
        if (clng < minLng || clng > maxLng || clat < minLat || clat > maxLat)
          continue
        let best = Infinity
        for (const poly of polys) {
          const d2 = pointToPolylineMin2(clng, clat, poly)
          if (d2 < best) best = d2
          if (best <= r2) break
        }
        if (best <= r2) count += 1
      }
      complaintsNearInterceptor.set(i, count)
    }
    const receivingWaters = new Set()
    for (const f of csoFeatures) {
      const w = f.properties?.Waterbod_1 ?? f.properties?.Waterbody
      if (w) receivingWaters.add(w)
    }

    return {
      features,
      segmentLengths,
      cityStats: {
        totalLengthKm,
        segmentCount: features.length,
        outfallCount: csoFeatures.length,
        receivingWaterCount: receivingWaters.size,
      },
      csoToInterceptor,
      csoToInterceptorDist,
      interceptorToCsos,
      complaintsNearCso,
      complaintsNearInterceptor,
    }
  }, [enabled, interceptors, csoFeatures, complaints])

  return derived
}
