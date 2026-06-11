import { useEffect, useState } from 'react'

import { useUrbanRisk } from './hooks/useUrbanRisk'
import { useInterceptors } from './hooks/useInterceptors'
import { useArHotspots } from './hooks/useArHotspots'
import { HotspotList } from './components/HotspotList'
import { UnsupportedScreen } from './components/UnsupportedScreen'
import { ARPreview } from './components/ARPreview'

import './App.css'
import CONFIG from './utils/config'

const { DATASETS } = CONFIG

// Fixed equal weights — the slider UI went away with the 2D map.
const RISK_WEIGHTS = { crime: 25, crash: 25, complaint: 25, infra: 25 }

const hasValidPoint = (f) => {
  const c = f?.geometry?.coordinates
  if (!Array.isArray(c) || c.length < 2) return false
  const [lng, lat] = c
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    Math.abs(lng) <= 180 &&
    Math.abs(lat) <= 90
  )
}

function App() {
  const [complaints, setComplaints] = useState([])
  const [csoFeatures, setCsoFeatures] = useState([])
  const [collisionFeatures, setCollisionFeatures] = useState([])
  const [crimeFeatures, setCrimeFeatures] = useState([])
  const [dataStatus, setDataStatus] = useState(() =>
    Object.fromEntries(DATASETS.map((d) => [d.key, 'loading'])),
  )

  // 'checking' | true | false. `?forceList` skips the probe so the
  // hotspot list can be exercised on desktop.
  const [xrSupport, setXrSupport] = useState('checking')
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('forceList')) {
      setXrSupport(true)
      return
    }
    let cancelled = false
    if (typeof navigator !== 'undefined' && navigator.xr?.isSessionSupported) {
      navigator.xr
        .isSessionSupported('immersive-ar')
        .then((ok) => {
          if (!cancelled) setXrSupport(!!ok)
        })
        .catch(() => {
          if (!cancelled) setXrSupport(false)
        })
    } else {
      setXrSupport(false)
    }
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const setters = {
      complaints: setComplaints,
      cso:        setCsoFeatures,
      collisions: setCollisionFeatures,
      crime:      setCrimeFeatures,
    }

    DATASETS.forEach(({ key, url }) => {
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`)
          return r.json()
        })
        .then((json) => {
          if (cancelled) return
          const features = (json.features ?? []).filter(hasValidPoint)
          const dropped = (json.features?.length ?? 0) - features.length
          if (dropped > 0) {
            console.warn(`${url}: dropped ${dropped} feature(s) with invalid coordinates`)
          }
          setters[key](features)
          setDataStatus((s) => ({ ...s, [key]: 'loaded' }))
        })
        .catch((err) => {
          console.error('Failed to load', url, err)
          if (!cancelled) setDataStatus((s) => ({ ...s, [key]: 'error' }))
        })
    })

    return () => {
      cancelled = true
    }
  }, [])

  const { featureCollection: riskGeoJson } = useUrbanRisk({
    crime: crimeFeatures,
    collisions: collisionFeatures,
    complaints,
    csoFeatures,
    weights: RISK_WEIGHTS,
    enabled: xrSupport === true,
  })

  const { interceptorFeatures } = useInterceptors({ enabled: xrSupport === true })

  const { hotspots, ready: hotspotsReady } = useArHotspots({
    csoFeatures,
    complaints,
    riskGeoJson,
  })

  // The AR anchor: `{ object: <GeoJSON Point feature> }` is all
  // useStormARData needs; `hotspot` rides along for the splash card.
  const [anchor, setAnchor] = useState(null)

  if (xrSupport === false) return <UnsupportedScreen />

  const erroredDatasets = DATASETS.filter((d) => dataStatus[d.key] === 'error')

  return (
    <div className="app-shell">
      <HotspotList
        hotspots={hotspots}
        loading={xrSupport === 'checking' || !hotspotsReady}
        error={
          erroredDatasets.length > 0
            ? erroredDatasets.map((d) => d.label).join(' · ')
            : null
        }
        onSelect={(hotspot) =>
          setAnchor({ object: hotspot.feature, layerId: 'cso-locations', hotspot })
        }
      />

      <ARPreview
        open={!!anchor}
        onClose={() => setAnchor(null)}
        selectedFeature={anchor}
        riskGeoJson={riskGeoJson}
        interceptorFeatures={interceptorFeatures}
        complaints={complaints}
        csoFeatures={csoFeatures}
      />
    </div>
  )
}

export default App
