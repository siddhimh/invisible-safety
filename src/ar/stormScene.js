import * as THREE from 'three'
import { AR_RADIUS_M, AR_SCALE } from './projection'
import { computeLoad,  intensityNorm, OVERFLOW_THRESHOLD, PULSE_THRESHOLD} from './stormModel'
import CONFIG from './utils/sceneConfig';
import { lerp, clamp} from './utils/helpers';  
import { buildGroundDisc } from './sceneParts/groundDisc';
import { buildRain } from './sceneParts/rainSystem';
import { buildRiskColumns } from './sceneParts/riskColumns';
import { buildBasins } from './sceneParts/basinsSystem';
import { buildPipes } from './sceneParts/pipeNetwork';
import { buildPipeFlow } from './sceneParts/pipeflowNetwork';
import { buildClusters } from './sceneParts/clusterSystem';
import { buildCsos } from './sceneParts/csosSystem';  


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


export function buildStormScene(arData) {

  const root = new THREE.Group();
  root.name = 'storm-scene';
  const groundDisc = buildGroundDisc();

  root.add(groundDisc.group);

  return {root};
}

// ── Scene assembly ──────────────────────────────────────────────────
// export function buildStormScene(arData) {
//   const root = new THREE.Group()
//   root.name = 'storm-root'
//   root.matrixAutoUpdate = true
//   root.scale.setScalar(AR_SCALE)

//   const groundDisc = buildGroundDisc();
//   // const ground = buildGround()
//   const basins = buildBasins(arData?.basins ?? [])
//   const pipes = buildPipes(arData?.pipes ?? [])
//   const pipeFlow = buildPipeFlow(arData?.pipes ?? [])
//   const rain = buildRain()
//   const columns = buildRiskColumns(arData?.cells ?? [])
//   const clusters = buildClusters(arData?.clusters ?? [])
//   const csos = buildCsos(arData?.csos ?? [])

// root.add(groundDisc.group)
//   // root.add(ground)
//   root.add(basins.group)
//   root.add(pipes)
//   root.add(pipeFlow.group)
//   root.add(clusters)
//   root.add(columns.group)
//   root.add(csos.group)
//   root.add(csos.overflowGroup)

//   // Label anchored above the most-stressed outfall.
//   let labelHandle = null
//   const stressedNode =
//     arData && arData.mostStressed >= 0 ? csos.nodes[arData.mostStressed] : null
//   if (stressedNode) {
//     labelHandle = makeLabelSprite(
//       `High stress · Outfall ${stressedNode.cso.id}`,
//       'Near dense 311 complaints + a high infrastructure-risk cell + a connected sewer corridor.',
//     )
//     labelHandle.sprite.position.set(stressedNode.cso.x, CSO_Y_M + 70, stressedNode.cso.z)
//     root.add(labelHandle.sprite)
//   }

//   const baseColor = new THREE.Color(COL.cso)
//   const stressColor = new THREE.Color(COL.csoStress)

//   let level = 0
//   let frac = 0

//   function setStormIntensity(nextLevel) {
//     level = nextLevel
//     frac = intensityNorm(level)

//     // Rain density
//     rain.setIntensity(frac)
//     // Pipe flow: faster + brighter with intensity (hidden at calm)
//     pipeFlow.setSpeed(frac > 0 ? 8 + 26 * frac : 0, frac > 0 ? 0.8 : 0)
//     // Risk columns rise / warm
//     columns.setIntensity(frac)

//     // Basin accumulation targets
//     for (const w of basins.waters) {
//       const load = computeLoad(
//         {
//           basin: w.basin.vulnerability,
//           infra: w.basin.vulnerability,
//           complaint: w.basin.vulnerability,
//           risk: w.basin.vulnerability,
//         },
//         level,
//       )
//       w.targetOpacity = load <= 0 ? 0 : 0.12 + 0.4 * load
//       w.targetY = WATER_BASE_Y_M + 7 * load
//     }

//     // CSO node stress
//     for (const n of csos.nodes) {
//       n.load = computeLoad(n.cso.factors, level)
//       n.state =
//         n.load >= OVERFLOW_THRESHOLD
//           ? 'overflow'
//           : n.load >= PULSE_THRESHOLD
//             ? 'pulsing'
//             : 'normal'
//     }

//     // Label visible once the most-stressed outfall is under stress
//     if (labelHandle && stressedNode) {
//       labelHandle.sprite.visible = stressedNode.load >= PULSE_THRESHOLD
//     }
//   }

//   const tmpColor = new THREE.Color()

//   function update(t, stormLevel) {
//     if (typeof stormLevel === 'number' && stormLevel !== level) {
//       setStormIntensity(stormLevel)
//     }
//     // Fixed dt keeps eases stable across frame rates.
//     const dt = 1 / 60

//     rain.update(t, dt)
//     pipeFlow.update(t, dt)

//     // basin water ease toward targets
//     for (const w of basins.waters) {
//       const to = w.targetOpacity ?? 0
//       const ty = w.targetY ?? WATER_BASE_Y_M
//       w.curOpacity = lerp(w.curOpacity, to, clamp01(dt * 3))
//       w.curY = lerp(w.curY, ty, clamp01(dt * 3))
//       const shimmer = w.curOpacity > 0.02 ? Math.sin(t * 1.6 + w.basin.id) * 0.4 : 0
//       w.mat.opacity = w.curOpacity
//       w.mesh.position.y = w.curY + shimmer
//     }

//     // CSO pulse + overflow spill
//     for (const n of csos.nodes) {
//       if (n.state === 'normal') {
//         n.mat.color.copy(baseColor)
//         n.mesh.scale.setScalar(1)
//         if (n.smat.opacity > 0.01) n.smat.opacity = lerp(n.smat.opacity, 0, clamp01(dt * 4))
//       } else {
//         const k = clamp01((n.load - PULSE_THRESHOLD) / (1 - PULSE_THRESHOLD))
//         const pulse = 1 + (0.12 + 0.18 * k) * (0.5 + 0.5 * Math.sin(t * 3.2 + n.cso.x))
//         n.mesh.scale.set(pulse, 1 + 0.25 * k, pulse)
//         tmpColor.copy(baseColor).lerp(stressColor, 0.4 + 0.6 * k)
//         n.mat.color.copy(tmpColor)

//         if (n.state === 'overflow') {
//           n.smat.opacity = lerp(n.smat.opacity, 0.85, clamp01(dt * 4))
//           const arr = n.sgeom.getAttribute('position').array
//           const N = n.seeds.length
//           for (let i = 0; i < N; i++) {
//             const ph = (t * 0.9 + n.seeds[i]) % 1
//             const ang = n.seeds[i] * Math.PI * 2
//             const spread = 6 * ph
//             arr[i * 3] = Math.cos(ang) * spread
//             arr[i * 3 + 1] = 6 * ph - 3 * ph * ph * 4 // up then arc down
//             arr[i * 3 + 2] = Math.sin(ang) * spread
//           }
//           n.sgeom.getAttribute('position').needsUpdate = true
//         } else if (n.smat.opacity > 0.01) {
//           n.smat.opacity = lerp(n.smat.opacity, 0, clamp01(dt * 4))
//         }
//       }
//     }

//     if (labelHandle && labelHandle.sprite.visible) {
//       const bob = Math.sin(t * 1.4) * 2
//       labelHandle.sprite.position.y = CSO_Y_M + 70 + bob
//     }
//   }

//   function dispose() {
//     root.traverse((obj) => {
//       if (obj.geometry) obj.geometry.dispose?.()
//       if (obj.material) {
//         if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.())
//         else obj.material.dispose?.()
//       }
//     })
//     labelHandle?.tex?.dispose?.()
//   }

//   setStormIntensity(0)

//   return { root, update, setStormIntensity, dispose }
// }
