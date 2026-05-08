import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { buildARScene } from '../ar/scene'
import { AR_SCALE } from '../ar/projection'
import { useARData } from '../ar/useARData'
import './ARPreview.css'

const AR_MODES = [
  { id: 'urban-risk',     label: 'Urban Risk' },
  { id: 'pipe-proximity', label: 'Pipe Proximity' },
  { id: 'surface-risk',   label: 'Surface Risk' },
  { id: 'infrastructure', label: 'Infrastructure' },
]
function makeReticle() {
  const geom = new THREE.RingGeometry(0.07, 0.09, 32).rotateX(-Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.matrixAutoUpdate = false
  mesh.visible = false
  return mesh
}

export function ARPreview({
  open,
  onClose,
  selectedFeature,
  riskGeoJson,
  surfaceHotspots,
  interceptorFeatures,
  complaints,
  csoFeatures,
}) {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const sessionRef = useRef(null)
  const rendererRef = useRef(null)
  const sceneHandleRef = useRef(null)
  const reticleRef = useRef(null)
  const placedRef = useRef(false)

  const [mode, setMode] = useState('urban-risk')
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState(null)

  const arData = useARData({
    selectedFeature,
    riskGeoJson,
    surfaceHotspots,
    interceptorFeatures,
    complaints,
    csoFeatures,
  })

  useEffect(() => {
    sceneHandleRef.current?.setMode(mode)
  }, [mode, phase])

  const teardown = useCallback(() => {
    const session = sessionRef.current
    const renderer = rendererRef.current
    const sceneHandle = sceneHandleRef.current

    if (renderer) {
      renderer.setAnimationLoop(null)
    }
    if (session) {
      sessionRef.current = null
      try { session.end() } catch { /* already ended or ending */ }
    }
    if (sceneHandle) {
      sceneHandle.dispose()
      sceneHandleRef.current = null
    }
    if (renderer) {
      renderer.dispose()
      rendererRef.current = null
    }
    reticleRef.current = null
    placedRef.current = false
  }, [])

  const startSession = useCallback(async () => {
    if (!canvasRef.current || !overlayRef.current || !arData) return
    if (sessionRef.current) return // already running
    setError(null)

    try {
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['local-floor', 'dom-overlay'],
        domOverlay: { root: overlayRef.current },
      })
      sessionRef.current = session

      const renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current,
        alpha: true,
        antialias: true,
      })
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.setSize(window.innerWidth, window.innerHeight, false)
      renderer.xr.enabled = true
      try {
        renderer.xr.setReferenceSpaceType('local-floor')
      } catch {
        renderer.xr.setReferenceSpaceType('local')
      }
      await renderer.xr.setSession(session)
      rendererRef.current = renderer

      const threeScene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera()

      const reticle = makeReticle()
      threeScene.add(reticle)
      reticleRef.current = reticle

      const sceneHandle = buildARScene(arData)
      sceneHandle.root.visible = false
      sceneHandle.setMode(mode)
      threeScene.add(sceneHandle.root)
      sceneHandleRef.current = sceneHandle

      const viewerSpace = await session.requestReferenceSpace('viewer')
      let hitTestSource = null
      try {
        hitTestSource = await session.requestHitTestSource({ space: viewerSpace })
      } catch (err) {
        console.warn('AR Preview: hit-test source unavailable', err)
      }

      const onSelect = () => {
        const ret = reticleRef.current
        const sh = sceneHandleRef.current
        if (!ret || !sh || !ret.visible) return
        ret.matrix.decompose(sh.root.position, sh.root.quaternion, sh.root.scale)
        sh.root.scale.setScalar(AR_SCALE)
        sh.root.visible = true
        placedRef.current = true
        setPhase('placed')
      }
      session.addEventListener('select', onSelect)

      session.addEventListener('end', () => {
        teardown()
        setPhase('idle')
        onClose?.()
      })

      setPhase('searching')

      renderer.setAnimationLoop((t, frame) => {
        const ret = reticleRef.current
        const sh = sceneHandleRef.current
        if (!ret || !sh) return

        if (frame && hitTestSource && !placedRef.current) {
          const refSpace = renderer.xr.getReferenceSpace()
          const hits = frame.getHitTestResults(hitTestSource)
          if (hits.length > 0 && refSpace) {
            const pose = hits[0].getPose(refSpace)
            if (pose) {
              ret.visible = true
              ret.matrix.fromArray(pose.transform.matrix)
            }
          } else {
            ret.visible = false
          }
        }

        sh.update(t / 1000)
        renderer.render(threeScene, camera)
      })
    } catch (err) {
      console.error('AR Preview: failed to start session', err)
      setError(err?.message ?? 'Failed to start AR session')
      teardown()
    }
  }, [arData])

  useEffect(() => {
    if (!open) teardown()
  }, [open, teardown])
  useEffect(() => () => teardown(), [teardown])

  if (!open) return null
  const supportsAr =
    typeof navigator !== 'undefined' && navigator.xr !== undefined

  return (
    <div className="ar-preview-overlay" ref={overlayRef}>
      <canvas ref={canvasRef} className="ar-preview-canvas" />

      {phase === 'idle' && (
        <div className="ar-preview-splash">
          <div className="ar-preview-splash-card">
            <h2 className="ar-preview-title">AR Preview</h2>
            <p className="ar-preview-sub">
              {selectedFeature
                ? 'Place a small spatial model of the selected area on a real surface, then walk around it.'
                : 'Pick a feature on the map first, then come back here to preview it in AR.'}
            </p>
            {!supportsAr && (
              <p className="ar-preview-error">
                WebXR isn&apos;t available in this browser.
              </p>
            )}
            {error && <p className="ar-preview-error">{error}</p>}
            <div className="ar-preview-splash-actions">
              <button
                type="button"
                className="ar-preview-start"
                onClick={startSession}
                disabled={!supportsAr || !arData}
              >
                Start AR
              </button>
              <button
                type="button"
                className="ar-preview-cancel"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {phase !== 'idle' && (
        <>
          <div className="ar-preview-modes" role="radiogroup" aria-label="AR mode">
            {AR_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                className={
                  'ar-preview-mode-btn' +
                  (mode === m.id ? ' is-active' : '')
                }
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="ar-preview-exit"
            onClick={() => sessionRef.current?.end()}
          >
            Exit AR
          </button>

          {phase === 'searching' && (
            <div className="ar-preview-hint" aria-live="polite">
              Point your camera at a flat surface, then tap to place
            </div>
          )}
        </>
      )}
    </div>
  )
}

