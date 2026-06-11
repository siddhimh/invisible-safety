// Conceptual storm-load model for the AR storm-event simulation.
//
// This is intentionally NOT a hydrological model. It is an explanatory
// scoring scheme: each CSO outfall / sewershed carries four intensity-
// independent "vulnerability" factors (all pre-normalized to 0..1 in
// useStormARData), and a single storm-intensity dial (0..3) scales them
// into a conceptual load. Thresholds on that load drive the visual
// stress states (pulsing → overflow).

export const STORM_LEVELS = [
  { level: 0, label: 'Calm', short: 'Calm' },
  { level: 1, label: 'Light rain', short: 'Light' },
  { level: 2, label: 'Heavy rain', short: 'Heavy' },
  { level: 3, label: 'Overflow stress', short: 'Overflow' },
]

export const MAX_LEVEL = 3

// Conceptual thresholds on normalized load.
export const PULSE_THRESHOLD = 0.7
export const OVERFLOW_THRESHOLD = 0.9

// Relative weight each factor contributes to a node's standing
// vulnerability. Kept gentle so no single factor dominates.
const FACTOR_WEIGHTS = {
  basin: 0.3, // how much runoff its drainage basin concentrates
  infra: 0.25, // proximity / connectedness to the trunk-line corridor
  complaint: 0.25, // nearby 311 complaint density (surface vulnerability)
  risk: 0.2, // local urban-risk-cell value
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

// Intensity-independent vulnerability of a node from its four factors.
export function vulnerabilityOf(factors) {
  if (!factors) return 0
  const v =
    FACTOR_WEIGHTS.basin * (factors.basin ?? 0) +
    FACTOR_WEIGHTS.infra * (factors.infra ?? 0) +
    FACTOR_WEIGHTS.complaint * (factors.complaint ?? 0) +
    FACTOR_WEIGHTS.risk * (factors.risk ?? 0)
  return clamp01(v)
}

export function intensityNorm(level) {
  return clamp01(level / MAX_LEVEL)
}

// conceptualLoad ≈ stormIntensity · vulnerability, shaped so that:
//   • level 0 (calm)   → load 0 everywhere (system at rest)
//   • level 2 (heavy)  → the most vulnerable nodes cross the pulse line
//   • level 3 (overflow stress) → the most vulnerable nodes overflow
export function computeLoad(factors, level) {
  const norm = intensityNorm(level)
  if (norm <= 0) return 0
  const vuln = vulnerabilityOf(factors)
  // Floor of 0.35 so even low-vulnerability nodes visibly respond,
  // ceiling reached only by the most vulnerable node at full intensity.
  const load = Math.pow(norm, 0.85) * (0.35 + 0.65 * vuln)
  return clamp01(load)
}

export function stressState(load) {
  if (load >= OVERFLOW_THRESHOLD) return 'overflow'
  if (load >= PULSE_THRESHOLD) return 'pulsing'
  return 'normal'
}
