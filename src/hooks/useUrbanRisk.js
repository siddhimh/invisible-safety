import { useMemo } from 'react'
import squareGrid from '@turf/square-grid'

const NYC_BBOX = [-74.27, 40.49, -73.68, 40.92]
const DEFAULT_CELL_SIZE_KM = 0.75
const INFRA_DECAY_KM = 1.0
function binByCell(features, originLng, originLat, dLng, dLat, maxLng, maxLat) {
  const bins = new Map()
  for (const f of features) {
    const c = f?.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) continue
    const [lng, lat] = c
    if (lng < originLng || lng > maxLng || lat < originLat || lat > maxLat) continue
    const col = Math.floor((lng - originLng) / dLng)
    const row = Math.floor((lat - originLat) / dLat)
    const key = `${col}|${row}`
    bins.set(key, (bins.get(key) ?? 0) + 1)
  }
  return bins
}
function minMaxScaler(values) {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const range = hi - lo
  if (!Number.isFinite(range) || range <= 0) return () => 0
  return (v) => (v - lo) / range
}
function pearson(xs, ys) {
  const n = xs.length
  if (n < 3 || ys.length !== n) return null
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
  }
  const mx = sx / n
  const my = sy / n
  let cov = 0
  let vx = 0
  let vy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    cov += dx * dy
    vx += dx * dx
    vy += dy * dy
  }
  if (vx === 0 || vy === 0) return null
  return cov / Math.sqrt(vx * vy)
}
const FACTOR_KEYS = ['crime', 'crash', 'complaint', 'infra']
const FACTOR_NORM_PROP = {
  crime: 'crimeNorm',
  crash: 'crashNorm',
  complaint: 'complaintNorm',
  infra: 'infraNorm',
}
const FACTOR_LABELS = {
  crime: 'Crime',
  crash: 'Crashes',
  complaint: '311 reports',
  infra: 'CSO proximity',
}
const FACTOR_SHORT = {
  crime: 'Crime',
  crash: 'Crash',
  complaint: '311',
  infra: 'CSO',
}

function describeStrength(absR) {
  if (absR >= 0.7) return 'strong'
  if (absR >= 0.4) return 'moderate'
  if (absR >= 0.2) return 'weak'
  return 'negligible'
}
function buildInsights(pairs) {
  const insights = []
  if (!pairs.length) return insights

  const top = pairs[0]
  const topAbs = Math.abs(top.r)
  const direction = top.r > 0 ? 'rise together' : 'move inversely'
  const strength = describeStrength(topAbs)
  const aLabel = FACTOR_LABELS[top.a].toLowerCase()
  const bLabel = FACTOR_LABELS[top.b].toLowerCase()
  const guidance =
    topAbs >= 0.6
      ? ' Weighting both heavily double-counts the same signal — consider easing one slider.'
      : topAbs >= 0.3
        ? ' They share a common driver (likely population or activity density) but each still carries its own signal.'
        : ''
  insights.push({
    kind: 'strongest',
    text: `${capitalize(aLabel)} and ${bLabel} ${direction} most strongly (r = ${top.r.toFixed(2)}, ${strength}).${guidance}`,
  })
  const infraPair = pairs.find(
    (p) => (p.a === 'infra' || p.b === 'infra') && Math.abs(p.r) >= 0.25,
  )
  if (infraPair && infraPair !== top) {
    const otherKey = infraPair.a === 'infra' ? infraPair.b : infraPair.a
    const otherLabel = FACTOR_LABELS[otherKey].toLowerCase()
    const verb = infraPair.r > 0 ? 'cluster near' : 'shy away from'
    insights.push({
      kind: 'infrastructure',
      text: `${capitalize(otherLabel)} ${verb} sewer infrastructure (r = ${infraPair.r.toFixed(2)}). The pipe-proximity panel shows the same corridor effect from the opposite angle.`,
    })
  }
  const weakest = pairs[pairs.length - 1]
  if (weakest && weakest !== top && Math.abs(weakest.r) < 0.2) {
    const aL = FACTOR_LABELS[weakest.a].toLowerCase()
    const bL = FACTOR_LABELS[weakest.b].toLowerCase()
    insights.push({
      kind: 'independence',
      text: `${capitalize(aL)} and ${bL} are nearly independent (r = ${weakest.r.toFixed(2)}) — each contributes a distinct dimension of risk to the composite.`,
    })
  }

  return insights.slice(0, 3)
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function useUrbanRisk({
  crime = [],
  collisions = [],
  complaints = [],
  csoFeatures = [],
  weights,
  cellSizeKm = DEFAULT_CELL_SIZE_KM,
  enabled = true,
}) {
  const baseCells = useMemo(() => {
    if (!enabled) return null

    const [minLng, minLat, maxLng, maxLat] = NYC_BBOX
    const cells = squareGrid(NYC_BBOX, cellSizeKm, { units: 'kilometers' })
    if (!cells.features.length) return []

    const latMid = (minLat + maxLat) / 2
    const dLat = cellSizeKm / 111.0
    const dLng = cellSizeKm / (111.0 * Math.cos((latMid * Math.PI) / 180))

    const crimeBins = binByCell(crime, minLng, minLat, dLng, dLat, maxLng, maxLat)
    const crashBins = binByCell(collisions, minLng, minLat, dLng, dLat, maxLng, maxLat)
    const complaintBins = binByCell(complaints, minLng, minLat, dLng, dLat, maxLng, maxLat)

    const csoCoords = []
    for (const f of csoFeatures) {
      const c = f?.geometry?.coordinates
      if (Array.isArray(c) && c.length >= 2) csoCoords.push(c)
    }
    const enriched = cells.features.map((cell, i) => {
      const ring = cell.geometry.coordinates[0]
      const cx = (ring[0][0] + ring[1][0] + ring[2][0] + ring[3][0]) / 4
      const cy = (ring[0][1] + ring[1][1] + ring[2][1] + ring[3][1]) / 4

      const col = Math.floor((cx - minLng) / dLng)
      const row = Math.floor((cy - minLat) / dLat)
      const key = `${col}|${row}`

      const crimeCount = crimeBins.get(key) ?? 0
      const crashCount = crashBins.get(key) ?? 0
      const complaintCount = complaintBins.get(key) ?? 0
      let minD2 = Infinity
      const cosLat = Math.cos((cy * Math.PI) / 180)
      for (let k = 0; k < csoCoords.length; k++) {
        const dxKm = (csoCoords[k][0] - cx) * 111 * cosLat
        const dyKm = (csoCoords[k][1] - cy) * 111
        const d2 = dxKm * dxKm + dyKm * dyKm
        if (d2 < minD2) minD2 = d2
      }
      const csoDistKm = Number.isFinite(minD2) ? Math.sqrt(minD2) : Infinity
      const infraRaw = Number.isFinite(csoDistKm)
        ? Math.exp(-csoDistKm / INFRA_DECAY_KM)
        : 0

      return {
        type: 'Feature',
        geometry: cell.geometry,
        properties: {
          cellId: i,
          crimeCount,
          crashCount,
          complaintCount,
          csoDistKm,
          infraRaw,
        },
      }
    })
    const nCrime = minMaxScaler(enriched.map((c) => c.properties.crimeCount))
    const nCrash = minMaxScaler(enriched.map((c) => c.properties.crashCount))
    const nComplaint = minMaxScaler(enriched.map((c) => c.properties.complaintCount))
    const nInfra = minMaxScaler(enriched.map((c) => c.properties.infraRaw))

    for (const c of enriched) {
      const p = c.properties
      p.crimeNorm = nCrime(p.crimeCount)
      p.crashNorm = nCrash(p.crashCount)
      p.complaintNorm = nComplaint(p.complaintCount)
      p.infraNorm = nInfra(p.infraRaw)
    }

    return enriched
  }, [enabled, cellSizeKm, crime, collisions, complaints, csoFeatures])
  const correlations = useMemo(() => {
    if (!baseCells || baseCells.length === 0) return null

    const cells = baseCells.filter((c) => {
      const p = c.properties
      return p.crimeCount + p.crashCount + p.complaintCount > 0
    })
    if (cells.length < 5) return null
    const series = {}
    for (const key of FACTOR_KEYS) {
      const prop = FACTOR_NORM_PROP[key]
      const arr = new Array(cells.length)
      for (let i = 0; i < cells.length; i++) arr[i] = cells[i].properties[prop]
      series[key] = arr
    }
    const matrix = FACTOR_KEYS.map((a, i) =>
      FACTOR_KEYS.map((b, j) => {
        if (i === j) return 1
        if (j < i) return null // fill in second pass via mirror
        return pearson(series[a], series[b])
      }),
    )
    for (let i = 0; i < FACTOR_KEYS.length; i++) {
      for (let j = 0; j < i; j++) matrix[i][j] = matrix[j][i]
    }
    const pairs = []
    for (let i = 0; i < FACTOR_KEYS.length; i++) {
      for (let j = i + 1; j < FACTOR_KEYS.length; j++) {
        const r = matrix[i][j]
        if (r != null && Number.isFinite(r)) {
          pairs.push({ a: FACTOR_KEYS[i], b: FACTOR_KEYS[j], r })
        }
      }
    }
    pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r))

    return {
      factors: FACTOR_KEYS,
      labels: FACTOR_LABELS,
      shortLabels: FACTOR_SHORT,
      matrix,
      pairs,
      insights: buildInsights(pairs),
      n: cells.length,
    }
  }, [baseCells])
  const featureCollection = useMemo(() => {
    if (!baseCells || !baseCells.length) {
      return { type: 'FeatureCollection', features: [] }
    }

    const wRaw = {
      crime: Math.max(0, weights?.crime ?? 0),
      crash: Math.max(0, weights?.crash ?? 0),
      complaint: Math.max(0, weights?.complaint ?? 0),
      infra: Math.max(0, weights?.infra ?? 0),
    }
    const wSum = wRaw.crime + wRaw.crash + wRaw.complaint + wRaw.infra
    const w =
      wSum > 0
        ? {
            crime: wRaw.crime / wSum,
            crash: wRaw.crash / wSum,
            complaint: wRaw.complaint / wSum,
            infra: wRaw.infra / wSum,
          }
        : { crime: 0, crash: 0, complaint: 0, infra: 0 }

    const features = []
    for (const c of baseCells) {
      const p = c.properties
      if (p.crimeCount === 0 && p.crashCount === 0 && p.complaintCount === 0) continue

      const risk =
        w.crime * p.crimeNorm +
        w.crash * p.crashNorm +
        w.complaint * p.complaintNorm +
        w.infra * p.infraNorm

      features.push({
        type: 'Feature',
        geometry: c.geometry,
        properties: { ...p, risk },
      })
    }

    return { type: 'FeatureCollection', features }
  }, [baseCells, weights?.crime, weights?.crash, weights?.complaint, weights?.infra])

  return { featureCollection, correlations }
}
