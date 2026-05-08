import * as THREE from 'three'
import { AR_RADIUS_M, AR_SCALE } from './projection'

const RISK_COLOR_STOPS = [
  { t: 0.0,  rgb: [255, 255, 204] }, // pale yellow
  { t: 0.25, rgb: [254, 217, 118] }, // light yellow
  { t: 0.5,  rgb: [254, 178,  76] }, // orange
  { t: 0.75, rgb: [253, 141,  60] }, // deep orange
  { t: 1.0,  rgb: [189,   0,  38] }, // dark red
]

function riskColor(target, t) {
  const tt = t < 0 ? 0 : t > 1 ? 1 : t
  for (let i = 1; i < RISK_COLOR_STOPS.length; i++) {
    const b = RISK_COLOR_STOPS[i]
    if (tt <= b.t) {
      const a = RISK_COLOR_STOPS[i - 1]
      const f = (tt - a.t) / (b.t - a.t)
      target.setRGB(
        (a.rgb[0] + (b.rgb[0] - a.rgb[0]) * f) / 255,
        (a.rgb[1] + (b.rgb[1] - a.rgb[1]) * f) / 255,
        (a.rgb[2] + (b.rgb[2] - a.rgb[2]) * f) / 255,
      )
      return target
    }
  }
  const last = RISK_COLOR_STOPS[RISK_COLOR_STOPS.length - 1].rgb
  target.setRGB(last[0] / 255, last[1] / 255, last[2] / 255)
  return target
}
const INCIDENT_COLORS = {
  Sewer:              [0.94, 0.27, 0.27],
  'Water System':     [0.23, 0.51, 0.96],
  'Street Condition': [0.96, 0.62, 0.04],
}
const INCIDENT_COLOR_DEFAULT = [0.85, 0.85, 0.85]
const GROUND_SIZE_M = AR_RADIUS_M * 2.4
const CELL_SIZE_M = 35           // a touch smaller than the 0.75 km grid pitch (so cells don't overlap visually)
const CELL_HEIGHT_M = 1
const PIPE_Y_M = -1
const INCIDENT_Y_M = 4
const INCIDENT_RADIUS_M = 1.8
const CSO_Y_M = 1.5
const CSO_RADIUS_M = 3
const HOTSPOT_Y_M = 0.2
const HOTSPOT_RADIUS_M = 14

const MODE_GROUPS = {
  'urban-risk':     ['ground', 'cells'],
  'pipe-proximity': ['ground', 'pipes', 'particles'],
  'surface-risk':   ['ground', 'incidents', 'hotspots'],
  'infrastructure': ['ground', 'pipes', 'csos'],
}
const ALL_GROUPS = ['ground', 'cells', 'pipes', 'particles', 'incidents', 'csos', 'hotspots']

function buildGround() {
  const group = new THREE.Group()
  group.name = 'ground'

  const planeGeom = new THREE.PlaneGeometry(GROUND_SIZE_M, GROUND_SIZE_M)
  const planeMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const plane = new THREE.Mesh(planeGeom, planeMat)
  plane.rotation.x = -Math.PI / 2
  group.add(plane)
  const grid = new THREE.GridHelper(GROUND_SIZE_M, 24, 0xffffff, 0xffffff)
  grid.material.transparent = true
  grid.material.opacity = 0.18
  grid.material.depthWrite = false
  group.add(grid)

  return group
}

function buildCells(cells) {
  const group = new THREE.Group()
  group.name = 'cells'
  if (!cells.length) return { group, update: () => {} }

  const geom = new THREE.BoxGeometry(CELL_SIZE_M, CELL_HEIGHT_M, CELL_SIZE_M)
  geom.translate(0, CELL_HEIGHT_M / 2, 0)
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
  })

  const mesh = new THREE.InstancedMesh(geom, mat, cells.length)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false

  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  const pulseIndices = []
  const baseScaleY = new Float32Array(cells.length)

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    const heightScale = 0.4 + 5.6 * Math.max(0, Math.min(1, c.risk))
    baseScaleY[i] = heightScale
    dummy.position.set(c.x, 0, c.z)
    dummy.scale.set(1, heightScale, 1)
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)

    riskColor(color, c.risk)
    const alpha = 0.24 + 0.76 * Math.max(0, Math.min(1, c.risk))
    color.multiplyScalar(alpha)
    mesh.setColorAt(i, color)

    if (c.risk >= 0.7) pulseIndices.push(i)
  }
  mesh.instanceColor.needsUpdate = true
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)

  function update(t) {
    if (!pulseIndices.length) return
    for (let k = 0; k < pulseIndices.length; k++) {
      const i = pulseIndices[k]
      const phase = t * 2.4 + i * 0.7
      const pulse = 1 + 0.35 * Math.sin(phase)
      dummy.position.set(cells[i].x, 0, cells[i].z)
      dummy.scale.set(1, baseScaleY[i] * pulse, 1)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  return { group, update }
}
function buildPipes(pipes) {
  const group = new THREE.Group()
  group.name = 'pipes'
  if (!pipes.length) return group

  const mat = new THREE.LineBasicMaterial({
    color: 0x22d3ee, // matches infrastructure cyan in interceptors.js
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  })

  for (const p of pipes) {
    const flat = p.flat // Float32Array of [x0,z0,x1,z1,...]
    const positions = new Float32Array((flat.length / 2) * 3)
    for (let i = 0; i < flat.length / 2; i++) {
      positions[i * 3] = flat[i * 2]
      positions[i * 3 + 1] = PIPE_Y_M
      positions[i * 3 + 2] = flat[i * 2 + 1]
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const line = new THREE.Line(geom, mat)
    group.add(line)
  }

  return group
}
function buildParticles(pipes) {
  const group = new THREE.Group()
  group.name = 'particles'
  if (!pipes.length) return { group, update: () => {} }

  const PARTICLES_PER_PIPE = 12
  const arcTables = pipes.map((p) => {
    const flat = p.flat
    const n = flat.length / 2
    const cum = new Float32Array(n)
    cum[0] = 0
    for (let i = 1; i < n; i++) {
      const dx = flat[i * 2] - flat[(i - 1) * 2]
      const dz = flat[i * 2 + 1] - flat[(i - 1) * 2 + 1]
      cum[i] = cum[i - 1] + Math.sqrt(dx * dx + dz * dz)
    }
    return { flat, cum, length: cum[n - 1] || 1 }
  })

  const total = pipes.length * PARTICLES_PER_PIPE
  const positions = new Float32Array(total * 3)
  const offsets = new Float32Array(total)
  const pipeIdx = new Uint16Array(total)

  for (let p = 0; p < pipes.length; p++) {
    for (let k = 0; k < PARTICLES_PER_PIPE; k++) {
      const i = p * PARTICLES_PER_PIPE + k
      offsets[i] = k / PARTICLES_PER_PIPE
      pipeIdx[i] = p
    }
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const mat = new THREE.PointsMaterial({
    color: 0x67e8f9, // brighter cyan than the pipe lines so the flow pops
    size: 4,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  const points = new THREE.Points(geom, mat)
  points.frustumCulled = false
  group.add(points)
  const FLOW_SPEED_M_S = 12
  const posAttr = geom.getAttribute('position')

  function update(t) {
    const arr = posAttr.array
    for (let i = 0; i < total; i++) {
      const tab = arcTables[pipeIdx[i]]
      const phase = (offsets[i] + (t * FLOW_SPEED_M_S) / tab.length) % 1
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
      arr[i * 3]     = x0 + (x1 - x0) * f
      arr[i * 3 + 1] = PIPE_Y_M + 0.05 // sit a hair above the pipe line
      arr[i * 3 + 2] = z0 + (z1 - z0) * f
    }
    posAttr.needsUpdate = true
  }

  return { group, update }
}

function buildIncidents(incidents) {
  const group = new THREE.Group()
  group.name = 'incidents'
  if (!incidents.length) return { group, update: () => {} }

  const geom = new THREE.SphereGeometry(INCIDENT_RADIUS_M, 10, 8)
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  })
  const mesh = new THREE.InstancedMesh(geom, mat, incidents.length)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.frustumCulled = false

  const color = new THREE.Color()
  const dummy = new THREE.Object3D()
  const phaseOffsets = new Float32Array(incidents.length)
  for (let i = 0; i < incidents.length; i++) {
    const c = incidents[i]
    const rgb = INCIDENT_COLORS[c.type] ?? INCIDENT_COLOR_DEFAULT
    color.setRGB(rgb[0], rgb[1], rgb[2])
    mesh.setColorAt(i, color)
    phaseOffsets[i] = (i * 0.317) % (Math.PI * 2)
    dummy.position.set(c.x, INCIDENT_Y_M, c.z)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }
  mesh.instanceColor.needsUpdate = true
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)

  function update(t) {
    for (let i = 0; i < incidents.length; i++) {
      const phase = t * 1.6 + phaseOffsets[i]
      const y = INCIDENT_Y_M + Math.sin(phase) * 1.0
      dummy.position.set(incidents[i].x, y, incidents[i].z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  return { group, update }
}
function buildCsos(csos) {
  const group = new THREE.Group()
  group.name = 'csos'
  if (!csos.length) return group

  const geom = new THREE.CylinderGeometry(CSO_RADIUS_M, CSO_RADIUS_M, 6, 12)
  const mat = new THREE.MeshBasicMaterial({
    color: 0x2dd4bf, // matches the infrastructure-mode CSO swatch in App.jsx
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  })

  for (const c of csos) {
    const m = new THREE.Mesh(geom, mat)
    m.position.set(c.x, CSO_Y_M, c.z)
    group.add(m)
  }

  return group
}

function buildHotspotRings(hotspots) {
  const group = new THREE.Group()
  group.name = 'hotspots'
  if (!hotspots.length) return { group, update: () => {} }
  const items = []
  for (const h of hotspots) {
    const radius = HOTSPOT_RADIUS_M * (0.6 + 0.6 * h.intensity)
    const ringGeom = new THREE.RingGeometry(
      radius - 1.2,
      radius,
      48,
    )
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const ring = new THREE.Mesh(ringGeom, ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(h.x, HOTSPOT_Y_M, h.z)
    group.add(ring)
    items.push({ ring, radius, intensity: h.intensity })
  }

  function update(t) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const phase = t * 2.0 + i * 0.5
      const s = 1 + 0.15 * Math.sin(phase)
      it.ring.scale.set(s, 1, s)
      it.ring.material.opacity = 0.5 + 0.4 * (1 - (s - 0.85) / 0.3)
    }
  }

  return { group, update }
}

export function buildARScene(arData) {
  const root = new THREE.Group()
  root.name = 'ar-root'
  root.matrixAutoUpdate = true
  root.scale.setScalar(AR_SCALE)

  const groundG = buildGround()
  const cellsHandle = buildCells(arData?.cells ?? [])
  const pipesG = buildPipes(arData?.pipes ?? [])
  const particlesHandle = buildParticles(arData?.pipes ?? [])
  const incidentsHandle = buildIncidents(arData?.incidents ?? [])
  const csosG = buildCsos(arData?.csos ?? [])
  const hotspotsHandle = buildHotspotRings(arData?.hotspots ?? [])

  const groups = {
    ground: groundG,
    cells: cellsHandle.group,
    pipes: pipesG,
    particles: particlesHandle.group,
    incidents: incidentsHandle.group,
    csos: csosG,
    hotspots: hotspotsHandle.group,
  }
  for (const g of Object.values(groups)) root.add(g)

  function update(t) {
    cellsHandle.update(t)
    particlesHandle.update(t)
    incidentsHandle.update(t)
    hotspotsHandle.update(t)
  }

  function setMode(modeId) {
    const visibleSet = new Set(MODE_GROUPS[modeId] ?? MODE_GROUPS['urban-risk'])
    for (const name of ALL_GROUPS) {
      if (groups[name]) groups[name].visible = visibleSet.has(name)
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
  }
  setMode('urban-risk')

  return { root, update, setMode, dispose }
}
