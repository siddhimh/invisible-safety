# Convert Invisible Safety to an AR-only experience

> Status: planned, not yet implemented (2026-06-10)

## Context

The app currently has two faces: a heavy 2D DeckGL/Mapbox map (5 analysis modes, ~12 side panels, ~10 deck.gl layers — roughly 60% of `src/App.jsx`'s 779 lines) and the new AR storm simulation (`src/ar/` + `ARPreview.jsx`), which is the part we want to keep. The 2D map's only remaining job is letting the user click a feature to anchor the AR scene.

**Decisions:**
1. Remove the 2D map entirely — AR-only app.
2. Replace map-based anchor selection with a **hotspot list picker**: a landing screen listing CSO outfalls ranked by nearby complaint density + risk; tapping one anchors the AR scene there.
3. Devices without WebXR `immersive-ar` get a **message-only screen** ("open on an AR-capable phone") — no inline 3D fallback.
4. **Full removal**: delete all 2D components/layers/hooks and drop mapbox/deck.gl/most turf deps.

**Key verified facts:**
- `useStormARData` only needs `featureCenter(selectedFeature.object ?? selectedFeature)` — any `{ object: <GeoJSON Point feature> }` works as the anchor (`src/ar/useStormARData.js:196`, `src/ar/projection.js:29`).
- AR pipeline consumes: `riskGeoJson` (from `useUrbanRisk`, which imports only `@turf/square-grid`), `interceptorFeatures` (raw fetched GeoJSON — all the turf work in `useProximityAnalysis` is 2D-only), `complaints`, `csoFeatures`.
- CSO features (`public/data/cso_locations.geojson`, 446 points) have `spdes`, `Waterbody`, `Waterbod_1` properties — good list labels.
- All 4 eager datasets (complaints, cso, collisions, crime) stay: they feed `riskGeoJson` + hotspot ranking.
- **Do not touch** `src/ar/stormScene.js`, `stormModel.js`, `useStormARData.js`, `projection.js`, `ARPreview.css` — newly built and working.

## Implementation steps

### 1. New hook `src/hooks/useInterceptors.js`
Extract just the lazy fetch from `useProximityAnalysis` (lines 15–31 + the `interceptorFeatures` return at line 127, ~30 lines, zero turf):
`useInterceptors({ enabled })` → `{ interceptorFeatures }`. Fetches `data/interceptors_force_mains.geojson` once when enabled.

### 2. New hook `src/hooks/useArHotspots.js`
`useArHotspots({ csoFeatures, complaints, riskGeoJson })` → `{ hotspots, ready }`. Each hotspot: `{ feature, id (spdes), waterbody, receives (Waterbod_1), complaintsNear, riskNear, score }`.

Ranking (reuses existing patterns — `binByCell` math from `useUrbanRisk`, the 0.6/0.4 blend from `basinFactor` in useStormARData):
1. Bin complaints into a ~250 m lat/lng grid Map (one 100k pass).
2. Bin risk-cell centroids the same way, keeping max `properties.risk` per bin.
3. Per CSO: sum complaints / max risk over the 5×5 neighborhood (≈±500 m).
4. `score = 0.6 * (complaintsNear / max) + 0.4 * riskNear`; sort desc, drop zeros, return top 12 (`MAX_HOTSPOTS`).
Memoized; recomputes when `riskGeoJson` arrives.

### 3. New component `src/components/HotspotList.jsx`
Props `{ hotspots, loading, error, onSelect }`. Full-screen landing: brand header (reuse `.brand-card`/`.brand-mark`), title "Pick a place to anchor the storm model", explainer + the existing "Conceptual simulation" disclaimer, spinner while loading, dataset-error pill if any fetch failed. Ranked cards (rank badge, `{spdes} — {Waterbody}`, `{complaintsNear} complaints nearby · peak risk N%`, "Receives: …"); each card is a `<button>` → `onSelect(hotspot.feature)`.

### 4. New component `src/components/UnsupportedScreen.jsx`
Full-screen message: needs an AR-capable phone/headset (WebXR `immersive-ar`); hint "Open in Chrome on Android or the Meta Quest browser"; show `window.location.href` as selectable text. No new deps (no QR lib).

### 5. Rewrite `src/App.jsx` (~120 lines)
**Keep verbatim:** the dataset fetch effect + `hasValidPoint` (current lines 285–331), `dataStatus` state, the WebXR probe effect (266–281) — extended to tri-state `xrSupport: 'checking' | true | false`, plus a dev override: `?forceList` query param treats AR as supported (for desktop testing of the list).

**Drop:** all deck.gl/mapbox imports and JSX, mode/visibility/viewState/search/hover/selection state, `yearRange`/`yearBounds`/`filterByYear` (pass unfiltered arrays — useStormARData caps clusters at 40), tooltips, all panels.

New structure:
```jsx
const RISK_WEIGHTS = { crime: 25, crash: 25, complaint: 25, infra: 25 } // moved from UrbanRiskControls

// xrSupport === false → <UnsupportedScreen />
// else → <HotspotList ... onSelect={f => setAnchor({ object: f, layerId: 'cso-locations' })} />
//        + <ARPreview open={!!anchor} onClose={() => setAnchor(null)} selectedFeature={anchor}
//                     riskGeoJson interceptorFeatures complaints csoFeatures />
```
`useUrbanRisk({ ..., weights: RISK_WEIGHTS, enabled: xrSupport === true })`, `useInterceptors({ enabled: xrSupport === true })`. ARPreview stays an overlay (already full-screen fixed, renders null when closed) — **prop contract unchanged**; closing AR returns to the list.

### 6. ARPreview copy tweaks only (`src/components/ARPreview.jsx`)
- Line ~251: remove the now-unreachable "Pick a feature on the map first…" ternary branch.
- Optional: show anchor name (`selectedFeature?.object?.properties?.spdes` + Waterbody) in the splash. No logic changes.

### 7. Trim `src/utils/config.js`
Keep only `DATASETS`. Delete `MAPBOX_TOKEN`, `INITIAL_VIEW_STATE`, `STREET_VIEW_VIEW_STATE`, `MAP_STYLE`, `BUILDINGS_3D_LAYER`, `BUILDINGS_OPACITY_BY_MODE`, `LAYER_META`, `ANALYSIS_MODES`, `DEFAULT_MODE_ID`, `PROXIMITY_BUFFER_M`, `ZOOM_BY_LAYER*`. (`VITE_MAPBOX_TOKEN` in `.env` becomes unused — leave the file.)

### 8. Deletions
- **Components (13):** ModeSelector, LayerLegend, SearchBox, UrbanRiskControls, ProximityStats, InfrastructureInspector, SurfaceRiskInspector, StreetViewGuide, SummaryStats, FeatureInspector, FactorCorrelations, YearRangeControl, Dropdown (only consumed by ModeSelector/YearRangeControl) — all `.jsx` + any sibling `.css`.
- **Entire `src/layers/` directory** (13 deck.gl layer files).
- **Hooks:** `useSurfaceHotspots.js`, `useInfrastructure.js`, `useProximityAnalysis.js` (replaced by useInterceptors). Keep `useUrbanRisk.js` untouched.
- **Keep all of `public/data/`** (sewershed + interceptors are lazy-fetched by AR; 4 eager sets feed risk/hotspots). Final grep to confirm `combined_separate_sewer.geojson` / `buildings.geojson` / `borough.geojson` are unreferenced before optionally deleting.

### 9. `package.json`
Remove: `deck.gl`, `@deck.gl/layers`, `@deck.gl/react`, `@deck.gl/aggregation-layers`, `@deck.gl/geo-layers`, `mapbox-gl`, `react-map-gl`, `@turf/area`, `@turf/bbox`, `@turf/boolean-point-in-polygon`, `@turf/buffer`.
Keep: `@turf/square-grid` (useUrbanRisk), `three`, `react`, `react-dom`, devDeps. Run `npm install` to regen lockfile.

### 10. Rewrite `src/App.css`
Replace the 1783-line file with ~200 lines: keep `.app-shell`, `.brand-*`, `.status-spinner`/`.status-pill-*`; add `.hotspot-*` and `.unsupported-*` (mobile-first single column). `index.css` and `ARPreview.css` unchanged.

### 11. Update `DOCUMENTATION.md`
Describe the new flow (hotspot picker → AR), remove the five-mode/2D-map sections.

## Verification

1. `npm run build` (and lint if configured) passes; grep `src/` for `mapbox`, `deck.gl`, `ANALYSIS_MODES`, `MAPBOX_TOKEN`, and deleted component names — zero hits.
2. Desktop Chrome `npm run dev`: UnsupportedScreen renders (no immersive-ar on desktop).
3. Desktop with `?forceList=1`: hotspot list renders 12 ranked CSOs with plausible names/counts after data loads; tapping one opens the ARPreview splash (Start AR will fail on desktop — expected). The Immersive Web Emulator extension can exercise the real support check.
4. Build output: vendor bundle shrinks by several MB (deck.gl + mapbox-gl gone); network tab shows no `api.mapbox.com` requests.
5. Manual phone test (HTTPS required for WebXR — gh-pages deploy or `vite --host` + tunnel): list → tap hotspot → Start AR → reticle → place → intensity cycles Calm→Overflow → Exit returns to list → different hotspot rebuilds the scene at the new anchor.

## Notes
- `useUrbanRisk` still computes now-unused `correlations` — harmless, left untouched per minimal-risk preference.
- `vite.config.js` `base: '/invisible-safety/'` and gh-pages deploy unaffected.
