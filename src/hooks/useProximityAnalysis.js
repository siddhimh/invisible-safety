import { useEffect, useMemo, useState } from 'react'
import buffer from '@turf/buffer'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import area from '@turf/area'
import bbox from '@turf/bbox'

const INTERCEPTORS_URL = 'data/interceptors_force_mains.geojson'

export function useProximityAnalysis({
  complaints = [],
  bufferMeters = 200,
  enabled = true,
  preload = false,
}) {
  const [interceptors, setInterceptors] = useState(null)
  useEffect(() => {
    if (!(enabled || preload) || interceptors) return
    let cancelled = false
    fetch(INTERCEPTORS_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((j) => {
        if (!cancelled) setInterceptors(j)
      })
      .catch((e) => console.error('proximity: failed to load interceptors', e))
    return () => {
      cancelled = true
    }
  }, [enabled, preload, interceptors])
  const bufferFeature = useMemo(() => {
    if (!enabled || !interceptors) return null

    const lines = []
    for (const f of interceptors.features ?? []) {
      const g = f?.geometry
      if (!g) continue
      if (g.type === 'LineString') lines.push(g.coordinates)
      else if (g.type === 'MultiLineString') {
        for (const c of g.coordinates) lines.push(c)
      }
    }
    if (!lines.length) return null

    const merged = {
      type: 'Feature',
      geometry: { type: 'MultiLineString', coordinates: lines },
      properties: {},
    }
    return buffer(merged, bufferMeters / 1000, {
      units: 'kilometers',
      steps: 8,
    })
  }, [interceptors, bufferMeters, enabled])
  const { insideSet, stats } = useMemo(() => {
    if (!enabled || !bufferFeature || !complaints.length) {
      return { insideSet: new Set(), stats: null }
    }

    const inside = new Set()
    const typeCounts = new Map() // type → { in, out }
    const [minLng, minLat, maxLng, maxLat] = bbox(bufferFeature)

    for (const f of complaints) {
      const c = f?.geometry?.coordinates
      if (!Array.isArray(c) || c.length < 2) continue
      const [lng, lat] = c

      let isInside = false
      if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) {
        isInside = booleanPointInPolygon([lng, lat], bufferFeature)
      }

      const type = f.properties?.type ?? 'Other'
      const bucket = typeCounts.get(type) ?? { in: 0, out: 0 }
      if (isInside) {
        inside.add(f)
        bucket.in += 1
      } else {
        bucket.out += 1
      }
      typeCounts.set(type, bucket)
    }
    const NYC_TOTAL_KM2 = 783.8 // five boroughs land+water
    const bufferKm2 = area(bufferFeature) / 1e6
    const outsideKm2 = Math.max(NYC_TOTAL_KM2 - bufferKm2, 1e-6)

    const totalIn = inside.size
    const totalOut = complaints.length - totalIn

    const typeBreakdown = []
    for (const [type, { in: inT, out: outT }] of typeCounts.entries()) {
      const densityIn = inT / bufferKm2
      const densityOut = outT / outsideKm2
      const enrichment = densityOut > 0 ? densityIn / densityOut : Infinity
      typeBreakdown.push({
        type,
        in: inT,
        out: outT,
        total: inT + outT,
        percentIn: inT + outT > 0 ? (inT / (inT + outT)) * 100 : 0,
        enrichment,
      })
    }
    typeBreakdown.sort((a, b) => b.total - a.total)

    return {
      insideSet: inside,
      stats: {
        total: complaints.length,
        totalIn,
        totalOut,
        percentIn: complaints.length > 0 ? (totalIn / complaints.length) * 100 : 0,
        bufferKm2,
        bufferMeters,
        densityIn: totalIn / bufferKm2,
        densityOut: totalOut / outsideKm2,
        overallEnrichment:
          totalOut > 0 && bufferKm2 > 0
            ? (totalIn / bufferKm2) / (totalOut / outsideKm2)
            : null,
        typeBreakdown,
      },
    }
  }, [bufferFeature, complaints, enabled, bufferMeters])
  const interceptorFeatures = interceptors?.features ?? []

  return { bufferFeature, insideSet, stats, interceptorFeatures }
}
