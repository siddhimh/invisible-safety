// ── Sewershed basins (boundary + fill + rising accumulation) ────────
export function buildBasins(basins) {
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