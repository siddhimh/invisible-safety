# AR Storm Diorama — Redesign & Learning Plan

Phased plan to evolve the AR Storm Event Simulation from the current flat-plane scene into the **circular tabletop diorama** shown in the target mockup: a thick, stone/asphalt-textured puck with a city-block surface, an underground cutaway revealing the sewer network inside the volume, and storm states that escalate from calm to an overflow that visibly spills over the puck's edge.

This project doubles as a **learning curve**, so the plan has two tracks:

- **Track V (Visual)** — V0–V7: the diorama redesign itself.
- **Track L (Learning / tech adoption)** — L1–L6: deliberately introducing one ecosystem library at a time (zustand, raycasting + three-mesh-bvh, troika-three-text, maath, and an R3F experiment), each with a stated *learn* goal and a concrete checkpoint. Track L phases slot between Track V phases — see the **Interleaved sequencing** section at the end.

Other notes:

- **Scope:** visual + interaction redesign of `src/ar/` and the AR overlay UI in [ARPreview.jsx](../src/ar/ARPreview.jsx), plus the Track L tech adoptions.
- **Non-goals:** no change to the analytics hooks, ranking logic, or the conceptual load model in [stormModel.js](../src/ar/stormModel.js) — the four storm levels (Calm / Light rain / Heavy rain / Overflow) map 1:1 onto the mockup's four states.
- **Styling:** CSS / visual-design specifics for the DOM overlay are intentionally *not* prescribed here — to be specified separately by the project owner.
- **Reference:** target mockup (four-state diorama panel). Keep this image in `docs/assets/` once exported.



## Target description (what "done" looks like)

A circular diorama ~1.1 m across at tabletop scale (`AR_RADIUS_M = 500` real meters × `AR_SCALE`), composed of:

1. **The puck** — a low, thick cylinder. Dark stone/asphalt side wall with subtle texture, a slightly raised rim, and a small embossed **"N" north indicator** on the side. The model reads as a physical object sitting on the table.
2. **Surface layer** — circular city-block top: dark asphalt with a street-grid texture; **risk cells** are raised rectangular blocks (height + warmth by risk), beveled so they read as buildings/blocks, not bar-chart columns.
3. **Sewershed layer** — translucent blue basin region(s) + boundary line draped on
   the surface, clipped to the circle.
4. **Underground layer** — the trunk-line network rendered *inside* the puck
   volume, visible through a translucent band / cutaway in the side wall, with teal
   flow particles. The selected **CSO outfall** is a glowing teal pin that pierces
   surface → underground.
5. **Storm dynamics per level** —
   - **Calm:** static baseline, callout-friendly.
   - **Light rain:** rain confined to the cylinder, runoff sheen accumulating in
     the sewershed, pipe flow speeds up.
   - **Heavy rain:** high-risk cells rise & pulse warm, complaint clusters surface
     as red markers, flow particles fast/bright, intensity slider at "Heavy".
   - **Overflow:** outfall discharges an **orange waterfall over the puck edge**,
     high-risk areas lock at capacity color, and an animated **stress trace**
     (complaints → risk cell → pipe → CSO) draws the causal path in orange dashes.
6. **Interaction** — beyond place + intensity: **point-and-select** any scene
   element (risk block, CSO, cluster) via controller ray / screen tap, with an
   in-world label showing its name + one stat (Track L3/L4).
7. **Overlay UI** — anchor info card, a horizontal **Storm Intensity slider**
   (Calm · Light · Heavy · Overflow), a **High Storm Stress alert card** (CSO id,
   complaints, peak risk, *primary driver* sentence) at overflow, in-scene callout
   labels with leader lines, a compact legend, and the persistent conceptual-model
   disclaimer.

---

## Gap analysis (current code → target)

| Element | Today ([stormScene.js](../src/ar/stormScene.js)) | Target |
|---|---|---|
| Ground | square `PlaneGeometry` + `GridHelper` | circular puck: cylinder side wall + textured circular top + rim + N marker |
| Scene bounds | square plane larger than data radius | everything clipped to the 500 m circle (data already is) |
| Risk cells | plain instanced `BoxGeometry` | beveled block instances, block-texture, capacity state at overflow |
| Pipes | `Line` at −2.5 m under an opaque plane | network inside the puck, visible via translucent wall band / cutaway |
| CSO nodes | slate cylinders | selected outfall = tall glowing pin; others = smaller markers |
| Rain | square-area point fall | cylinder-confined fall + surface runoff cue |
| Overflow | particle fountain at node | edge waterfall + stress trace + capacity highlights |
| Labels | single canvas sprite | in-world SDF text (troika) + DOM callouts on phones |
| Selection | none (list pick only, pre-session) | in-scene ray-pick of blocks/CSOs/clusters |
| Intensity UI | − / pips / + | labeled slider, four stops |
| Intensity state | React state + `intensityRef` mirror hack | one zustand store; scene reads transiently, React reactively |
| Stress info | sprite text | DOM alert card incl. computed "primary driver" |
| Animation eases | hand-rolled `lerp` with fixed `dt = 1/60` | `maath/easing damp` (truly framerate-independent) |

---

# Track V — Visual redesign

## V0 — Prerequisites & fixes

Unblocks everything; no visual work lands until these pass.

- [OK ] **Fix the anchor wiring bug** in [App.jsx](../src/App.jsx):
      `setAnchor({ object: h.feature, hotspot: h, layerId: 'cso-locations' })`
      (today the hotspot record is stored as `object`, so `featureCenter` returns
      `null`, `arData` never resolves, and **Start AR is permanently disabled**).
      Verify the splash anchor card then renders id / complaints / peak risk.
- [OK ] Fix the `HotspotList` error banner (boolean rendered inline → empty reason);
      pass a message string or render a fixed string.
- [OK ] Remove debug `console.log("XR support:", …)`.
- [OK] Delete dead `src/Appppp.jsx` (broken imports, superseded).
- [ ] Capture a **baseline performance number** on target hardware (Quest browser +
      one Android phone): frame time at level 3 with the current scene. Every later
      phase must stay within budget (see Performance notes).

**Exit criteria:** AR session starts from a hotspot tap on Quest and Android;
baseline FPS recorded.

## V1 — The circular puck (structure)

Replace the square ground with the diorama body. Pure geometry, no textures yet.

- [ ] Build `buildPuck()` replacing `buildGround()`:
  - [ ] Side wall: open-ended `CylinderGeometry` (radius = `AR_RADIUS_M`,
        height ≈ 60–80 local meters so the underground layer has room).
  - [ ] Top cap: `CircleGeometry` at y = 0 (asphalt color for now).
  - [ ] Bottom cap (visible when users crouch / model is on a low table).
  - [ ] Raised rim: thin torus or extruded ring at the top edge.
- [ ] **Clip all surface content to the circle.** Data is already radius-filtered;
      geometry that *straddles* the edge still needs handling:
  - [ ] Basin fills/rings: clamp ring vertices to the radius (simplest viable
        approach; `clippingPlanes` are planar-only so unsuitable for a circle).
  - [ ] Pipes: clamp segment vertices to radius (drop outside runs).
  - [ ] Grid/streets: switch from `GridHelper` to a circular top texture (V2)
        so no clipping is needed.
- [ ] North indicator: small "N" decal/sprite on the side wall at −Z (north is −Z
      per [projection.js](../src/ar/projection.js)).
- [ ] Re-verify reticle placement + `AR_SCALE`: puck should land ~table-sized
      (≈1.0–1.2 m diameter); adjust `AR_SCALE` if the added height feels too tall.

**Exit criteria:** model reads as a solid circular object from all angles; nothing
pokes past the rim; placement still works on both device classes.

## V2 — Surface & risk blocks (look)

Make the top read as a city, and risk cells read as blocks.

- [ ] **Top texture:** dark asphalt + street-grid texture on the circular cap.
      Author one tileable texture (or generate via canvas, like the label sprite)
      — keep ≤ 1024² and reuse; no per-frame canvas updates.
- [ ] **Risk blocks:** replace plain boxes with a beveled/rounded-edge block
      geometry (single geometry, still `InstancedMesh`); subtle top-face texture.
  - [ ] Keep height/color = `risk × intensity` ramp (slate → clay) from
        `buildRiskColumns`, retuned to block proportions (lower max height than the
        current 46 m so the surface stays diorama-like).
  - [ ] Add an emissive-ish "capacity" tint state for V5.
- [ ] **Sewershed:** restyle fill to the mockup's blue translucent region;
      boundary line slightly raised; verify draped order vs. blocks (basins under
      blocks).
- [ ] **Complaint clusters:** restyle from grey disks to small red dot markers;
      keep hidden until Heavy rain (V4 wires visibility to level).
- [ ] **CSO pin:** selected outfall (the anchor) becomes a tall teal pin
      (shaft + sphere head) with a soft glow disc at its base; the other ≤ 11
      outfalls stay small low markers. Requires passing *which* CSO is the anchor
      into `buildStormScene` (match by SPDES id from `selectedFeature`).

**Exit criteria:** calm-state screenshot is recognizably the mockup's panel 1
(minus callouts); instance counts unchanged; FPS within budget.

## V3 — Underground cutaway

The signature shot: pipes visible inside the puck.

- [ ] Move pipe network rendering *into* the puck volume (it already sits at
      −2.5 m; deepen to mid-wall height).
- [ ] Make the side wall reveal it. Options, in preference order:
  1. **Translucent band** — wall is two stacked materials: opaque upper lip,
     semi-transparent lower band (opacity ~0.35) so the teal network glows
     through. Cheapest; no new geometry.
  2. **Cutaway wedge** — remove a 90° arc of the wall facing the user at
     placement time, with a darker "soil" interior material. More literal, more
     work (cap the cut faces).
  - [ ] Prototype option 1 first; only do 2 if 1 reads poorly on device.
- [ ] Thicken pipes: replace `LineBasicMaterial` lines (1 px on most mobile GPUs)
      with extruded quads/ribbons or `Line2`/`LineMaterial` (three/examples) with
      world-unit width (`TubeGeometry` per segment is too heavy).
- [ ] Pipe flow particles: unchanged logic ([buildPipeFlow](../src/ar/stormScene.js)),
      re-tuned point size/brightness so flow is visible through the wall band.
- [ ] CSO pin extends down to pipe depth, visually connecting surface → network.

**Exit criteria:** from a seated viewpoint the network is clearly visible inside
the volume; flow direction readable at Light rain; overdraw from transparency does
not blow the frame budget (watch this — transparent cylinder + interior is the
riskiest perf item in the plan).

## V4 — Storm dynamics (levels 0–2)

Wire the visual escalation of panels 1→3 of the mockup. Logic stays in
`setStormIntensity` / `update`; this phase is retuning + two new cues.

- [ ] **Rain confinement:** spawn/wrap rain points within the cylinder footprint
      (current layout fills the old square ground; switch the pseudo-random XY
      distribution to polar). Rain must not fall outside the puck.
- [ ] **Runoff cue (Light rain):** animated sheen on the sewershed water surface —
      reuse the existing accumulation mesh, add slow UV/normal scroll or opacity
      ripple tied to `frac`.
- [ ] **Risk-cell pulse (Heavy rain):** cells whose `risk` is in the top band pulse
      scale/emissive at level ≥ 2 (the mockup's "higher risk cells rise and pulse").
      Drive from per-instance attribute, animate in `update` (instanced — no
      per-cell meshes).
- [ ] **Complaint clusters appear at level ≥ 2** (fade in via material opacity).
- [ ] **Flow speed/brightness curve** retuned per level: calm 0 → light slow →
      heavy fast/bright (`8 + 26·frac` baseline is fine; brighten at 2+).
- [ ] Easing: do this phase together with **L5 (maath)** — new eases should be
      written as `damp` from the start instead of adding more `lerp`-with-fixed-dt.

**Exit criteria:** stepping 0→1→2 on-device reproduces mockup panels 1–3's
*behavioral* differences (rain, runoff, flow, pulsing cells, clusters), each level
visually distinct within ~1 s of the change.

## V5 — Overflow spectacle (level 3)

Panel 4: the payoff state.

- [ ] **Edge waterfall:** at `overflow` state, the *selected/most-stressed* outfall
      emits an orange spill that arcs from the pin, crosses the rim, and falls down
      the puck's outside wall to table level.
  - [ ] Implementation: enlarge the existing spill particle system (it already
        exists per-CSO in `buildCsos`) — more particles (~150 for the hero outfall
        only), gravity arc toward the **nearest rim point** (precompute direction
        from outfall XZ → normalize to radius), then straight fall down the wall;
        fade at the bottom.
  - [ ] Optional splash decal at the base (single sprite, opacity-pulsed).
  - [ ] Non-hero overflowing outfalls keep the current small fountain.
- [ ] **Stress trace:** animated dashed orange path connecting
      *densest complaint cluster → highest-risk cell → nearest pipe vertex → CSO pin*.
  - [ ] Path endpoints are all already computed in
        [useStormARData.js](../src/ar/useStormARData.js) (clusters sorted by count,
        cells by distance with risk, pipes with vertices, hero CSO) — add a small
        `stressTrace: [ [x,z], … ]` array to its return value.
  - [ ] Render as a dashed `Line` (or marching point sprites) elevated ~2 m above
        the surface; animate dash offset in `update`; visible only at level 3.
- [ ] **Capacity state:** at level 3, top-band risk cells lock to the warm
      "at capacity" tint (no pulse — steady), matching "high-risk areas at capacity".
- [ ] Floating label sprite from the old scene is **retired** in favor of troika
      labels (L4) + the DOM alert card (V6); keep until then.

**Exit criteria:** level 3 on-device shows rim waterfall + stress trace + capacity
cells simultaneously at budget FPS; trace endpoints visibly correspond to real
scene elements.

## V6 — Overlay UI & callouts

Match the mockup's information design. DOM on phones (dom-overlay); **Quest gets
in-scene equivalents via troika text (L4)** since Quest Browser ignores dom-overlay.
CSS / visual styling specifics deferred — to be specified by the project owner.

- [ ] **Storm Intensity slider** replacing the −/pips/+ control: horizontal track,
      four labeled stops (Calm · Light · Heavy · Overflow), draggable thumb +
      tap-on-stop, writing to the zustand store (L2). Overflow stop styled clay.
      Keep −/+ as invisible a11y buttons or `aria-valuetext` on the slider.
- [ ] **Anchor card** (top, persistent once placed): `CSO: <id> — <waterbody>`,
      nearby complaints, peak local risk, receives. (Data already wired via
      `selectedFeature.hotspot` after the V0 fix.)
- [ ] **High Storm Stress alert card** (appears at level 3): warning glyph, CSO id,
      complaints, peak risk, and a **primary-driver sentence** derived from the
      hero CSO's largest vulnerability factor
      (`factors` from `useStormARData` × `FACTOR_WEIGHTS` →
      e.g. *"Primary driver: dense 311 cluster near sewer corridor"* for
      `complaint`/`infra`). Include the conceptual-model disclaimer line.
- [ ] **Callout labels:** leader-line labels for legend items
      (Risk cells, Sewershed boundary, Sewer pipes, CSO outfall; rain/runoff at
      level ≥ 1).
  - [ ] Phones: DOM markers projected from 3D anchor points each frame
        (`Vector3.project(camera)`).
  - [ ] Quest: troika in-world labels (L4), respecting the ~3-label budget.
  - [ ] Callouts auto-hide at Heavy/Overflow except the ones the mockup keeps
        (don't clutter the spectacle).
- [ ] **Legend** chip row (collapsible) matching final colors: risk (clay),
      sewershed (blue), pipes (teal), flow (teal dots), CSO (teal), complaints
      (red), overflow (orange).
- [ ] **How-to-interact strip** on the splash (Place / Adjust rain / Explore /
      Focus points) replacing the current text-only tip block.
- [ ] State captions: small phase title ("Light rain — runoff enters the system")
      that updates with level, mirroring the mockup's panel headers.

**Exit criteria:** phone session is visually 1:1 with the mockup's UI inventory;
Quest session has functional equivalents for everything (slider state via
trigger/grip, alert/labels via troika).

## V7 — Materials, polish & performance hardening

- [ ] Texture pass: stone/asphalt side wall, surface street grid, block tops —
      consistent 1–2 texture atlas, mipmapped, ≤ 2 MB total added payload.
- [ ] Consider one `HemisphereLight` + swapping puck/block materials to
      `MeshLambertMaterial` for cheap shading (everything is `MeshBasicMaterial`
      today — flat). Measure first; skip if Quest frame time suffers.
- [ ] Fake ambient occlusion: darkened ring texture where blocks meet the surface,
      baked into the top texture (no SSAO).
- [ ] Transparency audit: sort/limit overlapping transparent layers (wall band +
      basin fill + water + clusters can stack 4 deep) — cap at 2 visible layers per
      pixel where possible, `depthWrite:false` discipline as today.
- [ ] Dispose audit: every new geometry/material/texture added in V1–V6 and L2–L5
      freed in `dispose()` (troika `Text` objects have their own `dispose()`).
- [ ] Device matrix sign-off: Quest 3 (Browser), Pixel/Samsung Chrome Android.
- [ ] Refresh [Documentation.md](Documentation.md) §6 + README screenshots.

---

# Track L — Learning / tech adoption

One library per phase, each with an explicit **Learn** goal and a demonstrable
**Checkpoint**. The point is understanding *why* each tool exists, not just using
it — including one phase (L3) whose lesson is partly "this tool is overkill here."

## L1 — Vanilla Three.js baseline *(implicit — already underway)*

Track V phases V1–V5 **are** this phase: raw `BufferGeometry`, `InstancedMesh`,
particle systems via `Points`, manual scene-graph lifecycle (`dispose()`), and the
WebXR session/hit-test API without abstractions. Everything later in Track L is
measured against this baseline — that's what makes the comparisons meaningful.

**Learn:** what the ecosystem libraries are abstracting *over*.
**✅ Checkpoint:** the V3 cutaway shot running on Quest, built with zero deps
beyond `three`.

## L2 — State foundation (zustand)

Today's intensity state lives in **three places at once** — React `useState`, an
`intensityRef` mirror for the rAF loop and XR event closures, and the scene's
internal `level` ([ARPreview.jsx](../src/ar/ARPreview.jsx) `applyIntensity`). This
phase collapses them into one source of truth.

- [ ] Install `zustand`.
- [ ] One store: `{ intensity, phase, anchor, selectedElement }` (+ actions:
      `raise/lower/setIntensity`, `setPhase`, `select`).
- [ ] Scene loop + XR event handlers read via `getState()` / `subscribe()` —
      **transient**, no React involvement.
- [ ] React UI (slider, pips, alert card, captions) reads via the hook —
      **reactive**, re-renders as designed.
- [ ] Replace the grip-cycle ref hack: `onSelect` / `onSqueeze` call store actions;
      the scene applies intensity from a store subscription instead of
      `sceneHandleRef.current?.setStormIntensity(...)` being called from React.
- [ ] Move `phase` (`idle | searching | placed`) and the anchor into the store so
      `ARPreview` stops threading them through refs/props.

**Learn:** transient (per-frame, `subscribe`/`getState`) vs reactive (re-render,
hook selector) state — and why mixing them via refs is the failure mode zustand
exists to prevent.
**✅ Checkpoint:** grip-mash on Quest changes the scene with **zero React
re-renders** (verify with React DevTools profiler / a render counter).

## L3 — 3D interaction (raycaster → three-mesh-bvh)

Make the diorama inspectable: point at a block / CSO / cluster and select it.

- [ ] Vanilla `THREE.Raycaster`:
  - [ ] Quest: ray from the controller's `targetRaySpace` pose each frame
        (the session already tracks the active `tracked-pointer` input source for
        hit-testing — reuse that plumbing).
  - [ ] Phone: ray from screen tap via camera unproject (post-placement taps
        currently mean "raise intensity" — define precedence: a tap that hits a
        selectable object selects; a miss steps intensity).
- [ ] `InstancedMesh` hits → `intersection.instanceId` → data record mapping
      (risk cell, cluster) — keep parallel arrays `cells[i]` / `clusters[i]`
      alongside the meshes; CSO pins are individual meshes → map by reference.
- [ ] Write the hit into the store (`selectedElement: { kind, index, data }`);
      the scene subscribes and highlights (emissive tint / scale tick) the hit
      object; selecting again or hitting empty space clears.
- [ ] **Then** add `three-mesh-bvh`:
  - [ ] Wire `computeBoundsTree` / `acceleratedRaycast` onto the selectable
        geometries; measure raycast cost before/after at this scene's scale
        (~60 cells + 40 clusters + 12 CSOs ≈ 120 objects).
  - [ ] Write up (a paragraph in this doc or the PR) **why it's overkill at ~120
        low-poly objects** (BVH pays off on high-triangle meshes / many-thousand-
        object scenes, not a handful of instanced boxes) **and when it isn't**
        (e.g. raycasting against the full-res sewershed polygon mesh or a future
        detailed building layer). Keep or remove it based on the measurement —
        the measurement *is* the deliverable.

**Learn:** raycasting mechanics (ray spaces, instanceId mapping), and how to judge
when an acceleration structure earns its complexity.
**✅ Checkpoint:** point-and-select working on Quest — record a short **video**.

## L4 — In-world labels (troika-three-text)

Needed because **Quest Browser ignores `dom-overlay`** — all in-session UI on
headset must live in-scene. Replaces the hand-rolled canvas-sprite label.

- [ ] Install `troika-three-text`.
- [ ] Anchor title above the model: `CSO <id> — <waterbody>` (replaces
      `makeLabelSprite`'s role; delete the canvas-sprite path once stable).
- [ ] One label on `selectedElement` (from L3): name + one stat
      (risk %, complaint count, or vulnerability), repositioned on selection
      change via store subscription.
- [ ] Billboarding: face the camera each frame (copy camera quaternion in
      `update`); decide `depthTest: false` (always readable, can look pasted-on)
      vs `true` (occludes naturally, can hide behind blocks) per label.
- [ ] **Label budget: ~3 max** live `Text` objects — troika SDF generation is
      async + has per-object cost; pool and re-text rather than create/destroy.
- [ ] Dispose troika objects in the scene's `dispose()`.

**Learn:** how SDF text rendering works (and why it beats canvas textures at small
sizes/oblique angles), billboarding, depth-test trade-offs, and budgeting text in
an XR scene.
**✅ Checkpoint:** **in-headset screenshot** of the anchored title + a selection
label, for design review.

## L5 — Motion polish (maath)

The scene currently fakes framerate-independence with `lerp(a, b, k·dt)` and a
*hard-coded* `dt = 1/60` ([stormScene.js](../src/ar/stormScene.js) `update`) —
i.e. it's not actually framerate-independent at Quest's 72/90 Hz; eases run faster
on headset than on a 60 Hz phone.

- [ ] Install `maath`; use `maath/easing`'s `damp` / `damp3`.
- [ ] Convert intensity-driven eases to damp toward targets with **real** frame
      delta: rain density/opacity, pipe-flow opacity, basin water level/opacity,
      CSO pulse color/scale approach, spill opacity.
- [ ] Smooth the **reticle**: damp position/orientation toward the latest hit-test
      pose instead of snapping per frame (kills hit-test jitter on phones).
- [ ] Remove the fixed `dt = 1/60`; pass measured delta from the rAF loop
      (clamped, e.g. ≤ 1/30, to survive frame hitches).

**Learn:** why `lerp(a, b, k)` per frame is framerate-*dependent* (the remaining
distance decays by `(1−k)^frames`, and frames/sec varies) while exponential
`damp(…, smoothTime, dt)` converges identically at any refresh rate.
**✅ Checkpoint:** **before/after capture** — same intensity step recorded at
phone 60 Hz vs Quest 72/90 Hz showing matched animation feel (and steadier
reticle).

## L6 — R3F experiment (branch only)

A deliberate compare-and-contrast, *not* a migration. Main branch stays vanilla.

- [ ] `git checkout -b r3f-ar-experiment`; install `@react-three/fiber`,
      `@react-three/xr`, `@react-three/drei`.
- [ ] Rebuild **only** the scene as `StormSceneR3F`:
  - [ ] declarative scene graph (groups/meshes as JSX, instanced via drei),
  - [ ] `useFrame` replacing the manual `setAnimationLoop` body,
  - [ ] `<Interactive>` (or `useXREvents`) replacing the hand-rolled
        select/squeeze listeners and L3 raycasting,
  - [ ] zustand store (L2) plugs in unchanged — note that this is the payoff of
        keeping state outside React components.
- [ ] Write a **comparison README** on the branch: lines of code, what got
      shorter (lifecycle, events, disposal), what got harder (imperative
      per-frame particle updates, XR session options, debugging through the
      reconciler), perf on Quest vs the vanilla build, and **which approach you'd
      defend** for this project and why.

**Learn:** what R3F's reconciler actually manages for you, where its abstractions
chafe in an XR + particles + imperative-animation app, and how to argue the choice
either way from first-hand evidence.
**✅ Checkpoint:** the **branch README** with the comparison.

---

## Performance budget (hold every phase to this)

| Metric | Budget |
|---|---|
| Frame rate | ≥ 60 fps phone, ≥ 72 fps Quest, at level 3 |
| Draw calls | ≤ ~40 (instancing for cells/clusters/blocks stays mandatory) |
| Triangles | ≤ ~80 k total scene |
| Textures | ≤ 4 textures, ≤ 1024², mipmapped |
| Particles | rain 600 (existing) + hero spill ≤ 150 + flow ≤ 80 |
| Text | ≤ 3 live troika `Text` objects |
| JS per frame | no allocations in `update` (current code complies — keep it through every Track L change) |

Riskiest items: V3 transparency overdraw (wall band), V6 per-frame DOM projection,
L4 troika async text regeneration if labels re-text too often. All have listed
fallbacks/budgets.

---

## Phase → mockup panel map

| Mockup panel | Delivered by |
|---|---|
| 1. Calm / base state | V1–V3 (+ callouts in V6/L4) |
| 2. Light rain | V4 + L5 |
| 3. Heavy rain (+ slider) | V4 (+ slider in V6, store in L2) |
| 4. Overflow (+ alert card) | V5 (+ card in V6) |
| "Focus points / explore" interaction | L3 + L4 |
| Left column (list / unsupported screens) | already shipped — restyle only if colors drift |

## Interleaved sequencing

Ordered by dependency; each Track L phase lands right before the Track V work that consumes it.

| # | Phase | Why here |

| 1 | **V0** prerequisites | unblocks AR entirely |
| 2 | **V1** circular puck | structural base for everything |
| 3 | **L2** zustand | get state right *before* dynamics/UI multiply the ref hack |
| 4 | **V2** surface & blocks | first real look |
| 5 | **V3** underground cutaway | signature shot; ends **L1** baseline |
| 6 | **V4 + L5** dynamics with `damp` | write new eases correctly once, not twice |
| 7 | **L3** raycast selection | needs final meshes (V2/V3) to pick against |
| 8 | **V5** overflow | the payoff state |
| 9 | **L4** troika labels | selection labels (L3) + Quest UI for V6 |
| 10 | **V6** overlay UI & callouts | consumes L2 store + L4 labels |
| 11 | **V7** polish & hardening | gates release |
| 12 | **L6** R3F experiment | anytime after V6; branch-only, no release risk |

Checkpoint artifacts (screenshots/videos into `docs/assets/progress/`): end of V1
(structure), V3 (cutaway), L3 (selection video), V5 (overflow), L4 (headset
screenshot), L5 (before/after), V6 (UI complete), L6 (branch README).
