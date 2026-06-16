
// ── Complaint clusters (muted surface markers) ──────────────────────
export function buildClusters(clusters) {
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