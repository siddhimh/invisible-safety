# Invisible Safety NYC — Technical Documentation

A spatial-analytics web app that overlays **visible** street-level safety signals
(crime, vehicle collisions, 311 complaints) on **hidden** subsurface infrastructure
(sewer interceptors, combined-sewer-overflow outfalls, sewersheds) to explore how
surface risk in New York City correlates with infrastructure vulnerability.

- **Live demo:** https://siddhimh.github.io/invisible-safety/
- **Context:** NYU Information Visualization course project

---

## 1. Tech stack

| Concern | Library |
|---|---|
| UI framework | React 19 + Vite 8 |
| Basemap | Mapbox GL 3 (`react-map-gl`), dark style, 3D building extrusions |
| Data layers | Deck.gl 9 (`@deck.gl/layers`, `/aggregation-layers`, `/geo-layers`) |
| Spatial analysis | Turf.js 7 (`buffer`, `bbox`, `area`, `square-grid`, `boolean-point-in-polygon`) |
| AR | Three.js 0.169 + WebXR (`immersive-ar`, hit-test) |
| Deploy | `gh-pages` → GitHub Pages |

Scripts (`package.json`): `dev`, `build`, `lint`, `preview`, `deploy` (`predeploy` runs the build).

Environment: a single secret, `VITE_MAPBOX_TOKEN`, read in [src/utils/config.js](src/utils/config.js) and passed to both the basemap and the geocoder.

---

## 2. Architecture at a glance

```
public/data/*.geojson  (≈140 MB NYC OpenData)
        │  fetch() on mount
        ▼
   App.jsx  ──────────────► state: datasets, mode, visibility, selection, viewState, weights, yearRange
        │  filtered by year
        ▼
   hooks/ (derive analytics)            layers/ (build Deck.gl layers)
   ├ useUrbanRisk        ──────────────► urbanRiskLayer
   ├ useProximityAnalysis              ► interceptorBuffer / proximityRing / complaints311
   ├ useSurfaceHotspots                ► surfaceHotspots / crimeHeatmap / collisions
   └ useInfrastructure                 ► interceptors / csoLocations / sewersheds
        │
        ▼
   DeckGL canvas  ⟂  Mapbox basemap (+3D buildings)
        │
        ▼
   components/ (DOM UI panels over the map)  +  ar/ (WebXR storm sim)
```

All application state lives in [src/App.jsx](src/App.jsx) — there is no Redux/Zustand. Data flows one way: raw GeoJSON → year filter → analytics hook → Deck.gl layer + inspector panel.

---

## 3. Configuration — `src/utils/config.js`

Single source of truth for view, layers, and modes.

- **`INITIAL_VIEW_STATE`** — Manhattan-centred camera (zoom 11, pitch 45°).
- **`STREET_VIEW_VIEW_STATE`** — low, steep camera (zoom 17.2, pitch 78°) for "street view".
- **`MAP_STYLE`** — Mapbox dark v11.
- **`BUILDINGS_3D_LAYER`** — fill-extrusion config for real building footprints (`minzoom: 14`). Per-mode opacity overrides in `BUILDINGS_OPACITY_BY_MODE` (dim in pipe-proximity, bold in street-view).
- **`LAYER_META`** — display metadata for every toggleable layer: label, legend swatch (CSS gradient/color), optional note, and `swatchByMode` overrides so the same layer can recolor per mode.
- **`ANALYSIS_MODES`** — the five modes, each a `Set` of layer ids that should be visible. This Set drives both layer rendering and the legend.
- **`PROXIMITY_BUFFER_M`** — 200 m corridor radius.
- **`ZOOM_BY_LAYER` / `ZOOM_BY_LAYER_BY_MODE`** — target zoom when a feature of a given layer is clicked (e.g. click a collision → fly to zoom 17).
- **`DATASETS`** — the four eagerly-fetched datasets (complaints, CSO, collisions, crime) and their URLs.

### The five analysis modes

| Mode | Purpose | Visible layers |
|---|---|---|
| **Urban Risk Index** (default) | Weighted composite risk choropleth | urban-risk grid, CSO, sewersheds, sewer system, buildings |
| **Pipe Proximity** | Do complaints cluster near trunk lines? | 200 m buffer, interceptors, CSO, 311, buildings |
| **Surface Risk** | Street-level signal density | crime heatmap, collisions, 311, hotspots, buildings |
| **Infrastructure View** | The subsurface network itself | interceptors, CSO, sewersheds, buildings |
| **Street View** | Immersive low-angle "walk the street" | everything, with steep camera |

---

## 4. Root component — `src/App.jsx`

### Responsibilities
1. **Data loading.** On mount, fetches all four `DATASETS` in parallel. Each feature is validated by `hasValidPoint` (finite lng/lat within ±180/±90); invalid features are dropped with a console warning. Per-dataset status (`loading | loaded | error`) drives the top-bar status pill.
2. **Mode switching** (`handleModeChange`). Sets the mode, recomputes layer visibility from the mode's Set (`visibilityForMode`), clears selection/hover, and animates the camera (fly-to) when entering or leaving street-view.
3. **Year filtering.** `yearBounds` is derived from all dated features; `yearRange` defaults to the full span. `filterByYear` keeps features whose `year` is in range (undated features always pass). Three memoized filtered arrays (`filteredCrime/Collisions/Complaints`) feed every hook.
4. **Selection & hover.** `handleMapClick` records `{layerId, object, featureIndex, coordinate}` for the clicked feature and flies to it at the layer's target zoom. `handleMapHover` only tracks interceptors/CSOs (used for infrastructure highlighting).
5. **Layer assembly.** `allLayers` builds every Deck.gl layer each render (passing the relevant data + mode-derived palette/emphasis), then `layers` filters them by current visibility. Z-order is the array order.
6. **Tooltips.** `makeGetTooltip` returns a Deck.gl `getTooltip` that renders per-layer hover text (collision casualties, 311 type/status, CSO outfall id, urban-risk component breakdown, hotspot ranking). Memoized on the proximity inside-set.

### Mode-derived rendering state
- **Palettes:** `interceptorPalette` / `csoPalette` / `sewershedPalette` switch color schemes by mode (`infrastructure` → cyan, `pipe-proximity` → teal, else default).
- **`infraHighlight`** (infrastructure mode only): from the hovered/selected feature, computes which interceptor indices and CSO objects to highlight. Selecting an interceptor highlights it plus all CSOs connected within 600 m; selecting a CSO highlights it plus its single nearest interceptor. Driven by the maps from `useInfrastructure`.
- **`selectedPipeNearby`** (pipe-proximity mode): when a single interceptor segment is selected, buffers *just that segment* by 200 m and finds the complaints inside it (bbox pre-filter + point-in-polygon). This drives the per-segment emphasis instead of the whole-network buffer.
- **`proximityEmphasisSet`** — the set of 311 features to draw bold (either the selected-segment set or the global inside-set).

### WebXR controller click fallback (recent change)
Deck.gl routes clicks through mjolnir-js's `tap` recognizer, which rejects pointer events longer than ~250 ms or moving >5 px — Meta Quest controller trigger pulls routinely exceed both, and Quest Browser reports controller input as a non-mouse `pointerType` for which some browsers never synthesize a `click`. The fix (a `useEffect` on `mapStageRef`):
- Tracks raw `pointerdown → pointerup` with generous thresholds (**1500 ms**, **40 px**) — anything inside that envelope is treated as a deliberate tap.
- On a tap, converts to canvas coordinates and calls `deck.pickObject({ x, y, radius: 12 })`; if a feature is hit, dispatches `handleMapClick`.
- Listeners attach to the **map-stage wrapper** (not the canvas, whose pointer events mjolnir may claim) so `pointerup` still bubbles after Deck's own handlers.
- `DeckGL` has **no `onClick` prop** — this native listener is the single source of truth, avoiding double-fire on platforms where both paths would dispatch. `pickingRadius={12}` gives a forgiving halo for controller rays and touch.

### Layout (JSX)
- **Top bar:** brand, `SearchBox`, `ModeSelector`, `YearRangeControl`, **AR Preview** button (enabled once a feature is selected; WebXR support is treated as advisory only — see below), and a loading/error status pill.
- **Map stage:** `DeckGL` wrapping a Mapbox `Map` with the 3D-buildings `Layer`. Over it float `SummaryStats`, `LayerLegend`, and a mode-specific bottom-left panel (`ProximityStats` / `UrbanRiskControls` / `InfrastructureInspector` / `SurfaceRiskInspector` / `StreetViewGuide`), a generic `FeatureInspector` (shown only when no mode-specific panel already covers the selection), and the `ARPreview` overlay.

---

## 5. Analytics hooks — `src/hooks/`

### `useUrbanRisk.js` — composite risk surface
Builds the choropleth that defines the headline "Urban Risk Index."
1. **Grid.** `squareGrid` tiles a fixed NYC bbox at **0.75 km** cells.
2. **Binning.** Crime, collisions, and complaints are counted per cell via integer column/row keys (O(n) hashing, no per-cell polygon tests).
3. **Infrastructure proximity.** For each cell centroid, finds the nearest CSO outfall (squared metric distance) and maps distance to a raw score with exponential decay `exp(-d / 1.0 km)`.
4. **Normalization.** Each of the four factors (crime, crash, complaint, infra) is min-max scaled to [0, 1] across all cells (`crimeNorm`, etc.).
5. **Risk score** (`featureCollection`): user weights are clamped to ≥0 and **renormalized to sum 1**, then `risk = Σ wᵢ·normᵢ`. Empty cells (no surface incidents) are dropped from the output.
6. **Correlations** (`correlations`): over populated cells, computes the 4×4 Pearson matrix between normalized factors, ranks factor pairs by |r|, and generates up to three plain-English **insights** (strongest pair + double-counting caution, infrastructure corridor effect, near-independent pair). Returns `null` if fewer than 5 cells qualify.

Returns `{ featureCollection, correlations }`. The grid (`baseCells`) is memoized on data; only the weighted `risk` recomputes when sliders move.

### `useProximityAnalysis.js` — pipe corridor enrichment
1. **Lazy fetch** of `interceptors_force_mains.geojson` (only when pipe mode is active or AR is preloading).
2. **Buffer.** Merges all interceptor lines into one MultiLineString and buffers by 200 m (`bufferFeature`).
3. **Inside/outside test.** For each complaint: bbox pre-filter, then `booleanPointInPolygon`. Builds `insideSet` and per-type `{in, out}` counts.
4. **Enrichment stats.** Computes complaint **density** inside the buffer vs. outside (using `area()` of the buffer and a fixed NYC land+water area of 783.8 km²), and an **enrichment ratio** (`densityIn / densityOut`) overall and per complaint type. A ratio >1 means complaints are denser near pipes.

Returns `{ bufferFeature, insideSet, stats, interceptorFeatures }`.

### `useSurfaceHotspots.js` — ranked street hotspots
1. Finer **0.4 km** grid over NYC.
2. Aggregates per cell: crime count; collisions with severity weighting (**fatal ×5, injury ×1, property ×0.4**) plus fatal/injury/property tallies; complaints with per-type breakdown.
3. Keeps cells with ≥3 total events, min-max scales the three factors, and computes `intensity = mean(crimeScore, crashScore, complaintScore)` and a **dominant** factor.
4. Sorts by intensity, takes the **top 18**, emits point features with rank + full breakdown.
5. Also returns `cityStats` (citywide crime/crash/complaint totals + fatal/injury counts) for the inspector header.

Returns `{ hotspots, cityStats }`.

### `useInfrastructure.js` — interceptor ↔ CSO network
Pure-JS metric geometry (no Turf), lazily loaded when infrastructure mode is active. Computes:
- **`segmentLengths` / `totalLengthKm`** — per-segment and total trunk-line length.
- **`csoToInterceptor` / `csoToInterceptorDist`** — each outfall's nearest interceptor segment (point-to-polyline distance) and that distance.
- **`interceptorToCsos`** — reverse map, but only for connections within **600 m**.
- **`complaintsNearCso`** — complaints within **250 m** of each outfall (bbox + radius).
- **`complaintsNearInterceptor`** — complaints within 250 m of each segment (per-segment bbox pre-filter + point-to-polyline, early-exit once inside radius).
- **`cityStats`** — total length, segment count, outfall count, distinct receiving-water count.

These maps drive both the hover/selection highlighting in `App.jsx` and the detail rows in `InfrastructureInspector`.

---

## 6. Render layers — `src/layers/`

Each module exports a factory returning a configured Deck.gl layer. Highlights:

- **`urbanRisk.js`** — `GeoJsonLayer` choropleth; fill color interpolated through a 5-stop yellow→dark-red ramp by `risk`; low-risk cells fade toward transparent so hotspots dominate. `depthTest: false`.
- **`crimeHeatmap.js`** — `HeatmapLayer` (GPU KDE), 30 px radius, yellow→dark-red range.
- **`complaints311.js`** — `ScatterplotLayer` colored by complaint type (sewer red / water blue / street amber). In **proximity mode** it accepts an `emphasisSet`: members render bold (large radius, high alpha), non-members fade (small, translucent).
- **`interceptors.js`** — `GeoJsonLayer` lines with three palettes (`default` green, `proximity` teal, `infrastructure` cyan). In infrastructure mode, color/width are per-feature functions driven by `hoverActive` + `highlightedSet` (highlighted bright, others dimmed).
- **`csoLocations.js`** — outfall symbols (`csoLocationsLayer`) plus a `csoGlowLayer` shown in infrastructure mode.
- **`collisions.js`** — crash points (larger dot = fatal).
- **`surfaceHotspots.js`** — ranked hotspot rings.
- **`interceptorBuffer.js`** — the 200 m corridor polygon + soft glow (`interceptorBufferLayer` / `interceptorBufferGlowLayer`).
- **`proximityRing.js`** — the complaints inside a selected segment's buffer.
- **`sewersheds.js` / `combinedSeparateSewer.js`** — drainage-basin polygons and sewer-system-type overlay (purple = combined, blue = separate).
- **`selectionHighlight.js`** — a halo around the currently selected feature.
- **`searchPin.js`** — a pin at the geocoded search result.

Layer order in `App.jsx`'s `allLayers` array is the draw order; the trailing `layers.filter(...)` enforces per-mode visibility (with buffer/ring/glow tied to the pipe-proximity / CSO toggles, and highlight/search-pin always on).

---

## 7. UI components — `src/components/`

- **`SearchBox.jsx`** — Mapbox **Geocoding v5** autocomplete, biased to a NYC bbox + proximity, US-only, 5 results. Debounced 250 ms, with a request-id guard so stale responses are ignored. Full keyboard support (↑/↓/Enter/Esc), click-outside to close, clear button. On select, returns `{longitude, latitude, placeName, bbox}` → `flyToLocation`.
- **`ModeSelector.jsx`** — dropdown to switch analysis modes.
- **`YearRangeControl.jsx`** — two `Dropdown`s (from/to year) built from `yearBounds`, with clamping so `from ≤ to`. Hidden until bounds exist.
- **`LayerLegend.jsx`** — collapsible right-side panel listing only the layers relevant to the current mode, with per-mode swatches and visibility checkboxes; header shows `on / total`.
- **`UrbanRiskControls.jsx`** — four weight sliders (crime/crash/complaint/infra) shown as **renormalized percentages**; a Reset button restores even 25/25/25/25 weights. When a grid cell is selected, `SelectedCellPanel` shows its risk %, dominant factor (by weighted contribution), and a per-factor raw + percentage-of-score breakdown. Exports `DEFAULT_WEIGHTS`.
- **`ProximityStats.jsx`** — pipe-mode panel: nearby complaint density, overall infrastructure **influence** (enrichment ×), and a per-type enrichment bar chart. If a 311 complaint is selected, shows its details with an "inside / outside corridor" pill.
- **`SurfaceRiskInspector.jsx`** — surface-mode panel: citywide crash/crime/311 totals (with fatal/injury sub-stats); on selecting a hotspot/crash/complaint, swaps to a detailed breakdown (dominant risk, factor bars, severity summary).
- **`InfrastructureInspector.jsx`** — infrastructure-mode panel: network overview (trunk-line km, segment count, outfall count, receiving waters); on selecting a segment/outfall/sewershed, shows type, length/SPDES/waterbody, connected-outfall count, and complaints within 250 m.
- **`SummaryStats.jsx`** — floating insight card surfaced when the pipe corridor is active but not the focused mode (e.g. the "Sewer 311s 3× denser near trunk lines" headline).
- **`FeatureInspector.jsx`** — generic fallback property viewer for selections not covered by a mode-specific panel.
- **`StreetViewGuide.jsx`** — street-view camera hints + a reset-camera button.
- **`FactorCorrelations.jsx`** — Pearson correlation matrix / insights view (from `useUrbanRisk`).
- **`Dropdown.jsx`** — reusable accessible dropdown used by the mode and year controls.

---

## 8. AR Storm Event Simulation — `src/ar/` + `ARPreview.jsx`

A **conceptual** AR systems visualization (explicitly *not* a hydrological model). From the selected feature, it builds a localized **500 m** storm-event model — sewershed basins, interceptor flow, CSO outfalls, risk cells, and 311 clusters — that the user places on a real surface (phone AR) or in room space (Meta Quest). A single storm-intensity dial (0 Calm → 3 Overflow stress) makes the system visibly respond. Every surface labels it *"Conceptual storm simulation — not a hydrological prediction."*

The visual language is grounded civic-infrastructure: dark asphalt ground, slate basins, muted stormwater blue water/rain, desaturated teal pipe flow, and clay/orange reserved strictly for overflow stress — no neon, no additive glow.

### `projection.js` — coordinate math (unchanged)
- `lngLatToLocalMeters` — converts lng/lat to local X/Z meters around a center (equirectangular approximation; Z flipped so north is −Z).
- `withinRadius` — fast radius test in local meters.
- `featureCenter` — centroid/midpoint for any geometry type.
- `lineFeatureBbox` — bbox of a line feature for radius pre-filtering.
- Constants: `AR_RADIUS_M = 500`, `AR_SCALE = 1/300` (real meters → AR meters).

### `stormModel.js` — conceptual load model
Single source of truth for the (deliberately simple) simulation math.
- `STORM_LEVELS` (0 Calm / 1 Light rain / 2 Heavy rain / 3 Overflow stress), `MAX_LEVEL = 3`.
- `vulnerabilityOf(factors)` — intensity-independent weighted blend of a node's four normalized factors (`basin` 0.30, `infra` 0.25, `complaint` 0.25, `risk` 0.20).
- `computeLoad(factors, level)` — `pow(level/3, 0.85) · (0.35 + 0.65·vulnerability)`. Calm ⇒ 0 everywhere; the most vulnerable node crosses the pulse line at heavy rain and overflows at level 3.
- `stressState(load)` against `PULSE_THRESHOLD = 0.7` / `OVERFLOW_THRESHOLD = 0.9`.

### `useStormARData.js` — scene data prep
Lazily fetches `sewershed.geojson` once AR opens, then from the selected feature's center gathers and **caps** what's renderable within 500 m: nearest **6** sewershed basins (outer rings sampled to ≤72 local points), **8** pipe segments (stubs dropped), nearest **12** CSO outfalls, complaints grid-clustered into ≤**40** muted markers, and nearest **60** risk cells. Everything is pre-projected to local meters. It also precomputes each CSO's four vulnerability factors — basin (containing basin's blended complaint+risk load), infra (nearest-pipe proximity), complaint (nearby 311 count, normalized across CSOs), risk (max nearby risk cell) — and flags the single **most-stressed** outfall (intensity-independent, so computed once). Returns `null` until a feature is selected.

### `stormScene.js` — Three.js scene builder
`buildStormScene(arData)` returns `{ root, update, setStormIntensity, dispose }`. Named groups:
- **ground** — asphalt plane + slate grid.
- **sewersheds** — translucent slate basin fills + muted-blue boundary lines + a per-basin **accumulation water** surface whose height/opacity ease up with basin load.
- **pipes** — desaturated-teal trunk lines sitting *below* the ground plane.
- **pipeFlow** — teal flow particles (arc-length parameterized); speed and opacity scale with intensity, hidden at calm.
- **rain** — muted-blue point rain; density (draw-range) and opacity scale with intensity.
- **riskColumns** — instanced vertical columns; height/warmth scale with risk × intensity (slate → muted clay).
- **clusters** — flat instanced disks for 311 complaint clusters, sized by count.
- **csoNodes** / **overflowEffects** — slate cylinders that pulse and warm toward clay past the pulse threshold; overflow nodes emit a muted clay spill fountain.
- **label** — a canvas-texture sprite over the most-stressed outfall, shown once it crosses the pulse line, reading *"High stress · Outfall <id> — near dense 311 complaints + a high infrastructure-risk cell + a connected sewer corridor."*

`setStormIntensity(level)` recomputes loads and sets animation targets; `update(t, level)` eases water/opacity, animates rain/flow/pulse/spill (fixed `dt` for frame-rate-stable eases), and only touches particles/opacity/scale/transforms per frame. `dispose` frees geometries, materials, and the label texture.

### `ARPreview.jsx` — WebXR session lifecycle
- **Splash card** (pre-session): the explanatory copy above, a small swatch legend, controller hints, the conceptual-not-predictive disclaimer, and Start/Cancel.
- **Start** requests an `immersive-ar` session (`requiredFeatures: ['hit-test']`, optional `local-floor` + `dom-overlay`), creates a transparent Three.js `WebGLRenderer`, builds the scene (hidden until placed), and resets intensity to Calm.
- **Dual hit-test sources**: one anchored to the **viewer** ray (always available; correct for phones), one to the active **tracked-pointer** controller ray, refreshed on every `inputsourceschange`. Each frame prefers the controller hit, falling back to the viewer hit, to position the reticle.
- **Place** (`select` = trigger/pinch/screen tap before placement): decomposes the reticle matrix into the scene root, scales by `AR_SCALE`, reveals it, sets phase to `placed`.
- **Storm-intensity control**: after placement, the **trigger** (`select`) raises intensity (wrapping past 3 → Calm) and the **grip** (`squeezestart`) lowers it, applied to the scene immediately. A DOM-overlay control (±buttons + four pips, the overflow pip turning clay) drives the same state on phones, where `dom-overlay` renders.
- **Teardown** on session end / overlay close / unmount: stops the loop, ends the session, disposes scene + renderer, resets refs.
- **AR support is advisory.** The toolbar AR button is gated only on having a selected feature, not on `isSessionSupported`; a genuine failure surfaces in the splash's error pane.

---

## 9. Data — `public/data/`

GeoJSON from NYC OpenData and the Open Sewer Atlas (≈140 MB total):

| File | Geometry | Role |
|---|---|---|
| `311_infrastructure.geojson` | Point | 311 complaints (type, descriptor, date, status, year) |
| `crime.geojson` | Point | NYPD crime complaints (date, year) |
| `collisions.geojson` | Point | Motor-vehicle collisions (factor, injured, killed, year) |
| `cso_locations.geojson` | Point | Combined-sewer-overflow outfalls (SPDES id, waterbody) |
| `interceptors_force_mains.geojson` | LineString | Sewer trunk lines (lazy-loaded) |
| `sewershed.geojson` | Polygon | Drainage basins |
| `combined_separate_sewer.geojson` | Line/Polygon | Sewer system type |
| `borough.geojson`, `buildings.geojson` | Polygon | Context layers |

The four point datasets load eagerly on mount; interceptors load lazily the first time pipe-proximity or infrastructure mode (or AR preload) needs them.

---

## 10. Current working changes (uncommitted)

The AR feature has been **replaced** — the old general "AR preview" (a per-mode layer viewer with risk cells / pipes / particles / incidents / CSOs / hotspots) is gone, swapped for the **AR Storm Event Simulation** (§8):

1. **`App.jsx`** — the native pointer-event → `deck.pickObject()` tap fallback (§4) for non-mouse devices; `ARPreview` now receives only the props the storm scene needs (`selectedFeature`, `riskGeoJson`, `interceptorFeatures`, `complaints`, `csoFeatures`).
2. **`src/ar/stormModel.js`** (new) — the conceptual storm-load model.
3. **`src/ar/useStormARData.js`** (new) — 500 m storm-scene data prep with aggressive caps + per-CSO vulnerability factors; lazily fetches sewersheds.
4. **`src/ar/stormScene.js`** (new) — the civic-palette Three.js storm scene (basins, rain, pipe flow, accumulation, CSO stress/overflow, stressed-outfall label).
5. **`ARPreview.jsx`** — rewritten for the storm session: hit-test placement, trigger/grip + on-screen storm-intensity control, conceptual-not-predictive labeling.
6. **`ARPreview.css`** — restyled for the grounded infrastructure aesthetic (asphalt/slate/stormwater-blue, clay only for overflow).
7. **Removed:** `src/ar/scene.js`, `src/ar/useARData.js` (the old preview scene + data hook). `src/ar/projection.js` is retained unchanged.
