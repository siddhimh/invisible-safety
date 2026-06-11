import { useEffect, useState } from 'react'

const INTERCEPTORS_URL = 'data/interceptors_force_mains.geojson'

// Lazy one-shot fetch of the trunk-line geometry the AR scene renders.
// (The old useProximityAnalysis did this plus a pile of 2D-only turf
// work; the AR pipeline only ever consumed the raw features.)
export function useInterceptors({ enabled = true } = {}) {
  const [interceptors, setInterceptors] = useState(null)

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
      .catch((e) => console.error('interceptors: failed to load', e))
    return () => {
      cancelled = true
    }
  }, [enabled, interceptors])

  return { interceptorFeatures: interceptors?.features ?? [] }
}
