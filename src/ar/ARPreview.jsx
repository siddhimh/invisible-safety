import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { buildStormScene } from './stormScene'
import { AR_SCALE } from './projection'
import { useStormARData } from './useStormARData'
import { STORM_LEVELS, MAX_LEVEL } from './stormModel'
import './ARPreview.css'

function makeReticle() {
  const geom = new THREE.RingGeometry(0.07, 0.09, 32).rotateX(-Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xc9cdd3, // off-white / slate, not neon
    transparent: true,
    opacity: 0.9,
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
  const intensityRef = useRef(0)

  const [intensity, setIntensity] = useState(0)
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState(null)

  const arData = useStormARData({
    enabled: open,
    selectedFeature,
    riskGeoJson,
    interceptorFeatures,
    complaints,
    csoFeatures,
  })

  // Apply intensity to the live scene + keep the rAF loop's ref current.
  const applyIntensity = useCallback((next) => {
    const clamped = Math.max(0, Math.min(MAX_LEVEL, next))
    intensityRef.current = clamped
    setIntensity(clamped)
    sceneHandleRef.current?.setStormIntensity(clamped)
    return clamped
  }, [])

  const teardown = useCallback(() => {
    const session = sessionRef.current
    const renderer = rendererRef.current
    const sceneHandle = sceneHandleRef.current

    if (renderer) renderer.setAnimationLoop(null)
    if (session) {
      sessionRef.current = null
      try { session.end() } catch { /* already ended */ }
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
    intensityRef.current = 0
  }, [])

  const startSession = useCallback(async () => {
    if (!canvasRef.current || !overlayRef.current || !arData) return
    if (sessionRef.current) return
    setError(null)
    // Every session starts calm.
    intensityRef.current = 0
    setIntensity(0)

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

      const sceneHandle = buildStormScene(arData)
      sceneHandle.root.visible = false
      sceneHandle.setStormIntensity(intensityRef.current)
      threeScene.add(sceneHandle.root)
      sceneHandleRef.current = sceneHandle

      // ── Hit-test sources (viewer + active controller) ─────────────
      const viewerSpace = await session.requestReferenceSpace('viewer')
      let viewerHitTestSource = null
      try {
        viewerHitTestSource = await session.requestHitTestSource({ space: viewerSpace })
      } catch (err) {
        console.warn('storm AR: viewer hit-test source unavailable', err)
      }
      let controllerHitTestSource = null
      const refreshControllerHitTestSource = async () => {
        try { controllerHitTestSource?.cancel?.() } catch { /* ignore */ }
        controllerHitTestSource = null
        const src = Array.from(session.inputSources ?? []).find(
          (s) => s.targetRayMode === 'tracked-pointer' && s.targetRaySpace,
        )
        if (!src) return
        try {
          controllerHitTestSource = await session.requestHitTestSource({
            space: src.targetRaySpace,
          })
        } catch (err) {
          console.warn('storm AR: controller hit-test source unavailable', err)
        }
      }
      session.addEventListener('inputsourceschange', refreshControllerHitTestSource)
      refreshControllerHitTestSource()

      // ── Trigger (select): place the model, then raise intensity ───
      const onSelect = () => {
        const ret = reticleRef.current
        const sh = sceneHandleRef.current
        if (!sh) return
        if (!placedRef.current) {
          if (!ret || !ret.visible) return
          ret.matrix.decompose(sh.root.position, sh.root.quaternion, sh.root.scale)
          sh.root.scale.setScalar(AR_SCALE)
          sh.root.visible = true
          ret.visible = false
          placedRef.current = true
          setPhase('placed')
          return
        }
        // already placed → cycle storm intensity up (wraps to calm)
        applyIntensity(intensityRef.current >= MAX_LEVEL ? 0 : intensityRef.current + 1)
      }
      session.addEventListener('select', onSelect)

      // ── Grip (squeeze): lower storm intensity ─────────────────────
      const onSqueeze = () => {
        if (!placedRef.current) return
        applyIntensity(intensityRef.current <= 0 ? MAX_LEVEL : intensityRef.current - 1)
      }
      session.addEventListener('squeezestart', onSqueeze)

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

        if (frame && !placedRef.current) {
          const refSpace = renderer.xr.getReferenceSpace()
          let pose = null
          if (controllerHitTestSource && refSpace) {
            const hits = frame.getHitTestResults(controllerHitTestSource)
            if (hits.length > 0) pose = hits[0].getPose(refSpace)
          }
          if (!pose && viewerHitTestSource && refSpace) {
            const hits = frame.getHitTestResults(viewerHitTestSource)
            if (hits.length > 0) pose = hits[0].getPose(refSpace)
          }
          if (pose) {
            ret.visible = true
            ret.matrix.fromArray(pose.transform.matrix)
          } else {
            ret.visible = false
          }
        }

        sh.update(t / 1000, intensityRef.current)
        renderer.render(threeScene, camera)
      })
    } catch (err) {
      console.error('storm AR: failed to start session', err)
      setError(err?.message ?? 'Failed to start AR session')
      teardown()
    }
  }, [arData, applyIntensity, onClose, teardown])

  // Tear the session down whenever the overlay closes.
  useEffect(() => {
    if (!open) teardown()
  }, [open, teardown])
  useEffect(() => () => teardown(), [teardown])

  if (!open) return null
  const supportsAr =
    typeof navigator !== 'undefined' && navigator.xr !== undefined
  const activeLevel = STORM_LEVELS[intensity] ?? STORM_LEVELS[0]

  const anchorProps = selectedFeature?.object?.properties ?? {}
  const anchorStats = selectedFeature?.hotspot ?? null
  const anchorName = [anchorProps.spdes, anchorProps.Waterbody]
    .filter(Boolean)
    .join(' — ')

  const anchorInfo = anchorName ? (
    <>
      <div className="ar-storm-anchor-name">CSO: {anchorName}</div>
      {anchorStats && (
        <div className="ar-storm-anchor-stats">
          Nearby complaints: {anchorStats.complaintsNear.toLocaleString()}
          <span aria-hidden="true"> · </span>
          Peak local risk: {Math.round(anchorStats.riskNear * 100)}%
        </div>
      )}
      {anchorProps.Waterbod_1 && (
        <div className="ar-storm-anchor-receives">
          Receives: {anchorProps.Waterbod_1}
        </div>
      )}
    </>
  ) : null

  return (
    <div className="ar-storm-overlay" ref={overlayRef}>
      <canvas ref={canvasRef} className="ar-storm-canvas" />

      {phase === 'idle' && (
        <div className="ar-storm-splash">
          <div className="ar-storm-card">
            <div className="ar-storm-kicker">AR Storm Event Simulation</div>
            <h2 className="ar-storm-title">Place a conceptual storm-event model</h2>
            <p className="ar-storm-sub">
              Place a conceptual storm-event model of the selected area in your
              space. Increase rainfall intensity to see how runoff, sewer flow,
              and CSO stress relate to nearby surface-risk patterns. This is an
              explanatory simulation, not a hydrological prediction.
            </p>

            {anchorInfo && <div className="ar-storm-anchor">{anchorInfo}</div>}

            <div className="ar-storm-legend">
              <span><i className="sw sw-basin" /> Sewershed basin</span>
              <span><i className="sw sw-pipe" /> Interceptor flow</span>
              <span><i className="sw sw-cso" /> CSO outfall</span>
              <span><i className="sw sw-risk" /> Risk cell</span>
            </div>

            <p className="ar-storm-tip">
              On Meta Quest: <strong>trigger</strong> places the model, then{' '}
              <strong>trigger</strong> raises and <strong>grip</strong> lowers
              storm intensity. <strong>Oculus button</strong> exits. On a phone,
              use the intensity buttons on screen.
            </p>

            <p className="ar-storm-disclaimer">
              Conceptual storm simulation — not a hydrological prediction.
            </p>

            {!supportsAr && (
              <p className="ar-storm-error">WebXR isn&apos;t available in this browser.</p>
            )}
            {error && <p className="ar-storm-error">{error}</p>}

            <div className="ar-storm-actions">
              <button
                type="button"
                className="ar-storm-start"
                onClick={startSession}
                disabled={!supportsAr || !arData}
              >
                Start AR
              </button>
              <button type="button" className="ar-storm-cancel" onClick={onClose}>
                Back to list
              </button>
            </div>
          </div>
        </div>
      )}

      {phase !== 'idle' && (
        <>
          {phase === 'placed' && anchorInfo && (
            <div className="ar-storm-anchor ar-storm-anchor--session">
              {anchorInfo}
            </div>
          )}

          {/* Storm-intensity control. Visible/tappable on phones via
              dom-overlay; on Quest the trigger/grip drive the same state
              (Quest Browser doesn't render dom-overlay). */}
          <div className="ar-storm-intensity" role="group" aria-label="Storm intensity">
            <div className="ar-storm-intensity-head">
              <span className="ar-storm-intensity-label">Storm intensity</span>
              <span className="ar-storm-intensity-value">{activeLevel.label}</span>
            </div>
            <div className="ar-storm-intensity-btns">
              <button
                type="button"
                className="ar-storm-step"
                onClick={() => applyIntensity(intensity - 1)}
                disabled={intensity <= 0}
                aria-label="Lower storm intensity"
              >
                –
              </button>
              <div className="ar-storm-pips">
                {STORM_LEVELS.map((lvl) => (
                  <button
                    key={lvl.level}
                    type="button"
                    className={
                      'ar-storm-pip' +
                      (intensity >= lvl.level ? ' is-filled' : '') +
                      (lvl.level === MAX_LEVEL ? ' is-overflow' : '')
                    }
                    onClick={() => applyIntensity(lvl.level)}
                    aria-label={lvl.label}
                    title={lvl.label}
                  />
                ))}
              </div>
              <button
                type="button"
                className="ar-storm-step"
                onClick={() => applyIntensity(intensity + 1)}
                disabled={intensity >= MAX_LEVEL}
                aria-label="Raise storm intensity"
              >
                +
              </button>
            </div>
            <div className="ar-storm-mini-disclaimer">
              Conceptual simulation — not a hydrological prediction.
            </div>
          </div>

          <button
            type="button"
            className="ar-storm-exit"
            onClick={() => sessionRef.current?.end()}
          >
            Exit AR
          </button>

          {phase === 'searching' && (
            <div className="ar-storm-hint" aria-live="polite">
              Point at a flat surface, then tap / pull the trigger to place the model
            </div>
          )}
        </>
      )}
    </div>
  )
}
