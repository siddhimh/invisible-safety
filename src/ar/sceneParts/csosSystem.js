// ── CSO nodes + overflow spill ──────────────────────────────────────
export function buildCsos(csos) {
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