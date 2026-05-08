import { useCallback, useEffect, useMemo, useState } from 'react'
import { DeckGL } from '@deck.gl/react'
import { FlyToInterpolator } from 'deck.gl'
import { Map, Layer } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import buffer from '@turf/buffer'
import bbox from '@turf/bbox'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'

import { sewershedsLayer } from './layers/sewersheds'
import { interceptorsLayer } from './layers/interceptors'
import { combinedSeparateSewerLayer } from './layers/combinedSeparateSewer'
import { crimeHeatmapLayer } from './layers/crimeHeatmap'
import { collisionsLayer } from './layers/collisions'
import { complaints311Layer } from './layers/complaints311'
import { csoLocationsLayer, csoGlowLayer } from './layers/csoLocations'
import { urbanRiskLayer } from './layers/urbanRisk'
import { interceptorBufferLayer, interceptorBufferGlowLayer} from './layers/interceptorBuffer'
import { proximityRingLayer } from './layers/proximityRing'
import { searchPinLayer } from './layers/searchPin'
import { selectionHighlightLayer } from './layers/selectionHighlight'
import { surfaceHotspotsLayer } from './layers/surfaceHotspots'
import { useUrbanRisk } from './hooks/useUrbanRisk'
import { useProximityAnalysis } from './hooks/useProximityAnalysis'
import { useInfrastructure } from './hooks/useInfrastructure'
import { useSurfaceHotspots } from './hooks/useSurfaceHotspots'
import { UrbanRiskControls, DEFAULT_WEIGHTS } from './components/UrbanRiskControls'
import { ProximityStats } from './components/ProximityStats'
import { SummaryStats } from './components/SummaryStats'
import { SearchBox } from './components/SearchBox'
import { YearRangeControl } from './components/YearRangeControl'
import { ModeSelector } from './components/ModeSelector'
import { LayerLegend } from './components/LayerLegend'
import { FeatureInspector } from './components/FeatureInspector'
import { InfrastructureInspector } from './components/InfrastructureInspector'
import { SurfaceRiskInspector } from './components/SurfaceRiskInspector'
import { StreetViewGuide } from './components/StreetViewGuide'
import { ARPreview } from './components/ARPreview'

import './App.css'
import CONFIG from './utils/config'

const {
  MAPBOX_TOKEN,
  INITIAL_VIEW_STATE,
  STREET_VIEW_VIEW_STATE,
  MAP_STYLE,
  BUILDINGS_3D_LAYER,
  BUILDINGS_OPACITY_BY_MODE,
  LAYER_META,
  ANALYSIS_MODES,
  DEFAULT_MODE_ID, PROXIMITY_BUFFER_M, ZOOM_BY_LAYER, ZOOM_BY_LAYER_BY_MODE, DATASETS
} = CONFIG

function visibilityForMode(modeId) {
  const mode =
    ANALYSIS_MODES.find((m) => m.id === modeId) ?? ANALYSIS_MODES[0]
  return Object.fromEntries(LAYER_META.map((m) => [m.id, mode.layers.has(m.id)]))
}

function getFeatureCenter(info) {
  const g = info?.object?.geometry
  if (!g) return info?.coordinate
  if (g.type === 'Point') return g.coordinates
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
    const ring =
      g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0]?.[0]
    if (!ring?.length) return info.coordinate
    let sx = 0
    let sy = 0
    for (let i = 0; i < ring.length; i++) {
      sx += ring[i][0]
      sy += ring[i][1]
    }
    return [sx / ring.length, sy / ring.length]
  }
  return info.coordinate
}

function makeGetTooltip({ proximityInsideSet, proximityActive }) {
  return function getTooltip({ layer, object }) {
    if (!object) return null
    const id = layer?.id
    const p = object.properties ?? {}

    if (id === 'collisions') {
      return {
        text:
          `Collision\n` +
          `${p.date ?? ''}\n` +
          `Factor: ${p.factor ?? 'unknown'}\n` +
          `Injured: ${p.injured ?? 0} · Killed: ${p.killed ?? 0}`,
      }
    }
    if (id === '311-complaints') {
      const inBuffer =
        proximityActive && proximityInsideSet?.has(object) ? '\n• In pipe corridor' : ''
      return {
        text:
          `311 — ${p.type ?? 'complaint'}\n` +
          (p.descriptor ? `${p.descriptor}\n` : '') +
          `${p.date ?? ''}\n` +
          `Status: ${p.status ?? 'unknown'}` +
          inBuffer,
      }
    }
    if (id === 'cso-locations') {
      return {
        text:
          `CSO outfall ${p.spdes ?? ''}\n` +
          (p.Waterbody ? `Waterbody: ${p.Waterbody}\n` : '') +
          (p.Waterbod_1 ? `Receives: ${p.Waterbod_1}` : ''),
      }
    }
    if (id === 'interceptors') {
      return { text: 'Sewer interceptor / force main' }
    }
    if (id === 'urban-risk') {
      const fmt = (v) => (v * 100).toFixed(0) + '%'
      return {
        text:
          `Urban Risk Index: ${fmt(p.risk ?? 0)}\n` +
          `\n` +
          `Crime:       ${p.crimeCount} (norm ${fmt(p.crimeNorm ?? 0)})\n` +
          `Crashes:     ${p.crashCount} (norm ${fmt(p.crashNorm ?? 0)})\n` +
          `311 reports: ${p.complaintCount} (norm ${fmt(p.complaintNorm ?? 0)})\n` +
          `CSO infra:   ${(p.csoDistKm ?? 0).toFixed(2)} km away (norm ${fmt(p.infraNorm ?? 0)})`,
      }
    }
    if (id === 'surface-hotspots') {
      const dominantLabel = {
        crime: 'crime',
        crash: 'crashes',
        complaint: '311',
      }[p.dominant] ?? p.dominant ?? '—'
      const fatalLine =
        (p.crashFatal ?? 0) > 0 ? `\n• ${p.crashFatal} fatal crash${p.crashFatal === 1 ? '' : 'es'}` : ''
      return {
        text:
          `Hotspot #${p.rank}\n` +
          `Dominant: ${dominantLabel}\n` +
          `\n` +
          `Crime:       ${p.crimeCount}\n` +
          `Crashes:     ${p.crashCount}\n` +
          `311 reports: ${p.complaintCount}` +
          fatalLine,
      }
    }
    return null
  }
}

function App() {
  const [complaints, setComplaints] = useState([])
  const [csoFeatures, setCsoFeatures] = useState([])
  const [collisionFeatures, setCollisionFeatures] = useState([])
  const [crimeFeatures, setCrimeFeatures] = useState([])
  const [dataStatus, setDataStatus] = useState(() =>
    Object.fromEntries(DATASETS.map((d) => [d.key, 'loading'])),
  )

  const [mode, setMode] = useState(DEFAULT_MODE_ID)
  const [visibility, setVisibility] = useState(() =>
    visibilityForMode(DEFAULT_MODE_ID),
  )
  const toggleLayer = (id) =>
    setVisibility((v) => ({ ...v, [id]: !v[id] }))
  const [selectedFeature, setSelectedFeature] = useState(null)
  const [hoveredFeature, setHoveredFeature] = useState(null)
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE)

  const handleModeChange = useCallback(
    (newMode) => {
      if (newMode === 'street-view' && mode !== 'street-view') {
        setViewState((vs) => ({
          ...vs,
          ...STREET_VIEW_VIEW_STATE,
          transitionDuration: 1800,
          transitionInterpolator: new FlyToInterpolator({ speed: 1.2 }),
        }))
      } else if (mode === 'street-view' && newMode !== 'street-view') {
        setViewState((vs) => ({
          ...vs,
          ...INITIAL_VIEW_STATE,
          transitionDuration: 1500,
          transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
        }))
      }
      setMode(newMode)
      setVisibility(visibilityForMode(newMode))
      setSelectedFeature(null)
      setHoveredFeature(null)
    },
    [mode],
  )

  const [searchedLocation, setSearchedLocation] = useState(null)

  const flyToLocation = useCallback((loc) => {
    setSearchedLocation(loc)
    setViewState((vs) => ({
      ...vs,
      longitude: loc.longitude,
      latitude: loc.latitude,
      zoom: 14,
      transitionDuration: 1500,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
    }))
  }, [])

  const flyToFeature = useCallback((coordinate, targetZoom) => {
    if (!coordinate) return
    const [lng, lat] = coordinate
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
    setViewState((vs) => ({
      ...vs,
      longitude: lng,
      latitude: lat,
      zoom: targetZoom ?? vs.zoom,
      transitionDuration: 900,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.6 }),
    }))
  }, [])

  const handleMapClick = useCallback(
    (info) => {
      const layerId = info?.layer?.id
      if (!layerId || !info?.object) return
      const modeOverrides = ZOOM_BY_LAYER_BY_MODE[mode]
      const targetZoom = modeOverrides?.[layerId] ?? ZOOM_BY_LAYER[layerId]
      if (!targetZoom) return

      const center = getFeatureCenter(info)
      setSelectedFeature({
        layerId,
        object: info.object,
        featureIndex: typeof info.index === 'number' ? info.index : null,
        coordinate: center,
      })
      flyToFeature(center, targetZoom)
    },
    [flyToFeature, mode],
  )

  const handleMapHover = useCallback((info) => {
    const layerId = info?.layer?.id
    if (!layerId || !info?.object) {
      setHoveredFeature(null)
      return
    }
    if (layerId !== 'interceptors' && layerId !== 'cso-locations') {
      setHoveredFeature(null)
      return
    }
    setHoveredFeature({
      layerId,
      object: info.object,
      featureIndex: typeof info.index === 'number' ? info.index : null,
    })
  }, [])

  const [riskWeights, setRiskWeights] = useState(DEFAULT_WEIGHTS)

  const [arOpen, setArOpen] = useState(false)
  const [arSupported, setArSupported] = useState(false)
  useEffect(() => {
    let cancelled = false
    if (typeof navigator !== 'undefined' && navigator.xr?.isSessionSupported) {
      navigator.xr
        .isSessionSupported('immersive-ar')
        .then((ok) => {
          if (!cancelled) setArSupported(!!ok)
        })
        .catch(() => {
          if (!cancelled) setArSupported(false)
        })
    }
    return () => {
      cancelled = true
    }
  }, [])

  const [yearRange, setYearRange] = useState(null)

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

  const yearBounds = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const arr of [crimeFeatures, collisionFeatures, complaints]) {
      for (const f of arr) {
        const y = f.properties?.year
        if (Number.isFinite(y)) {
          if (y < lo) lo = y
          if (y > hi) hi = y
        }
      }
    }
    return Number.isFinite(lo) ? [lo, hi] : null
  }, [crimeFeatures, collisionFeatures, complaints])

  useEffect(() => {
    if (yearBounds && !yearRange) setYearRange(yearBounds)
  }, [yearBounds, yearRange])

  const filterByYear = (features) => {
    if (!yearRange) return features
    const [lo, hi] = yearRange
    return features.filter((f) => {
      const y = f.properties?.year
      if (!Number.isFinite(y)) return true
      return y >= lo && y <= hi
    })
  }

  const filteredCrime = useMemo(
    () => filterByYear(crimeFeatures),
    [crimeFeatures, yearRange],
  )
  const filteredCollisions = useMemo(
    () => filterByYear(collisionFeatures),
    [collisionFeatures, yearRange],
  )
  const filteredComplaints = useMemo(
    () => filterByYear(complaints),
    [complaints, yearRange],
  )

  const { featureCollection: riskGeoJson, correlations: riskCorrelations } =
    useUrbanRisk({
      crime: filteredCrime,
      collisions: filteredCollisions,
      complaints: filteredComplaints,
      csoFeatures,
      weights: riskWeights,
      enabled: visibility['urban-risk'],
    })

  const proximity = useProximityAnalysis({
    complaints: filteredComplaints,
    bufferMeters: PROXIMITY_BUFFER_M,
    enabled: visibility['pipe-proximity'],
    preload: arOpen,
  })

  const infrastructure = useInfrastructure({
    enabled: mode === 'infrastructure',
    csoFeatures,
    complaints: filteredComplaints,
  })

  const { hotspots: surfaceHotspots, cityStats: surfaceCityStats } =
    useSurfaceHotspots({
      crime: filteredCrime,
      collisions: filteredCollisions,
      complaints: filteredComplaints,
      enabled: mode === 'surface-risk' || mode === 'street-view',
    })


  const infraHighlight = useMemo(() => {
    if (mode !== 'infrastructure' || !infrastructure) {
      return { active: false, interceptorSet: null, csoSet: null }
    }
    const active = hoveredFeature ?? selectedFeature
    if (!active) {
      return { active: false, interceptorSet: null, csoSet: null }
    }
    const interceptorSet = new Set()
    const csoSet = new Set()
    if (active.layerId === 'interceptors') {
      // Hovered/selected interceptor highlights itself and all CSOs
      // connected (within 600 m) to it.
      if (typeof active.featureIndex === 'number') {
        interceptorSet.add(active.featureIndex)
        const connected = infrastructure.interceptorToCsos.get(
          active.featureIndex,
        )
        if (connected) for (const c of connected) csoSet.add(c)
      }
    } else if (active.layerId === 'cso-locations') {
      // Hovered/selected outfall highlights itself plus its single
      // nearest interceptor segment.
      csoSet.add(active.object)
      const idx = infrastructure.csoToInterceptor.get(active.object)
      if (typeof idx === 'number') interceptorSet.add(idx)
    }
    return { active: true, interceptorSet, csoSet }
  }, [mode, infrastructure, hoveredFeature, selectedFeature])

  const isInfraMode = mode === 'infrastructure'
  const isPipeMode = mode === 'pipe-proximity'
  const isSurfaceMode = mode === 'surface-risk'
  const isStreetMode = mode === 'street-view'
  const interceptorPalette = isInfraMode
    ? 'infrastructure'
    : isPipeMode
      ? 'proximity'
      : 'default'
  const csoPalette = isInfraMode ? 'infrastructure' : 'default'
  const sewershedPalette = isInfraMode ? 'infrastructure' : 'default'

  const pipeProximityVisible = visibility['pipe-proximity']
  const selectedPipeNearby = useMemo(() => {
    if (!isPipeMode || !pipeProximityVisible) return null
    if (selectedFeature?.layerId !== 'interceptors') return null
    const seg = selectedFeature.object
    if (!seg?.geometry) return null
    let segBuffer
    try {
      segBuffer = buffer(seg, PROXIMITY_BUFFER_M / 1000, {
        units: 'kilometers',
        steps: 8,
      })
    } catch {
      return null
    }
    if (!segBuffer) return null
    const [minLng, minLat, maxLng, maxLat] = bbox(segBuffer)
    const result = new Set()
    for (const f of filteredComplaints) {
      const c = f?.geometry?.coordinates
      if (!Array.isArray(c) || c.length < 2) continue
      const [lng, lat] = c
      if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue
      if (booleanPointInPolygon([lng, lat], segBuffer)) result.add(f)
    }
    return result
  }, [isPipeMode, pipeProximityVisible, selectedFeature, filteredComplaints])

  const proximityEmphasisSet = isPipeMode
    ? (selectedPipeNearby ?? proximity.insideSet)
    : null
  const interceptorFeatures = useMemo(
    () => (isInfraMode ? infrastructure?.features : undefined),
    [isInfraMode, infrastructure?.features],
  )

  const allLayers = [
    combinedSeparateSewerLayer(),
    sewershedsLayer({ palette: sewershedPalette }),
    urbanRiskLayer(riskGeoJson),
    crimeHeatmapLayer(filteredCrime),
    interceptorBufferGlowLayer(visibility['pipe-proximity'] ? proximity.bufferFeature : null),
    interceptorBufferLayer(visibility['pipe-proximity'] ? proximity.bufferFeature : null),
    interceptorsLayer({
      palette: interceptorPalette,
      features: interceptorFeatures,
      hoverActive: isInfraMode && infraHighlight.active,
      highlightedSet: infraHighlight.interceptorSet,
    }),
    collisionsLayer(filteredCollisions),
    complaints311Layer(filteredComplaints, {
      proximityMode: isPipeMode,
      emphasisSet: proximityEmphasisSet,
    }),
    surfaceHotspotsLayer(
      isSurfaceMode || isStreetMode ? surfaceHotspots : [],
    ),
    proximityRingLayer(
      visibility['pipe-proximity'] && selectedPipeNearby
        ? Array.from(selectedPipeNearby)
        : [],
    ),
    csoGlowLayer(isInfraMode ? csoFeatures : []),
    csoLocationsLayer(csoFeatures, {
      palette: csoPalette,
      hoverActive: isInfraMode && infraHighlight.active,
      highlightedSet: infraHighlight.csoSet,
    }),
    selectionHighlightLayer(selectedFeature?.object ?? null),
    searchPinLayer(searchedLocation),
  ]
  const layers = allLayers.filter((l) => {
    if (
      l.id === 'interceptor-buffer-glow' ||
      l.id === 'interceptor-buffer' ||
      l.id === 'proximity-ring'
    ) {
      return visibility['pipe-proximity']
    }
    if (l.id === 'cso-glow') return visibility['cso-locations']
    if (l.id === 'search-pin') return true
    if (l.id === 'selection-highlight') return true
    return visibility[l.id]
  })

  const getTooltip = useMemo(
    () =>
      makeGetTooltip({
        proximityInsideSet: proximity.insideSet,
        proximityActive: visibility['pipe-proximity'],
      }),
    [proximity.insideSet, visibility],
  )

  const loadingDatasets = DATASETS.filter((d) => dataStatus[d.key] === 'loading')
  const erroredDatasets = DATASETS.filter((d) => dataStatus[d.key] === 'error')
  const isLoading = loadingDatasets.length > 0

  return (
    <div className="app-shell">
      {}
      {}
      <header className="top-bar">
        <div className="top-bar-card brand-card" aria-label="Invisible Safety NYC">
          <span className="brand-mark" aria-hidden="true">IS</span>
          <span className="brand-name">Invisible Safety</span>
        </div>

        <div className="top-bar-card top-bar-search">
          <SearchBox
            accessToken={MAPBOX_TOKEN}
            onSelect={flyToLocation}
            onClear={() => setSearchedLocation(null)}
            hasPin={!!searchedLocation}
          />
        </div>

        <div className="top-bar-spacer" aria-hidden="true" />

        <div className="top-bar-actions">
          <ModeSelector
            modes={ANALYSIS_MODES}
            value={mode}
            onChange={handleModeChange}
          />

          <YearRangeControl
            bounds={yearBounds}
            value={yearRange}
            onChange={setYearRange}
          />

          {}
          <button
            type="button"
            className="ar-preview-btn"
            disabled={!arSupported || !selectedFeature}
            title={
              !arSupported
                ? 'WebXR AR not supported on this device'
                : !selectedFeature
                  ? 'Click a feature on the map first'
                  : 'Open AR Preview'
            }
            onClick={() => setArOpen(true)}
          >
            AR Preview
          </button>

          {(isLoading || erroredDatasets.length > 0) && (
            <div
              className="top-bar-card top-bar-status"
              role="status"
              aria-live="polite"
            >
              {isLoading ? (
                <>
                  <span className="status-spinner" aria-hidden="true" />
                  <span className="status-pill-text status-pill-loading">
                    Loading {loadingDatasets.map((d) => d.label).join(' · ')}…
                  </span>
                </>
              ) : (
                <>
                  <span className="status-dot" aria-hidden="true" />
                  <span className="status-pill-text status-pill-error">
                    Failed: {erroredDatasets.map((d) => d.label).join(' · ')}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {}
      <main className="map-stage">
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState: vs }) => setViewState(vs)}
          controller={true}
          layers={layers}
          getTooltip={getTooltip}
          onClick={handleMapClick}
          onHover={handleMapHover}
        >
          <Map mapStyle={MAP_STYLE} mapboxAccessToken={MAPBOX_TOKEN}>
            <Layer
              {...BUILDINGS_3D_LAYER}
              paint={{
                ...BUILDINGS_3D_LAYER.paint,
                'fill-extrusion-opacity':
                  BUILDINGS_OPACITY_BY_MODE[mode] ??
                  BUILDINGS_3D_LAYER.paint['fill-extrusion-opacity'],
              }}
              layout={{ visibility: visibility['3d-buildings'] ? 'visible' : 'none' }}
            />
          </Map>
        </DeckGL>

        <SummaryStats
          proximityStats={proximity.stats}
          proximityActive={
            visibility['pipe-proximity'] && mode !== 'pipe-proximity'
          }
        />

        <LayerLegend
          layerMeta={LAYER_META}
          visibility={visibility}
          onToggle={toggleLayer}
          mode={mode}
          modes={ANALYSIS_MODES}
        />

        {}
        {visibility['pipe-proximity'] && (
          <div className="map-card map-card-left-bottom map-card-left-bottom--no-scroll">
            <ProximityStats
              stats={proximity.stats}
              loading={!proximity.bufferFeature}
              complaintSelection={
                selectedFeature?.layerId === '311-complaints'
                  ? selectedFeature
                  : null
              }
              proximityInsideSet={proximity.insideSet}
              onClearComplaintSelection={() => setSelectedFeature(null)}
            />
          </div>
        )}

        {mode === 'urban-risk' && (
          <div className="map-card map-card-left-bottom">
            <UrbanRiskControls
              weights={riskWeights}
              onChange={setRiskWeights}
              onReset={setRiskWeights}
              selectedCell={
                selectedFeature?.layerId === 'urban-risk'
                  ? selectedFeature.object
                  : null
              }
              onClearSelection={() => setSelectedFeature(null)}
            />
          </div>
        )}

        {}
        {mode === 'infrastructure' && (
          <div className="map-card map-card-left-bottom">
            <InfrastructureInspector
              derived={infrastructure}
              selection={selectedFeature}
              csoFeatures={csoFeatures}
              onClear={() => setSelectedFeature(null)}
            />
          </div>
        )}

        {}
        {mode === 'surface-risk' && (
          <div className="map-card map-card-left-bottom">
            <SurfaceRiskInspector
              cityStats={surfaceCityStats}
              selection={selectedFeature}
              onClear={() => setSelectedFeature(null)}
            />
          </div>
        )}

        {}
        {mode === 'street-view' && (
          <div className="map-card map-card-left-bottom">
            <StreetViewGuide
              onResetCamera={() =>
                setViewState((vs) => ({
                  ...vs,
                  ...STREET_VIEW_VIEW_STATE,
                  transitionDuration: 1200,
                  transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
                }))
              }
            />
          </div>
        )}

        {}
        {selectedFeature &&
          selectedFeature.layerId !== 'urban-risk' &&
          !(
            mode === 'surface-risk' &&
            (selectedFeature.layerId === 'surface-hotspots' ||
              selectedFeature.layerId === 'collisions' ||
              selectedFeature.layerId === '311-complaints')
          ) &&
          !(
            visibility['pipe-proximity'] &&
            selectedFeature.layerId === '311-complaints'
          ) &&
          !(
            mode === 'infrastructure' &&
            (selectedFeature.layerId === 'interceptors' ||
              selectedFeature.layerId === 'cso-locations' ||
              selectedFeature.layerId === 'sewersheds')
          ) &&
          !(mode === 'pipe-proximity' && selectedFeature.layerId === 'interceptors') && (
            <FeatureInspector
              feature={selectedFeature.object}
              layerId={selectedFeature.layerId}
              onClose={() => setSelectedFeature(null)}
            />
          )}

        {}
        <ARPreview
          open={arOpen}
          onClose={() => setArOpen(false)}
          selectedFeature={selectedFeature}
          riskGeoJson={riskGeoJson}
          surfaceHotspots={surfaceHotspots}
          interceptorFeatures={proximity.interceptorFeatures}
          complaints={filteredComplaints}
          csoFeatures={csoFeatures}
        />
      </main>
    </div>
  )
}

export default App
