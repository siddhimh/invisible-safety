// ── Rain (density via draw-range + opacity) ─────────────────────────
export function buildRain() {
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