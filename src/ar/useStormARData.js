import { useEffect, useMemo, useState } from 'react'
import {
  AR_RADIUS_M,
  featureCenter,
  lineFeatureBbox,
  lngLatToLocalMeters,
  withinRadius,
} from './projection'
import { vulnerabilityOf } from './stormModel'

// Aggressive caps — the scene must stay readable from a tabletop and
// light enough for the Quest browser. We summarize, never render raw.
const MAX_BASINS = 6
const MAX_PIPES = 8
const MAX_CSOS = 12
const MAX_CLUSTERS = 40
const MAX_CELLS = 60

const SEWERSHED_URL = 'data/sewershed.geojson'

const CLUSTER_CELL_M = 45 // grid pitch for collapsing raw complaints
const COMPLAINT_RADIUS_M = 160 // "near a CSO" radius for the complaint factor
const RISK_RADIUS_M = 130 // risk-cell sampling radius around a CSO
const INFRA_RADIUS_M = 180 // pipe-proximity radius for the infra factor
const MAX_RING_POINTS = 72 // sampled vertices per basin ring (perf)

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function cellCentroid(feature) {
  const ring = feature?.geometry?.coordinates?.[0]
  if (!ring || ring.length < 4) return null
  return [
    (ring[0][0] + ring[1][0] + ring[2][0] + ring[3][0]) / 4,
    (ring[0][1] + ring[1][1] + ring[2][1] + ring[3][1]) / 4,
  ]
}

// Sample a line feature into local-meter polylines with arc length.
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

// Largest outer ring of a Polygon / MultiPolygon, projected + sampled
// to a manageable point count in local meters.
function basinRingToLocal(feature, center) {
  const g = feature?.geometry
  if (!g) return null
  let rings = null
  if (g.type === 'Polygon') rings = [g.coordinates?.[0]]
  else if (g.type === 'MultiPolygon') {
    // pick the polygon with the most vertices (≈ largest)
    let best = null
    let bestLen = 0
    for (const poly of g.coordinates ?? []) {
      const outer = poly?.[0]
      if (outer && outer.length > bestLen) {
        bestLen = outer.length
        best = outer
      }
    }
    rings = best ? [best] : null
  }
  const outer = rings?.[0]
  if (!outer || outer.length < 4) return null

  const step = Math.max(1, Math.floor(outer.length / MAX_RING_POINTS))
  const local = []
  let sx = 0
  let sz = 0
  for (let i = 0; i < outer.length; i += step) {
    const [x, z] = lngLatToLocalMeters(outer[i], center)
    local.push([x, z])
    sx += x
    sz += z
  }
  if (local.length < 3) return null
  return { ring: local, cx: sx / local.length, cz: sz / local.length }
}

function pointInRing(x, z, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const zi = ring[i][1]
    const xj = ring[j][0]
    const zj = ring[j][1]
    const intersect =
      zi > z !== zj > z &&
      x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-9) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function normalizeField(items, get, set) {
  let max = 0
  for (const it of items) {
    const v = get(it)
    if (v > max) max = v
  }
  const inv = max > 0 ? 1 / max : 0
  for (const it of items) set(it, clamp01(get(it) * inv))
}

export function useStormARData({
  enabled,
  selectedFeature,
  riskGeoJson,
  interceptorFeatures,
  complaints,
  csoFeatures,
}) {
  // Sewersheds aren't held in App state (Deck.gl streams them from the
  // URL), so the storm scene fetches them lazily once AR is opened.
  const [sewersheds, setSewersheds] = useState(null)
  useEffect(() => {
    if (!enabled || sewersheds) return
    let cancelled = false
    fetch(SEWERSHED_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((j) => {
        if (!cancelled) setSewersheds(j)
      })
      .catch((e) => console.error('storm AR: failed to load sewersheds', e))
    return () => {
      cancelled = true
    }
  }, [enabled, sewersheds])

  return useMemo(() => {
    if (!selectedFeature) return null
    const center = featureCenter(selectedFeature.object ?? selectedFeature)
    if (!center) return null

    // ── Risk cells (nearest MAX_CELLS within radius) ────────────────
    const cellCandidates = []
    for (const f of riskGeoJson?.features ?? []) {
      const centroid = cellCentroid(f)
      if (!centroid) continue
      if (!withinRadius(centroid, center)) continue
      const [x, z] = lngLatToLocalMeters(centroid, center)
      cellCandidates.push({ x, z, risk: f.properties?.risk ?? 0, d2: x * x + z * z })
    }
    cellCandidates.sort((a, b) => a.d2 - b.d2)
    const cells = cellCandidates
      .slice(0, MAX_CELLS)
      .map(({ x, z, risk }) => ({ x, z, risk }))

    // ── Raw nearby complaints (local) for clustering + factors ──────
    const rawComplaints = []
    for (const f of complaints ?? []) {
      const c = f?.geometry?.coordinates
      if (!Array.isArray(c) || c.length < 2) continue
      if (!withinRadius(c, center)) continue
      const [x, z] = lngLatToLocalMeters(c, center)
      rawComplaints.push({ x, z })
    }

    // Grid-cluster into <= MAX_CLUSTERS muted surface markers.
    const clusterMap = new Map()
    for (const p of rawComplaints) {
      const gx = Math.round(p.x / CLUSTER_CELL_M)
      const gz = Math.round(p.z / CLUSTER_CELL_M)
      const key = gx + ',' + gz
      const ex = clusterMap.get(key)
      if (ex) {
        ex.sx += p.x
        ex.sz += p.z
        ex.count += 1
      } else {
        clusterMap.set(key, { sx: p.x, sz: p.z, count: 1 })
      }
    }
    let clusters = Array.from(clusterMap.values()).map((c) => ({
      x: c.sx / c.count,
      z: c.sz / c.count,
      count: c.count,
    }))
    clusters.sort((a, b) => b.count - a.count)
    clusters = clusters.slice(0, MAX_CLUSTERS)

    // ── Pipes (trunk-line segments) ─────────────────────────────────
    const pipes = []
    for (const f of interceptorFeatures ?? []) {
      if (pipes.length >= MAX_PIPES) break
      if (!lineIntersectsRadius(f, center)) continue
      for (const seg of sampleLineToLocal(f, center)) {
        if (pipes.length >= MAX_PIPES) break
        if (seg.length < 5) continue // drop stubs
        pipes.push(seg)
      }
    }

    // ── Sewershed basins (nearest MAX_BASINS intersecting radius) ───
    const basinCandidates = []
    for (const f of sewersheds?.features ?? []) {
      const local = basinRingToLocal(f, center)
      if (!local) continue
      const cd2 = local.cx * local.cx + local.cz * local.cz
      // keep basins whose centroid or any vertex is reasonably close
      let near = cd2 <= (AR_RADIUS_M * 1.6) ** 2
      if (!near) {
        for (const [x, z] of local.ring) {
          if (x * x + z * z <= AR_RADIUS_M * AR_RADIUS_M) {
            near = true
            break
          }
        }
      }
      if (!near) continue
      const props = f.properties ?? {}
      const name =
        props.sewershed ?? props.SEWERSHED ?? props.name ?? props.Name ?? null
      basinCandidates.push({ ...local, name, d2: cd2 })
    }
    basinCandidates.sort((a, b) => a.d2 - b.d2)
    const basins = basinCandidates.slice(0, MAX_BASINS).map((b, i) => ({
      id: i,
      name: b.name ?? `Basin ${i + 1}`,
      ring: b.ring,
      cx: b.cx,
      cz: b.cz,
      complaintCount: 0,
      riskSum: 0,
      riskCount: 0,
      basinFactor: 0,
      vulnerability: 0,
    }))

    // Tally complaints + risk into the basins (local point-in-ring).
    for (const p of rawComplaints) {
      for (const b of basins) {
        if (pointInRing(p.x, p.z, b.ring)) {
          b.complaintCount += 1
          break
        }
      }
    }
    for (const cell of cells) {
      for (const b of basins) {
        if (pointInRing(cell.x, cell.z, b.ring)) {
          b.riskSum += cell.risk
          b.riskCount += 1
          break
        }
      }
    }
    // Basin factor blends its complaint load with its mean risk.
    let maxBasinComplaints = 0
    for (const b of basins) {
      if (b.complaintCount > maxBasinComplaints) maxBasinComplaints = b.complaintCount
    }
    for (const b of basins) {
      const cNorm = maxBasinComplaints > 0 ? b.complaintCount / maxBasinComplaints : 0
      const rMean = b.riskCount > 0 ? b.riskSum / b.riskCount : 0
      b.basinFactor = clamp01(0.6 * cNorm + 0.4 * rMean)
      b.vulnerability = b.basinFactor
    }

    // ── CSO outfalls (nearest MAX_CSOS) + per-node factors ──────────
    const csoCandidates = []
    let idx = 0
    for (const f of csoFeatures ?? []) {
      const c = f?.geometry?.coordinates
      if (!Array.isArray(c) || c.length < 2) continue
      if (!withinRadius(c, center)) continue
      const [x, z] = lngLatToLocalMeters(c, center)
      const props = f.properties ?? {}
      const id =
        props.spdes ?? props.SPDES ?? props.outfall ?? props.id ?? `CSO-${idx + 1}`
      csoCandidates.push({ x, z, id: String(id), d2: x * x + z * z })
      idx += 1
    }
    csoCandidates.sort((a, b) => a.d2 - b.d2)
    const csoList = csoCandidates.slice(0, MAX_CSOS)

    const csos = csoList.map((c) => {
      // complaint factor: nearby raw complaint count
      let complaintNear = 0
      for (const p of rawComplaints) {
        const dx = p.x - c.x
        const dz = p.z - c.z
        if (dx * dx + dz * dz <= COMPLAINT_RADIUS_M * COMPLAINT_RADIUS_M) complaintNear += 1
      }
      // risk factor: max risk cell within radius
      let riskNear = 0
      for (const cell of cells) {
        const dx = cell.x - c.x
        const dz = cell.z - c.z
        if (dx * dx + dz * dz <= RISK_RADIUS_M * RISK_RADIUS_M) {
          if (cell.risk > riskNear) riskNear = cell.risk
        }
      }
      // infra factor: nearest-pipe proximity (closer trunk line → higher)
      let nearestPipe2 = Infinity
      for (const seg of pipes) {
        const flat = seg.flat
        for (let i = 0; i < flat.length / 2; i++) {
          const dx = flat[i * 2] - c.x
          const dz = flat[i * 2 + 1] - c.z
          const d2 = dx * dx + dz * dz
          if (d2 < nearestPipe2) nearestPipe2 = d2
        }
      }
      let infra = 0
      if (nearestPipe2 < Infinity) {
        const d = Math.sqrt(nearestPipe2)
        infra = clamp01(1 - d / INFRA_RADIUS_M)
      }
      // basin factor: containing basin (else nearest centroid)
      let basinFactor = 0
      let basinId = -1
      for (const b of basins) {
        if (pointInRing(c.x, c.z, b.ring)) {
          basinFactor = b.basinFactor
          basinId = b.id
          break
        }
      }
      if (basinId === -1 && basins.length) {
        let best = null
        let bestD = Infinity
        for (const b of basins) {
          const dx = b.cx - c.x
          const dz = b.cz - c.z
          const d2 = dx * dx + dz * dz
          if (d2 < bestD) {
            bestD = d2
            best = b
          }
        }
        if (best) {
          basinFactor = best.basinFactor
          basinId = best.id
        }
      }
      return {
        x: c.x,
        z: c.z,
        id: c.id,
        basinId,
        rawComplaintNear: complaintNear,
        factors: { basin: basinFactor, infra, complaint: 0, risk: riskNear },
      }
    })

    // Normalize the complaint factor across CSOs (risk & infra & basin
    // are already in 0..1).
    normalizeField(
      csos,
      (c) => c.rawComplaintNear,
      (c, v) => {
        c.factors.complaint = v
      },
    )
    for (const c of csos) c.vulnerability = vulnerabilityOf(c.factors)

    // Most-stressed outfall is intensity-independent (ordering is fixed),
    // so compute it once for the floating label.
    let mostStressed = -1
    let topVuln = -1
    for (let i = 0; i < csos.length; i++) {
      if (csos[i].vulnerability > topVuln) {
        topVuln = csos[i].vulnerability
        mostStressed = i
      }
    }

    return {
      center,
      basins,
      pipes,
      csos,
      clusters,
      cells,
      mostStressed,
      counts: {
        basins: basins.length,
        pipes: pipes.length,
        csos: csos.length,
        clusters: clusters.length,
        cells: cells.length,
      },
    }
  }, [selectedFeature, riskGeoJson, interceptorFeatures, complaints, csoFeatures, sewersheds])
}
