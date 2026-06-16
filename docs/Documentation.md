# Invisible Safety NYC — Technical Documentation

> **State of this doc:** describes the **AR-only** app on branch `feature/ar-view`
> (post "phase 1 cleaning", with uncommitted changes to `App.jsx`, `App.css`, and the
> new `utils/dataUtils.js`). The old Mapbox + Deck.gl dashboard described in earlier
> versions of this document has been removed — see
> [AR_ONLY_REFACTOR_PLAN.md](AR_ONLY_REFACTOR_PLAN.md) for the migration plan and
> §10 for leftovers that still reference it.

The app is now a single-purpose **WebXR AR experience**: it ranks NYC combined-sewer-
overflow (CSO) outfalls by nearby surface "storm story" (311 complaints + composite
urban risk), lets the user pick one from a list, and places a **conceptual tabletop
storm-event model** of the surrounding 500 m — basins, trunk lines, outfalls, risk
columns — in their room via `immersive-ar`. Every surface labels it *"Conceptual
simulation — not a hydrological model/prediction."*

- **Live demo:** https://siddhimh.github.io/invisible-safety/
- **Context:** NYU Information Visualization course project

---

## 1. Tech stack

| Concern | Library |
|---|---|
| UI framework | React 19 + Vite 8 (`base: '/invisible-safety/'`) |
| 3D / AR | Three.js 0.169 + WebXR (`immersive-ar`, hit-test, dom-overlay) |
| Spatial analysis | `@turf/square-grid` (the only Turf package left) + hand-rolled metric geometry |
| Deploy | `gh-pages -d dist --no-history` → GitHub Pages |

Scripts ([package.json](../package.json)): `dev`, `build`, `lint`, `preview`,
`deploy` (`predeploy` runs the build).

**No environment secrets.** The Mapbox token went away with the basemap; data is
static GeoJSON served from `public/data/`.

---

## 2. Architecture at a glance

```
public/data/*.geojson  (NYC OpenData / Open Sewer Atlas)
        │  fetch() on mount (4 point datasets) + lazy (interceptors, sewersheds)
        ▼
   App.jsx ── XR support gate ── state: datasets, dataStatus, anchor
        │
        ├─ useUrbanRisk      → 0.75 km composite-risk grid (fixed equal weights)
        ├─ useInterceptors   → lazy trunk-line GeoJSON
        └─ useArHotspots     → top-12 CSO outfalls ranked by complaints + risk
        │
        ▼
   HotspotList  (landing screen — pick an anchor)
        │  onSelect → anchor
        ▼
   ARPreview  (splash → WebXR session)
        ├─ useStormARData → 500 m scene data, capped + pre-projected to local meters
        ├─ stormModel     → conceptual vulnerability/load math
        └─ stormScene     → Three.js scene (build / setStormIntensity / update / dispose)
```

All state lives in [App.jsx](../src/App.jsx); data flows one way:
raw GeoJSON → analytics hooks → ranked list → selected anchor → AR scene data → Three.js.

---

## 3. Boot & root component — `src/App.jsx`

1. **XR support gate.** On mount, probes `navigator.xr.isSessionSupported('immersive-ar')`
   into `xrSupport` (`'checking' | true | false`):
   - `'checking'` → centered spinner,
   - `false` → [UnsupportedScreen](../src/components/UnsupportedScreen.jsx) (the app is AR-only; no fallback UI),
   - `true` → the hotspot list + AR overlay.
   - **Escape hatch:** `?forceList` in the URL skips the probe (treats support as true)
     so the list can be exercised on desktop.
2. **Data loading.** Fetches the four `CONFIG.DATASETS` ([utils/config.js](../src/utils/config.js)) in
   parallel with `Promise.allSettled` under one `AbortController`. Features are
   validated by `hasValidPoint` ([utils/dataUtils.js](../src/utils/dataUtils.js) —
   finite lng/lat within ±180/±90); failed datasets become `[]` with status `'error'`.
   `dataStatus` (`loading | loaded | error` per key) drives the list's error banner.
3. **Analytics.** Runs the three hooks (§4) with **fixed equal risk weights**
   (`{crime: 25, crash: 25, complaint: 25, infra: 25}` — the weight-slider UI went away
   with the 2D map; weights are renormalized to sum 1 inside the hook anyway).
4. **Selection.** `HotspotList` → `onSelect(h)` →
   `setAnchor({ object: h, layerId: 'cso-locations' })`; the anchor opens
   `ARPreview` (`open={!!anchor}`), and closing it clears the anchor.

> ⚠️ **Known wiring bug (uncommitted `App.jsx`).** `onSelect` receives the ranked
> *hotspot record* `{ feature, id, waterbody, receives, complaintsNear, riskNear, score }`,
> but stores it directly as `anchor.object`. Downstream code expects a **GeoJSON
> feature** there:
> - `useStormARData` calls `featureCenter(selectedFeature.object)` — a hotspot record
>   has no `geometry`, so the center resolves to `null`, `arData` stays `null`, and the
>   splash's **Start AR button is permanently disabled**.
> - `ARPreview` reads `selectedFeature.object.properties` (no `properties` on the
>   record → anchor card never renders) and `selectedFeature.hotspot` (never set).
>
> The intended shape is `setAnchor({ object: h.feature, hotspot: h, layerId: 'cso-locations' })`.
> Documented here only — not fixed, per the no-code-edits brief.

Minor: the `error` prop passed to `HotspotList` is a boolean, but the component
renders it inline (`Failed to load: {error}`) — React renders booleans as nothing,
so the banner shows an empty reason. A `console.log("XR support:", ...)` debug line
also still fires every render.

---

## 4. Analytics hooks — `src/hooks/`

### [useUrbanRisk.js](../src/hooks/useUrbanRisk.js) — composite risk surface
Retained from the 2D app; still the source of the `risk` value everything else samples.

1. **Grid.** `@turf/square-grid` tiles a fixed NYC bbox (`[-74.27, 40.49, -73.68, 40.92]`)
   at **0.75 km** cells.
2. **Binning.** Crime, collisions, and complaints are counted per cell via integer
   column/row hash keys (O(n), no polygon tests).
3. **Infrastructure proximity.** Per cell centroid, distance to the nearest CSO
   outfall (squared-metric), mapped through exponential decay `exp(-d / 1 km)`.
4. **Normalization.** Each factor min-max scaled to [0, 1] across cells
   (`crimeNorm`, `crashNorm`, `complaintNorm`, `infraNorm`).
5. **`featureCollection`.** Weights clamped ≥ 0 and renormalized to sum 1, then
   `risk = Σ wᵢ·normᵢ`; cells with zero surface incidents are dropped.
6. **`correlations`.** 4×4 Pearson matrix over populated cells (≥ 5 required), pairs
   ranked by |r|, plus up to three plain-English insights.
   **Currently unused** — `App.jsx` destructures only `featureCollection`; the
   correlation machinery is dead weight kept from the dashboard era.

The hook takes `enabled` and skips all work until XR support is confirmed.

### [useInterceptors.js](../src/hooks/useInterceptors.js) — trunk-line fetch
Lazy one-shot fetch of `data/interceptors_force_mains.geojson`, returning
`{ interceptorFeatures }` (empty array until loaded). Replaces the old
`useProximityAnalysis`, which did this plus 2D-only buffer/enrichment work the AR
pipeline never consumed.

### [useArHotspots.js](../src/hooks/useArHotspots.js) — ranked CSO outfalls
Ranks every CSO outfall by how much nearby storm story there is to show in AR.

- **Bins** complaints into a 250 m lat/lng grid (same hashing trick as `useUrbanRisk`)
  and records the **max risk** per bin from the risk-grid centroids.
- For each outfall, sums complaints and takes peak risk over the surrounding
  **5×5 bin neighborhood** (≈ ±500 m).
- Scores `0.6 · complaintsNorm + 0.4 · peakRisk` (complaints normalized across
  outfalls; risk already 0..1 — the same blend the AR basin factor uses).
- Returns the **top 12** with `score > 0` as
  `{ feature, id (SPDES), waterbody, receives, complaintsNear, riskNear, score }`,
  plus `ready` (false until both CSOs and risk cells exist).

---

## 5. UI components — `src/components/`

### [HotspotList.jsx](../src/components/HotspotList.jsx) — landing screen
Replaces the old map's click-to-select flow. Brand header, kicker
("AR Storm Event Simulation"), and an ordered list of hotspot cards: rank, SPDES id +
waterbody, nearby-complaint count, peak risk %, receiving waterbody, a small score
bar-sparkline (`ScoreBars`), and a chevron. States: loading spinner, error banner
(`role="alert"`), empty message, and a permanent "conceptual simulation" disclaimer.
Tapping a card calls `onSelect(hotspot)`.

### [UnsupportedScreen.jsx](../src/components/UnsupportedScreen.jsx)
Shown when `immersive-ar` isn't available: phone-with-AR-cube icon, "Device not
supported", pointers to Chrome on Android / Meta Quest Browser, the current URL (so
it can be retyped on a capable device), and a link to immersiveweb.dev.

---

## 6. AR Storm Event Simulation — `src/ar/`

A **conceptual** systems visualization (explicitly *not* hydrology). The visual
language is grounded civic-infrastructure: asphalt ground, slate basins, muted
stormwater-blue water/rain, desaturated-teal pipe flow — **clay/orange is reserved
strictly for overflow stress** so it reads as a warning. No neon, no additive glow.

### [projection.js](../src/ar/projection.js) — coordinate math
- `lngLatToLocalMeters([lng,lat], [cLng,cLat])` — equirectangular approximation to
  local X/Z meters around a center; Z flipped so north is −Z (Three.js convention).
- `withinRadius`, `featureCenter` (centroid/midpoint for any geometry type),
  `lineFeatureBbox` (radius pre-filtering).
- Constants: `AR_RADIUS_M = 500` (scene capture radius),
  `AR_SCALE = 1/300` (real meters → tabletop meters, so 1 km ≈ 3.3 m).

### [stormModel.js](../src/ar/stormModel.js) — conceptual load model
Single source of truth for the (deliberately simple) math:
- `STORM_LEVELS`: 0 Calm / 1 Light rain / 2 Heavy rain / 3 Overflow stress; `MAX_LEVEL = 3`.
- `vulnerabilityOf(factors)` — intensity-independent weighted blend of a node's four
  normalized factors: **basin 0.30, infra 0.25, complaint 0.25, risk 0.20**.
- `computeLoad(factors, level)` = `pow(level/3, 0.85) · (0.35 + 0.65·vulnerability)` —
  the 0.35 floor makes even low-vulnerability nodes visibly respond; only the most
  vulnerable node reaches the ceiling at full intensity.
- `stressState(load)`: `normal` < `PULSE_THRESHOLD 0.7` ≤ `pulsing` < `OVERFLOW_THRESHOLD 0.9` ≤ `overflow`.

### [useStormARData.js](../src/ar/useStormARData.js) — scene data prep
Lazily fetches `data/sewershed.geojson` once AR opens (the only data not already in
App state), then from the anchor's center gathers everything renderable within 500 m,
**capped and pre-projected to local meters** so the Quest browser stays light:

| Element | Cap | Notes |
|---|---|---|
| Risk cells | 60 nearest | centroid + `risk` only |
| Complaint clusters | 40 | raw complaints collapsed on a 45 m grid, biggest first |
| Pipes | 8 segments | bbox + radius intersect; stubs < 5 m dropped; arc length precomputed |
| Basins | 6 nearest | largest outer ring per feature, sampled to ≤ 72 points |
| CSO outfalls | 12 nearest | — |

It then computes per-node factors feeding `vulnerabilityOf`:
- **Basin factor** — complaints + risk cells are tallied into containing basins
  (local point-in-ring); each basin blends `0.6·complaintNorm + 0.4·meanRisk`.
- **Per-CSO factors** — `complaint` (raw complaints within 160 m, normalized across
  CSOs), `risk` (max risk cell within 130 m), `infra` (nearest-pipe proximity,
  linear falloff over 180 m), `basin` (containing basin's factor, else nearest
  centroid's).
- **`mostStressed`** — index of the highest-vulnerability outfall (ordering is
  intensity-independent, so computed once; drives the floating label).

Returns `null` until an anchor with a resolvable center exists (see the §3 bug).

### [stormScene.js](../src/ar/stormScene.js) — Three.js scene builder
`buildStormScene(arData)` → `{ root, update, setStormIntensity, dispose }`.
Root group is pre-scaled by `AR_SCALE`; children are built in real local meters.

| Group | What it is | Reacts to intensity |
|---|---|---|
| `ground` | asphalt plane (1100 m square) + slate grid | — |
| `sewersheds` | translucent basin fills + boundary lines + per-basin **accumulation water** | water height/opacity ease toward basin load |
| `pipes` | trunk lines at −2.5 m (below ground plane) | — |
| `pipeFlow` | teal particles, arc-length parameterized (10/pipe) | speed `8 + 26·frac`, hidden at calm |
| `rain` | 600 points, deterministic pseudo-random layout | density via draw-range + opacity |
| `riskColumns` | instanced boxes per risk cell | height (1.5→46 m) and slate→clay color scale with `risk × intensity` |
| `clusters` | flat instanced disks per complaint cluster, radius ~ √count | — |
| `csoNodes` / `overflowEffects` | slate cylinders + hidden clay spill fountains (24 pts each) | pulse + warm past 0.7 load; spill past 0.9 |
| label | canvas-texture sprite over the most-stressed outfall | visible once that node crosses the pulse line; bobs |

`setStormIntensity(level)` recomputes loads and sets animation targets;
`update(t, level)` runs per frame with a **fixed dt of 1/60** (frame-rate-stable
eases), animating rain fall, flow particles, water shimmer, CSO pulse/spill, and the
label bob. `dispose()` walks the graph freeing geometries/materials + the label
texture. Note the basin water load currently feeds the basin's single
`vulnerability` value into **all four** factor slots of `computeLoad` — i.e. basins
respond on vulnerability alone, by design simplification.

### [ARPreview.jsx](../src/ar/ARPreview.jsx) — WebXR session lifecycle
Full-screen overlay (also the `dom-overlay` root inside the session).

- **Splash (`phase: 'idle'`)** — explanatory copy, anchor card (CSO id, nearby
  complaints, peak risk, receiving waterbody), swatch legend, Quest controller hints,
  the conceptual disclaimer, error pane, **Start AR** (disabled until `arData` is
  ready and `navigator.xr` exists) and **Back to list**.
- **Start** — requests `immersive-ar` with `requiredFeatures: ['hit-test']`,
  optional `local-floor` + `dom-overlay`; creates a transparent antialiased
  `WebGLRenderer`, prefers the `local-floor` reference space (falls back to
  `local`), builds the scene hidden, and resets intensity to Calm.
- **Dual hit-test sources** — one on the **viewer** ray (correct for phones), one on
  the active **tracked-pointer controller** ray, refreshed on every
  `inputsourceschange`. Each frame prefers the controller hit to drive the reticle
  (a flat off-white ring).
- **Place (`select`)** — first trigger/tap decomposes the reticle matrix into the
  scene root, re-applies `AR_SCALE`, reveals the model → `phase: 'placed'`.
- **Intensity control** — after placement: **trigger** raises intensity (wraps
  3 → Calm), **grip** (`squeezestart`) lowers it (wraps 0 → 3). The DOM-overlay
  panel (− / four pips / +, the overflow pip styled clay) drives the same state on
  phones; Quest Browser doesn't render dom-overlay, hence the duplicated controls.
  All paths funnel through `applyIntensity` which clamps, syncs React state, a ref
  for the rAF loop, and the live scene.
- **Teardown** — on session `end`, overlay close, or unmount: stops the animation
  loop, ends the session, disposes scene + renderer, resets all refs and phase.

Styling in [ARPreview.css](../src/ar/ARPreview.css) (overlay/splash/intensity
panel); the list/landing/unsupported styles live in
[styles/App.css](../src/styles/App.css), global resets in
[styles/index.css](../src/styles/index.css).

---

## 7. Data — `public/data/`

GeoJSON from NYC OpenData / Open Sewer Atlas:

| File | Geometry | Loaded | Role |
|---|---|---|---|
| `311_infrastructure.geojson` | Point | eager (`complaints`) | 311 complaints |
| `crime.geojson` | Point | eager (`crime`) | NYPD complaints |
| `collisions.geojson` | Point | eager (`collisions`) | motor-vehicle collisions |
| `cso_locations.geojson` | Point | eager (`cso`) | CSO outfalls (SPDES id, waterbody) |
| `interceptors_force_mains.geojson` | Line | lazy (`useInterceptors`) | sewer trunk lines |
| `sewershed.geojson` | Polygon | lazy (`useStormARData`, on AR open) | drainage basins |
| `buildings.geojson` | Polygon | **never** | leftover from the 3D basemap — unused |

URLs are relative (`data/…`) so they resolve under the `/invisible-safety/` base on
GitHub Pages.

---

## 8. Leftovers & cleanup candidates (documentation only — nothing removed)

- **[src/Appppp.jsx](../src/Appppp.jsx)** — a stale alternate draft of the AR-only
  `App`. Not imported by anything ([main.jsx](../src/main.jsx) renders `./App.jsx`),
  and its imports are broken anyway (`./components/ARPreview`, `./App.css` — both
  moved). Notably it *does* contain the correct anchor wiring
  (`object: h.feature, hotspot: h`) that the live `App.jsx` is missing (§3 bug).
- **`useUrbanRisk` correlations** — computed but unconsumed (§4).
- **`public/data/buildings.geojson`** — unused payload still shipped with the site.
- **Stale comments** — `useStormARData` still says "Deck.gl streams them from the
  URL"; Deck.gl is gone.
- **[README.md](../README.md)** — still describes the four-mode Mapbox/Deck.gl
  dashboard; needs a rewrite once the AR-only refactor lands on `main`.
- **Debug logging** — `console.log("XR support:", …)` in `App.jsx`.
