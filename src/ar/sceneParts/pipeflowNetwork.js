// ── Pipe flow particles (speed scales with intensity) ───────────────
export function buildPipeFlow(pipes) {
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