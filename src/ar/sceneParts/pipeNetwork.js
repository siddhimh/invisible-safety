// ── Pipes (static trunk lines) ──────────────────────────────────────
export function buildPipes(pipes) {
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