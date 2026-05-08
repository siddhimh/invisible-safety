import { useMemo } from 'react'
import squareGrid from '@turf/square-grid'

const NYC_BBOX = [-74.27, 40.49, -73.68, 40.92]
const HOTSPOT_CELL_SIZE_KM = 0.4
const TOP_N = 18
const FATAL_WEIGHT = 5
const INJURY_WEIGHT = 1
const PROPERTY_WEIGHT = 0.4
const MIN_EVENTS = 3

function binAndAggregate(features, originLng, originLat, dLng, dLat, maxLng, maxLat, reducer) {
  const bins = new Map()
  for (const f of features) {
    const c = f?.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) continue
    const [lng, lat] = c
    if (lng < originLng || lng > maxLng || lat < originLat || lat > maxLat) continue
    const col = Math.floor((lng - originLng) / dLng)
    const row = Math.floor((lat - originLat) / dLat)
    const key = `${col}|${row}`
    const prev = bins.get(key)
    bins.set(key, reducer(prev, f))
  }
  return bins
}

function minMax(values) {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const range = hi - lo
  if (!Number.isFinite(range) || range <= 0) return () => 0
  return (v) => (v - lo) / range
}

export function useSurfaceHotspots({
  crime = [],
  collisions = [],
  complaints = [],
  enabled = true,
  cellSizeKm = HOTSPOT_CELL_SIZE_KM,
  topN = TOP_N,
}) {
  return useMemo(() => {
    if (!enabled) return { hotspots: [], cityStats: null }

    const [minLng, minLat, maxLng, maxLat] = NYC_BBOX
    const cells = squareGrid(NYC_BBOX, cellSizeKm, { units: 'kilometers' })
    if (!cells.features.length) return { hotspots: [], cityStats: null }

    const latMid = (minLat + maxLat) / 2
    const dLat = cellSizeKm / 111.0
    const dLng = cellSizeKm / (111.0 * Math.cos((latMid * Math.PI) / 180))

    // Crime: simple per-cell count.
    const crimeBins = binAndAggregate(
      crime, minLng, minLat, dLng, dLat, maxLng, maxLat,
      (prev) => (prev ?? 0) + 1,
    )
    const crashBins = binAndAggregate(
      collisions, minLng, minLat, dLng, dLat, maxLng, maxLat,
      (prev, f) => {
        const p = f.properties ?? {}
        const killed = Number(p.killed ?? 0)
        const injured = Number(p.injured ?? 0)
        const acc = prev ?? { count: 0, fatal: 0, injured: 0, property: 0, severity: 0 }
        acc.count += 1
        if (killed > 0) {
          acc.fatal += 1
          acc.severity += FATAL_WEIGHT
        } else if (injured > 0) {
          acc.injured += 1
          acc.severity += INJURY_WEIGHT
        } else {
          acc.property += 1
          acc.severity += PROPERTY_WEIGHT
        }
        return acc
      },
    )
    const complaintBins = binAndAggregate(
      complaints, minLng, minLat, dLng, dLat, maxLng, maxLat,
      (prev, f) => {
        const t = f.properties?.type ?? 'Other'
        const acc = prev ?? { count: 0, byType: {} }
        acc.count += 1
        acc.byType[t] = (acc.byType[t] ?? 0) + 1
        return acc
      },
    )
    const candidates = []
    for (const cell of cells.features) {
      const ring = cell.geometry.coordinates[0]
      const cx = (ring[0][0] + ring[1][0] + ring[2][0] + ring[3][0]) / 4
      const cy = (ring[0][1] + ring[1][1] + ring[2][1] + ring[3][1]) / 4
      const col = Math.floor((cx - minLng) / dLng)
      const row = Math.floor((cy - minLat) / dLat)
      const key = `${col}|${row}`

      const crimeCount = crimeBins.get(key) ?? 0
      const crash = crashBins.get(key) ?? { count: 0, fatal: 0, injured: 0, property: 0, severity: 0 }
      const complaint = complaintBins.get(key) ?? { count: 0, byType: {} }

      const totalEvents = crimeCount + crash.count + complaint.count
      if (totalEvents < MIN_EVENTS) continue

      candidates.push({
        cx, cy, key,
        crimeCount,
        crashCount: crash.count,
        crashFatal: crash.fatal,
        crashInjured: crash.injured,
        crashProperty: crash.property,
        crashSeverity: crash.severity,
        complaintCount: complaint.count,
        complaintByType: complaint.byType,
        totalEvents,
      })
    }

    if (!candidates.length) {
      return {
        hotspots: [],
        cityStats: cityStatsFrom(crime, collisions, complaints),
      }
    }
    const nCrime = minMax(candidates.map((c) => c.crimeCount))
    const nCrash = minMax(candidates.map((c) => c.crashSeverity))
    const nComplaint = minMax(candidates.map((c) => c.complaintCount))
    for (const c of candidates) {
      c.crimeScore = nCrime(c.crimeCount)
      c.crashScore = nCrash(c.crashSeverity)
      c.complaintScore = nComplaint(c.complaintCount)
      c.intensity =
        (c.crimeScore + c.crashScore + c.complaintScore) / 3
      const scores = [
        ['crime', c.crimeScore, c.crimeCount],
        ['crash', c.crashScore, c.crashCount],
        ['complaint', c.complaintScore, c.complaintCount],
      ]
      scores.sort((a, b) => b[1] - a[1])
      c.dominant = scores[0][0]
    }

    candidates.sort((a, b) => b.intensity - a.intensity)
    const top = candidates.slice(0, topN)
    const hotspots = top.map((c, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.cx, c.cy] },
      properties: {
        hotspotId: i,
        rank: i + 1,
        cellSizeKm,
        intensity: c.intensity,
        dominant: c.dominant,
        crimeCount: c.crimeCount,
        crashCount: c.crashCount,
        crashFatal: c.crashFatal,
        crashInjured: c.crashInjured,
        crashProperty: c.crashProperty,
        complaintCount: c.complaintCount,
        complaintByType: c.complaintByType,
        totalEvents: c.totalEvents,
      },
    }))

    return {
      hotspots,
      cityStats: cityStatsFrom(crime, collisions, complaints),
    }
  }, [enabled, cellSizeKm, topN, crime, collisions, complaints])
}
function cityStatsFrom(crime, collisions, complaints) {
  let fatal = 0
  let injured = 0
  for (const f of collisions) {
    const p = f.properties ?? {}
    const k = Number(p.killed ?? 0)
    const inj = Number(p.injured ?? 0)
    if (k > 0) fatal += 1
    else if (inj > 0) injured += 1
  }
  return {
    crimeCount: crime.length,
    crashCount: collisions.length,
    crashFatal: fatal,
    crashInjured: injured,
    complaintCount: complaints.length,
  }
}
