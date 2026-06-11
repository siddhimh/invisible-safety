import * as THREE from 'three'
import { AR_RADIUS_M, AR_SCALE } from './projection'
import {
  computeLoad,
  intensityNorm,
  OVERFLOW_THRESHOLD,
  PULSE_THRESHOLD,
} from './stormModel'

// ── Civic-infrastructure palette ────────────────────────────────────
// Grounded, desaturated. No neon, no additive glow. Clay/orange is
// reserved strictly for overflow stress so it reads as a warning.
const COL = {
  asphalt: 0x23272e, // ground plane
  grid: 0x3b424c, // ground grid
  basinLine: 0x5b7689, // muted stormwater blue boundary
  basinFill: 0x33414d, // slate basin region
  water: 0x3f6b86, // muted blue accumulation
  pipe: 0x3f5d59, // desaturated teal trunk lines
  flow: 0x6f9a93, // desaturated teal flow particles
  rain: 0x6885a0, // muted blue rain
  cso: 0x7a828c, // slate node (rest)
  csoStress: 0xb5663a, // clay/orange (stress)
  overflow: 0xc2622e, // clay/orange spill
  columnLow: 0x4a5560, // slate (low risk)
  columnHigh: 0xa9663c, // muted clay (high risk)
  label: '#f2efe8', // off-white text
}

const GROUND_SIZE_M = AR_RADIUS_M * 2.2
const PIPE_Y_M = -2.5 // trunk lines sit below the ground plane
const FLOW_Y_M = PIPE_Y_M + 0.1
const WATER_BASE_Y_M = 0.15
const CSO_Y_M = 2
const CSO_RADIUS_M = 3.2
const COLUMN_SIZE_M = 26
const COLUMN_MIN_H = 1.5
const COLUMN_MAX_H = 46
const RAIN_COUNT = 600
const RAIN_TOP_Y_M = 220
const FLOW_PER_PIPE = 10

function lerp(a, b, t) {
  return a + (b - a) * t
}
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

// ── Ground ──────────────────────────────────────────────────────────
function buildGround() {
  const group = new THREE.Group()
  group.name = 'ground'
  const planeGeom = new THREE.PlaneGeometry(GROUND_SIZE_M, GROUND_SIZE_M)
  const planeMat = new THREE.MeshBasicMaterial({
    color: COL.asphalt,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const plane = new THREE.Mesh(planeGeom, planeMat)
  plane.rotation.x = -Math.PI / 2
  group.add(plane)
  const grid = new THREE.GridHelper(GROUND_SIZE_M, 22, COL.grid, COL.grid)
  grid.material.transparent = true
  grid.material.opacity = 0.22
  grid.material.depthWrite = false
  grid.position.y = 0.02
  group.add(grid)
  return group
}

// ── Sewershed basins (boundary + fill + rising accumulation) ────────
function buildBasins(basins) {
  const group = new THREE.Group()
  group.name = 'sewersheds'
  const waters = []
  if (!basins.length) return { group, waters }

  for (const b of basins) {
    const shape = new THREE.Shape()
    shape.moveTo(b.ring[0][0], b.ring[0][1])
    for (let i = 1; i < b.ring.length; i++) shape.lineTo(b.ring[i][0], b.ring[i][1])
    shape.closePath()

    // translucent basin region
    const fillGeom = new THREE.ShapeGeometry(shape)
    const fillMat = new THREE.MeshBasicMaterial({
      color: COL.basinFill,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const fill = new THREE.Mesh(fillGeom, fillMat)
    fill.rotation.x = Math.PI / 2
    fill.position.y = 0.05
    group.add(fill)

    // muted boundary line
    const pts = b.ring.map(([x, z]) => new THREE.Vector3(x, 0.08, z))
    pts.push(pts[0].clone())
    const lineGeom = new THREE.BufferGeometry().setFromPoints(pts)
    const lineMat = new THREE.LineBasicMaterial({
      color: COL.basinLine,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    })
    group.add(new THREE.Line(lineGeom, lineMat))

    // accumulation "water" surface — height + opacity animate with load
    const waterGeom = new THREE.ShapeGeometry(shape)
    const waterMat = new THREE.MeshBasicMaterial({
      color: COL.water,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const water = new THREE.Mesh(waterGeom, waterMat)
    water.rotation.x = Math.PI / 2
    water.position.y = WATER_BASE_Y_M
    group.add(water)
    waters.push({ mesh: water, mat: waterMat, basin: b, curOpacity: 0, curY: WATER_BASE_Y_M })
  }
  return { group, waters }
}

// ── Pipes (static trunk lines) ──────────────────────────────────────
function buildPipes(pipes) {
  const group = new THREE.Group()
  group.name = 'pipes'
  if (!pipes.length) return group
  const mat = new THREE.LineBasicMaterial({
    color: COL.pipe,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  })
  for (const p of pipes) {
    const flat = p.flat
    const positions = new Float32Array((flat.length / 2) * 3)
    for (let i = 0; i < flat.length / 2; i++) {
      positions[i * 3] = flat[i * 2]
      positions[i * 3 + 1] = PIPE_Y_M
      positions[i * 3 + 2] = flat[i * 2 + 1]
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    group.add(new THREE.Line(geom, mat))
  }
  return group
}

// ── Pipe flow particles (speed scales with intensity) ───────────────
function buildPipeFlow(pipes) {
  const group = new THREE.Group()
  group.name = 'pipeFlow'
  if (!pipes.length) return { group, update: () => {}, setSpeed: () => {} }

  const arcTables = pipes.map((p) => {
    const flat = p.flat
    const n = flat.length / 2
    const cum = new Float32Array(n)
    for (let i = 1; i < n; i++) {
      const dx = flat[i * 2] - flat[(i - 1) * 2]
      const dz = flat[i * 2 + 1] - flat[(i - 1) * 2 + 1]
      cum[i] = cum[i - 1] + Math.sqrt(dx * dx + dz * dz)
    }
    return { flat, cum, length: cum[n - 1] || 1 }
  })

  const total = pipes.length * FLOW_PER_PIPE
  const positions = new Float32Array(total * 3)
  const offsets = new Float32Array(total)
  const pipeIdx = new Uint16Array(total)
  for (let p = 0; p < pipes.length; p++) {
    for (let k = 0; k < FLOW_PER_PIPE; k++) {
      const i = p * FLOW_PER_PIPE + k
      offsets[i] = k / FLOW_PER_PIPE
      pipeIdx[i] = p
    }
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({
    color: COL.flow,
    size: 3.2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  const points = new THREE.Points(geom, mat)
  points.frustumCulled = false
  group.add(points)

  const posAttr = geom.getAttribute('position')
  let speed = 0
  let opacityTarget = 0

  function setSpeed(s, op) {
    speed = s
    opacityTarget = op
  }
  function update(t, dt) {
    mat.opacity = lerp(mat.opacity, opacityTarget, clamp01(dt * 4))
    if (speed <= 0 && mat.opacity < 0.02) return
    const arr = posAttr.array
    for (let i = 0; i < total; i++) {
      const tab = arcTables[pipeIdx[i]]
      const phase = (offsets[i] + (t * speed) / tab.length) % 1
      const target = phase * tab.length
      let j = 1
      while (j < tab.cum.length && tab.cum[j] < target) j++
      if (j >= tab.cum.length) j = tab.cum.length - 1
      const segStart = tab.cum[j - 1]
      const segLen = tab.cum[j] - segStart || 1
      const f = (target - segStart) / segLen
      const x0 = tab.flat[(j - 1) * 2]
      const z0 = tab.flat[(j - 1) * 2 + 1]
      const x1 = tab.flat[j * 2]
      const z1 = tab.flat[j * 2 + 1]
      arr[i * 3] = x0 + (x1 - x0) * f
      arr[i * 3 + 1] = FLOW_Y_M
      arr[i * 3 + 2] = z0 + (z1 - z0) * f
    }
    posAttr.needsUpdate = true
  }
  return { group, update, setSpeed }
}

// ── Rain (density via draw-range + opacity) ─────────────────────────
function buildRain() {
  const group = new THREE.Group()
  group.name = 'rain'
  const positions = new Float32Array(RAIN_COUNT * 3)
  const speeds = new Float32Array(RAIN_COUNT)
  const half = GROUND_SIZE_M * 0.5
  for (let i = 0; i < RAIN_COUNT; i++) {
    positions[i * 3] = (i * 53.13) % GROUND_SIZE_M - half
    positions[i * 3 + 1] = (i * 17.7) % RAIN_TOP_Y_M
    positions[i * 3 + 2] = (i * 87.71) % GROUND_SIZE_M - half
    speeds[i] = 70 + ((i * 31) % 40)
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({
    color: COL.rain,
    size: 2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  const points = new THREE.Points(geom, mat)
  points.frustumCulled = false
  group.add(points)
  const posAttr = geom.getAttribute('position')

  let activeCount = 0
  let opacityTarget = 0
  function setIntensity(frac) {
    activeCount = Math.round(RAIN_COUNT * frac)
    opacityTarget = frac > 0 ? 0.55 : 0
    geom.setDrawRange(0, activeCount)
  }
  function update(_t, dt) {
    mat.opacity = lerp(mat.opacity, opacityTarget, clamp01(dt * 4))
    if (activeCount <= 0 && mat.opacity < 0.02) return
    const arr = posAttr.array
    for (let i = 0; i < activeCount; i++) {
      arr[i * 3 + 1] -= speeds[i] * dt
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] += RAIN_TOP_Y_M
    }
    posAttr.needsUpdate = true
  }
  return { group, update, setIntensity }
}

// ── Risk columns (vertical, slate → clay by risk) ───────────────────
function buildRiskColumns(cells) {
  const group = new THREE.Group()
  group.name = 'riskColumns'
  if (!cells.length) return { group, setIntensity: () => {} }

  const geom = new THREE.BoxGeometry(COLUMN_SIZE_M, 1, COLUMN_SIZE_M)
  geom.translate(0, 0.5, 0) // grow upward from the ground
  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.78, depthWrite: false })
  const mesh = new THREE.InstancedMesh(geom, mat, cells.length)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false

  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  const low = new THREE.Color(COL.columnLow)
  const high = new THREE.Color(COL.columnHigh)

  function setIntensity(frac) {
    for (let i = 0; i < cells.length; i++) {
      const r = clamp01(cells[i].risk)
      // calm: short neutral columns; intensity raises + warms them
      const h = COLUMN_MIN_H + (COLUMN_MAX_H - COLUMN_MIN_H) * r * (0.35 + 0.65 * frac)
      dummy.position.set(cells[i].x, 0, cells[i].z)
      dummy.scale.set(1, h, 1)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      color.copy(low).lerp(high, r)
      // subtle brighten with intensity
      color.multiplyScalar(0.8 + 0.2 * frac)
      mesh.setColorAt(i, color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }
  setIntensity(0)
  group.add(mesh)
  return { group, setIntensity }
}

// ── Complaint clusters (muted surface markers) ──────────────────────
function buildClusters(clusters) {
  const group = new THREE.Group()
  group.name = 'clusters'
  if (!clusters.length) return group
  const geom = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({
    color: 0x8a939c,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.InstancedMesh(geom, mat, clusters.length)
  const dummy = new THREE.Object3D()
  let maxCount = 1
  for (const c of clusters) if (c.count > maxCount) maxCount = c.count
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i]
    const r = 3 + 7 * Math.sqrt(c.count / maxCount)
    dummy.position.set(c.x, 0.3, c.z)
    dummy.scale.set(r, 1, r)
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)
  return group
}

// ── CSO nodes + overflow spill ──────────────────────────────────────
function buildCsos(csos) {
  const group = new THREE.Group()
  group.name = 'csoNodes'
  const overflowGroup = new THREE.Group()
  overflowGroup.name = 'overflowEffects'
  const nodes = []
  if (!csos.length) return { group, overflowGroup, nodes }

  const baseColor = new THREE.Color(COL.cso)

  for (const c of csos) {
    const geom = new THREE.CylinderGeometry(CSO_RADIUS_M, CSO_RADIUS_M, 5, 14)
    const mat = new THREE.MeshBasicMaterial({
      color: baseColor.clone(),
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geom, mat)
    mesh.position.set(c.x, CSO_Y_M, c.z)
    group.add(mesh)

    // overflow spill: small clay particle fountain, hidden until needed
    const SPILL = 24
    const positions = new Float32Array(SPILL * 3)
    const seeds = new Float32Array(SPILL)
    for (let i = 0; i < SPILL; i++) seeds[i] = (i * 0.37) % 1
    const sgeom = new THREE.BufferGeometry()
    sgeom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const smat = new THREE.PointsMaterial({
      color: COL.overflow,
      size: 3.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    const spill = new THREE.Points(sgeom, smat)
    spill.frustumCulled = false
    spill.position.set(c.x, CSO_Y_M, c.z)
    overflowGroup.add(spill)

    nodes.push({
      cso: c,
      mesh,
      mat,
      spill,
      smat,
      sgeom,
      seeds,
      load: 0,
      state: 'normal',
    })
  }
  return { group, overflowGroup, nodes }
}

// ── Floating label for the most-stressed outfall ────────────────────
function makeLabelSprite(title, body) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 192
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  // panel
  ctx.fillStyle = 'rgba(22,26,32,0.86)'
  roundRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 16)
  ctx.fill()
  ctx.strokeStyle = 'rgba(181,102,58,0.85)' // clay accent
  ctx.lineWidth = 3
  roundRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 16)
  ctx.stroke()
  // title
  ctx.fillStyle = COL.label
  ctx.font = '700 30px system-ui, sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(title, 28, 28)
  // body (wrapped)
  ctx.fillStyle = 'rgba(242,239,232,0.82)'
  ctx.font = '400 22px system-ui, sans-serif'
  wrapText(ctx, body, 28, 74, canvas.width - 56, 28)

  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(120, 45, 1) // local meters (root scales by AR_SCALE)
  sprite.visible = false
  return { sprite, tex, mat }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ')
  let line = ''
  let yy = y
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy)
      line = w
      yy += lh
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, yy)
}

// ── Scene assembly ──────────────────────────────────────────────────
export function buildStormScene(arData) {
  const root = new THREE.Group()
  root.name = 'storm-root'
  root.matrixAutoUpdate = true
  root.scale.setScalar(AR_SCALE)

  const ground = buildGround()
  const basins = buildBasins(arData?.basins ?? [])
  const pipes = buildPipes(arData?.pipes ?? [])
  const pipeFlow = buildPipeFlow(arData?.pipes ?? [])
  const rain = buildRain()
  const columns = buildRiskColumns(arData?.cells ?? [])
  const clusters = buildClusters(arData?.clusters ?? [])
  const csos = buildCsos(arData?.csos ?? [])

  root.add(ground)
  root.add(basins.group)
  root.add(pipes)
  root.add(pipeFlow.group)
  root.add(clusters)
  root.add(columns.group)
  root.add(csos.group)
  root.add(csos.overflowGroup)

  // Label anchored above the most-stressed outfall.
  let labelHandle = null
  const stressedNode =
    arData && arData.mostStressed >= 0 ? csos.nodes[arData.mostStressed] : null
  if (stressedNode) {
    labelHandle = makeLabelSprite(
      `High stress · Outfall ${stressedNode.cso.id}`,
      'Near dense 311 complaints + a high infrastructure-risk cell + a connected sewer corridor.',
    )
    labelHandle.sprite.position.set(stressedNode.cso.x, CSO_Y_M + 70, stressedNode.cso.z)
    root.add(labelHandle.sprite)
  }

  const baseColor = new THREE.Color(COL.cso)
  const stressColor = new THREE.Color(COL.csoStress)

  let level = 0
  let frac = 0

  function setStormIntensity(nextLevel) {
    level = nextLevel
    frac = intensityNorm(level)

    // Rain density
    rain.setIntensity(frac)
    // Pipe flow: faster + brighter with intensity (hidden at calm)
    pipeFlow.setSpeed(frac > 0 ? 8 + 26 * frac : 0, frac > 0 ? 0.8 : 0)
    // Risk columns rise / warm
    columns.setIntensity(frac)

    // Basin accumulation targets
    for (const w of basins.waters) {
      const load = computeLoad(
        {
          basin: w.basin.vulnerability,
          infra: w.basin.vulnerability,
          complaint: w.basin.vulnerability,
          risk: w.basin.vulnerability,
        },
        level,
      )
      w.targetOpacity = load <= 0 ? 0 : 0.12 + 0.4 * load
      w.targetY = WATER_BASE_Y_M + 7 * load
    }

    // CSO node stress
    for (const n of csos.nodes) {
      n.load = computeLoad(n.cso.factors, level)
      n.state =
        n.load >= OVERFLOW_THRESHOLD
          ? 'overflow'
          : n.load >= PULSE_THRESHOLD
            ? 'pulsing'
            : 'normal'
    }

    // Label visible once the most-stressed outfall is under stress
    if (labelHandle && stressedNode) {
      labelHandle.sprite.visible = stressedNode.load >= PULSE_THRESHOLD
    }
  }

  const tmpColor = new THREE.Color()

  function update(t, stormLevel) {
    if (typeof stormLevel === 'number' && stormLevel !== level) {
      setStormIntensity(stormLevel)
    }
    // Fixed dt keeps eases stable across frame rates.
    const dt = 1 / 60

    rain.update(t, dt)
    pipeFlow.update(t, dt)

    // basin water ease toward targets
    for (const w of basins.waters) {
      const to = w.targetOpacity ?? 0
      const ty = w.targetY ?? WATER_BASE_Y_M
      w.curOpacity = lerp(w.curOpacity, to, clamp01(dt * 3))
      w.curY = lerp(w.curY, ty, clamp01(dt * 3))
      const shimmer = w.curOpacity > 0.02 ? Math.sin(t * 1.6 + w.basin.id) * 0.4 : 0
      w.mat.opacity = w.curOpacity
      w.mesh.position.y = w.curY + shimmer
    }

    // CSO pulse + overflow spill
    for (const n of csos.nodes) {
      if (n.state === 'normal') {
        n.mat.color.copy(baseColor)
        n.mesh.scale.setScalar(1)
        if (n.smat.opacity > 0.01) n.smat.opacity = lerp(n.smat.opacity, 0, clamp01(dt * 4))
      } else {
        const k = clamp01((n.load - PULSE_THRESHOLD) / (1 - PULSE_THRESHOLD))
        const pulse = 1 + (0.12 + 0.18 * k) * (0.5 + 0.5 * Math.sin(t * 3.2 + n.cso.x))
        n.mesh.scale.set(pulse, 1 + 0.25 * k, pulse)
        tmpColor.copy(baseColor).lerp(stressColor, 0.4 + 0.6 * k)
        n.mat.color.copy(tmpColor)

        if (n.state === 'overflow') {
          n.smat.opacity = lerp(n.smat.opacity, 0.85, clamp01(dt * 4))
          const arr = n.sgeom.getAttribute('position').array
          const N = n.seeds.length
          for (let i = 0; i < N; i++) {
            const ph = (t * 0.9 + n.seeds[i]) % 1
            const ang = n.seeds[i] * Math.PI * 2
            const spread = 6 * ph
            arr[i * 3] = Math.cos(ang) * spread
            arr[i * 3 + 1] = 6 * ph - 3 * ph * ph * 4 // up then arc down
            arr[i * 3 + 2] = Math.sin(ang) * spread
          }
          n.sgeom.getAttribute('position').needsUpdate = true
        } else if (n.smat.opacity > 0.01) {
          n.smat.opacity = lerp(n.smat.opacity, 0, clamp01(dt * 4))
        }
      }
    }

    if (labelHandle && labelHandle.sprite.visible) {
      const bob = Math.sin(t * 1.4) * 2
      labelHandle.sprite.position.y = CSO_Y_M + 70 + bob
    }
  }

  function dispose() {
    root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.()
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.())
        else obj.material.dispose?.()
      }
    })
    labelHandle?.tex?.dispose?.()
  }

  setStormIntensity(0)

  return { root, update, setStormIntensity, dispose }
}
