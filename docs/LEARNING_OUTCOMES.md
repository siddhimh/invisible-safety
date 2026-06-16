# Invisible Safety — Knowledge & Skills Gained

What this project teaches, mapped to where in the codebase / plan each skill is
actually exercised. Companion to
[AR_DIORAMA_REDESIGN_PLAN.md](AR_DIORAMA_REDESIGN_PLAN.md) (phase references like
**V3** / **L2** point there). Useful as a self-assessment checklist, for writing a
portfolio/README "what I learned" section, or for interview prep.

---

## 1. WebXR — building AR for the real web

The rarest skill in this stack: most web developers have never touched a raw WebXR
session.

| Skill | Where it's exercised |
|---|---|
| Capability detection & graceful gating (`isSessionSupported('immersive-ar')`, advisory vs blocking checks, a `?forceList` dev escape hatch) | [App.jsx](../src/App.jsx), [UnsupportedScreen.jsx](../src/components/UnsupportedScreen.jsx) |
| Session lifecycle: request → configure → render loop → teardown, and why teardown discipline matters (GPU resources, ended sessions, stale refs) | [ARPreview.jsx](../src/ar/ARPreview.jsx) `startSession` / `teardown` |
| Reference spaces (`viewer`, `local`, `local-floor`) and fallbacks across devices | `setReferenceSpaceType` try/catch |
| **Hit-testing**: dual sources (viewer ray for phones, tracked-pointer controller ray for Quest), refreshing on `inputsourceschange`, per-frame pose → reticle | `startSession` hit-test block |
| XR input events: `select` vs `squeezestart`, mapping one event vocabulary onto both touch and controllers | place / intensity handlers |
| `dom-overlay` — what it is, and the hard lesson that **Quest Browser doesn't render it**, forcing in-scene UI (drives the entire L4 phase) | ARPreview overlay + plan **V6/L4** |
| Designing one experience for two device classes (phone handheld AR vs headset) with shared state and divergent I/O | throughout `src/ar/` |

**Interview-ready claims:** "I've shipped a raw WebXR `immersive-ar` experience
without a framework — session management, hit-test placement, controller and
touch input, cross-device fallbacks."

## 2. Three.js — from scene graph to GPU-mindful rendering

Built bottom-up (no react-three-fiber until the deliberate **L6** comparison), so
the knowledge is of Three itself, not a wrapper.

- **Scene-graph fundamentals** — groups, transforms, matrix decompose (placing the
  model from a reticle pose), `matrixAutoUpdate` control.
- **Geometry from raw data** — building `BufferGeometry` + `Float32Array`
  attributes by hand for pipes, rain, flow particles, spill fountains
  ([stormScene.js](../src/ar/stormScene.js)); `ShapeGeometry` from GeoJSON rings.
- **Instancing** — `InstancedMesh` for 60 risk cells + 40 clusters with
  per-instance matrix and color; why this keeps draw calls flat
  (`buildRiskColumns`, `buildClusters`).
- **Particle systems** — `Points` with draw-range-based density (rain),
  arc-length-parameterized motion along polylines (pipe flow), parametric
  fountain arcs (overflow spill).
- **Transparency discipline** — `depthWrite: false`, draw order, overdraw cost;
  becomes a first-class design constraint in the **V3** cutaway.
- **Canvas textures & sprites** — runtime-drawn label panels (`makeLabelSprite`),
  later contrasted with SDF text (**L4**).
- **Resource lifecycle** — explicit `dispose()` of geometries/materials/textures;
  understanding that the GC does *not* free GPU memory.
- **Animation loops** — `setAnimationLoop` under XR, easing toward targets,
  per-frame mutation without allocation; upgraded to framerate-independent
  damping in **L5**.
- (Planned, **V1–V3/V7**) procedural solids (the puck), texture budgets,
  cheap lighting trade-offs (`MeshBasicMaterial` vs `MeshLambertMaterial`).

## 3. Geospatial computation — doing GIS by hand

The project deliberately replaces most of Turf with hand-rolled metric geometry,
so the underlying math is learned, not imported:

- **Projections**: equirectangular lng/lat → local meters approximation, why
  `cos(lat)` corrects longitude spacing, axis conventions (north = −Z)
  ([projection.js](../src/ar/projection.js)).
- **Spatial hashing**: O(n) grid binning with integer col/row keys instead of
  per-cell polygon tests ([useUrbanRisk.js](../src/hooks/useUrbanRisk.js),
  [useArHotspots.js](../src/hooks/useArHotspots.js)).
- **Point-in-polygon** (ray casting), bbox pre-filtering, squared-distance
  comparisons to avoid `sqrt` ([useStormARData.js](../src/ar/useStormARData.js)).
- **Polyline math**: arc-length tables, midpoints, point-to-segment proximity.
- **GeoJSON fluency**: Point/LineString/MultiLineString/Polygon/MultiPolygon
  handling, ring extraction and sampling, defensive validation of real public
  data (`hasValidPoint`).
- **Working with real open data**: NYC OpenData / Open Sewer Atlas quirks —
  inconsistent property casing (`spdes` vs `SPDES`), missing fields, oversized
  payloads, lazy vs eager loading strategy.

## 4. Analytical modeling — turning data into a defensible score

- **Composite indexing**: multi-factor risk score with min-max normalization,
  weight renormalization, and the reasons behind each step
  ([useUrbanRisk.js](../src/hooks/useUrbanRisk.js)).
- **Statistics**: Pearson correlation from scratch, interpreting |r| bands,
  auto-generating plain-English insights — including the "two correlated factors
  double-count one signal" caveat.
- **Heuristic design**: the hotspot ranking (complaint density blended with risk
  peak) and the conceptual storm-load model — weighted vulnerability factors,
  intensity curves (`pow(norm, 0.85)`), thresholds driving discrete visual states
  ([stormModel.js](../src/ar/stormModel.js)).
- **Intellectual honesty in viz**: designing a model that *looks* like simulation
  while labeling it conceptual everywhere — the discipline of not overclaiming
  ("Conceptual simulation — not a hydrological prediction").

## 5. React architecture (without a framework crutch)

- **Custom hooks as an analytics layer** — each hook owns one derivation, memoized
  on its inputs; the two-stage memo split in `useUrbanRisk` (expensive grid vs
  cheap re-weighting) is a textbook `useMemo` dependency-design lesson.
- **Escaping React for per-frame work** — refs feeding a rAF loop, and *why* that
  pattern exists (re-rendering at 72 fps is a non-starter); then in **L2** the
  cleaner formulation: **transient (`getState`/`subscribe`) vs reactive (hook)**
  state with one zustand store.
- **Effect hygiene** — `AbortController` fetch cancellation, cancelled flags,
  one-shot lazy loads, teardown on unmount; conditional-enable patterns
  (`enabled` props) to gate expensive work.
- **State minimalism** — the whole app runs on four `useState`s; everything else
  is derived. Knowing when you *don't* need a state library is half of knowing
  state libraries.

## 6. The ecosystem libraries — and the judgment of when to use them

Track L is structured so each library is learned against a hand-rolled baseline,
which produces *opinions*, not just usage:

| Library | Skill gained | The judgment lesson |
|---|---|---|
| **zustand** (L2) | store design, selectors, transient subscriptions in a render loop | when React state stops being the right tool |
| **Raycaster + three-mesh-bvh** (L3) | ray construction from controller pose / screen tap, `instanceId` → data mapping, BVH acceleration | measuring before adopting — proving BVH is overkill at ~120 objects, and knowing when it isn't |
| **troika-three-text** (L4) | SDF text rendering, billboarding, depth-test trade-offs, label budgets | why canvas sprites break down (small sizes, oblique angles) |
| **maath** (L5) | exponential damping, framerate-independent animation | spotting the subtle bug class: `lerp` with fixed `dt` *looks* right at 60 Hz and drifts at 90 Hz |
| **R3F + @react-three/xr + drei** (L6) | declarative scene graphs, `useFrame`, `<Interactive>` | a written, evidence-based defense of imperative vs declarative 3D for *this* app |

## 7. Performance engineering for constrained GPUs

Mobile AR + Quest Browser is one of the most performance-hostile targets on the
web; the project enforces it as a discipline:

- **Budgeting up front** — explicit caps on scene content (6 basins / 8 pipes /
  12 CSOs / 40 clusters / 60 cells), draw calls, triangles, textures, particles,
  live text objects ([useStormARData.js](../src/ar/useStormARData.js) + plan
  budget table).
- **Summarize, never render raw** — clustering, sampling rings to ≤72 points,
  dropping stubs; the data-prep layer exists *because* of the render budget.
- **Zero-allocation frame loops** — reusing arrays/objects in `update`.
- **Measure-first culture** — baseline FPS capture (V0), before/after captures
  (L5), adopt-or-remove based on measurement (L3).
- **Transparency/overdraw awareness** — the V3 wall band is the plan's named
  riskiest item, with a fallback ready.

## 8. Product & visualization design

- **Progressive disclosure of a system**: four storm states as a narrative arc
  (baseline → inputs → stress → failure), each state visually distinct.
- **Color as semantics**: a restrained civic palette where clay/orange is
  *reserved* for failure so it reads as a warning — encoding meaning, not
  decoration.
- **Information design for XR**: what belongs in DOM vs in-scene, label budgets,
  callout auto-hiding so spectacle states stay legible.
- **Accessibility habits**: `role="alert"`, `aria-live`, `aria-label`s, keeping
  a11y affordances when restyling controls (V6's invisible −/+ buttons).
- **Designing the failure path**: the unsupported-device screen as a first-class
  product surface, not an afterthought.

## 9. Engineering practice & process

- **Phased planning**: decomposing a big visual goal into dependency-ordered
  phases with exit criteria and checkpoint artifacts
  ([AR_DIORAMA_REDESIGN_PLAN.md](AR_DIORAMA_REDESIGN_PLAN.md)).
- **Refactoring legacy scope away**: the 2D-dashboard → AR-only pivot — deleting
  working code on purpose, keeping only what the new product consumes
  ([AR_ONLY_REFACTOR_PLAN.md](AR_ONLY_REFACTOR_PLAN.md)).
- **Documentation as a deliverable**: keeping a technical doc that matches the
  code ([Documentation.md](Documentation.md)), including documenting known bugs
  honestly (the anchor-wiring bug in §3).
- **Branch-based experimentation**: L6's rule — experiments live on branches with
  a written comparison, main stays shippable.
- **Deploying static SPAs**: Vite `base` config, `gh-pages`, serving 100+ MB of
  static GeoJSON sensibly (lazy loading, validation).

---

## Resume / portfolio bullet bank

Honest one-liners this project backs up (tense assumes the plan is completed):

- Built a WebXR `immersive-ar` data-visualization app in raw Three.js — hit-test
  placement, controller + touch input, and cross-device support for Android
  Chrome and Meta Quest Browser, without a 3D framework.
- Engineered a geospatial pipeline that reduces ~140 MB of NYC open data to a
  render-budgeted AR scene via spatial hashing, grid clustering, and hand-rolled
  metric geometry (no GIS library on the hot path).
- Designed a multi-factor urban-risk index with normalization, weighted
  composites, and Pearson-correlation-driven auto-insights.
- Held a hard GPU budget on mobile/standalone-headset hardware: instanced
  rendering, zero-allocation frame loops, transparency/overdraw audits.
- Adopted ecosystem libraries (zustand, three-mesh-bvh, troika-three-text, maath)
  against hand-rolled baselines, with measured before/after justification for
  each — including rejecting one as overkill with data.
- Wrote an evidence-based imperative-vs-declarative (vanilla Three vs R3F)
  comparison from parallel implementations of the same XR scene.

## Self-assessment checklist

Can you, without looking at the code…

- [ ] Explain the difference between `viewer` and `local-floor` reference spaces,
      and why the reticle uses hit-test results from two sources?
- [ ] Sketch how lng/lat becomes tabletop X/Z, including the `cos(lat)` term and
      the sign of Z?
- [ ] Say why `InstancedMesh` + per-instance color beats 100 meshes, and how an
      `instanceId` maps back to a data record?
- [ ] Explain why `lerp(a, b, 0.1)` per frame animates faster at 90 Hz than
      60 Hz, and write the damp-based fix?
- [ ] Describe transient vs reactive store reads and pick the right one for a
      rAF loop vs a slider label?
- [ ] Argue both sides of vanilla Three vs R3F for this app, with one concrete
      pain point of each you personally hit?
- [ ] State the project's render budget from memory and name the riskiest
      overdraw item?

When every box checks, the learning goals of this project are met.
