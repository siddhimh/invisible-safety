// ── Risk columns (vertical, slate → clay by risk) ───────────────────
export function buildRiskColumns(cells) {
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