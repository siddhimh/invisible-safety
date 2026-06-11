import { useMemo } from 'react'

// Ranks CSO outfalls by how much nearby "storm story" there is to show
// in AR: 311 complaint density blended with the local urban-risk peak.
// Same coarse lat/lng binning trick as useUrbanRisk's binByCell, and
// the same 0.6 complaints / 0.4 risk blend the basin factor uses.

const CELL_M = 250
const NEIGHBORHOOD = 2 // 5×5 cells ≈ ±500 m
const MAX_HOTSPOTS = 12
const LAT_MID = 40.7 // NYC — fine for a ranking heuristic

const D_LAT = CELL_M / 111000
const D_LNG = CELL_M / (111000 * Math.cos((LAT_MID * Math.PI) / 180))

function binKey(col, row) {
  return col + '|' + row
}

export function useArHotspots({ csoFeatures = [], complaints = [], riskGeoJson }) {
  return useMemo(() => {
    const riskFeatures = riskGeoJson?.features ?? []
    const ready = csoFeatures.length > 0 && riskFeatures.length > 0
    if (!ready) return { hotspots: [], ready: false }

    const complaintBins = new Map()
    for (const f of complaints) {
      const c = f?.geometry?.coordinates
      if (!Array.isArray(c) || c.length < 2) continue
      const key = binKey(Math.floor(c[0] / D_LNG), Math.floor(c[1] / D_LAT))
      complaintBins.set(key, (complaintBins.get(key) ?? 0) + 1)
    }

    // Max risk per bin (cells are bigger than bins, centroid is enough
    // for a ranking).
    const riskBins = new Map()
    for (const f of riskFeatures) {
      const ring = f?.geometry?.coordinates?.[0]
      if (!ring || ring.length < 4) continue
      const cx = (ring[0][0] + ring[1][0] + ring[2][0] + ring[3][0]) / 4
      const cy = (ring[0][1] + ring[1][1] + ring[2][1] + ring[3][1]) / 4
      const key = binKey(Math.floor(cx / D_LNG), Math.floor(cy / D_LAT))
      const risk = f.properties?.risk ?? 0
      if (risk > (riskBins.get(key) ?? 0)) riskBins.set(key, risk)
    }

    const scored = []
    for (const f of csoFeatures) {
      const c = f?.geometry?.coordinates
      if (!Array.isArray(c) || c.length < 2) continue
      const col = Math.floor(c[0] / D_LNG)
      const row = Math.floor(c[1] / D_LAT)

      let complaintsNear = 0
      let riskNear = 0
      for (let i = -NEIGHBORHOOD; i <= NEIGHBORHOOD; i++) {
        for (let j = -NEIGHBORHOOD; j <= NEIGHBORHOOD; j++) {
          const key = binKey(col + i, row + j)
          complaintsNear += complaintBins.get(key) ?? 0
          const risk = riskBins.get(key) ?? 0
          if (risk > riskNear) riskNear = risk
        }
      }

      const p = f.properties ?? {}
      scored.push({
        feature: f,
        id: String(p.spdes ?? p.SPDES ?? 'CSO'),
        waterbody: p.Waterbody ?? '',
        receives: p.Waterbod_1 ?? '',
        complaintsNear,
        riskNear,
        score: 0,
      })
    }

    let maxComplaints = 0
    for (const s of scored) {
      if (s.complaintsNear > maxComplaints) maxComplaints = s.complaintsNear
    }
    for (const s of scored) {
      const cNorm = maxComplaints > 0 ? s.complaintsNear / maxComplaints : 0
      s.score = 0.6 * cNorm + 0.4 * s.riskNear
    }

    const hotspots = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_HOTSPOTS)

    return { hotspots, ready: true }
  }, [csoFeatures, complaints, riskGeoJson])
}
