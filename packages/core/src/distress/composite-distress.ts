/**
 * Composite Distress Score calculator.
 *
 * Produces a 0–100 score where higher values indicate more severe financial
 * distress. Six factors are normalised to 0–100 individually and combined
 * with the following weights:
 *
 *   - Altman Z-Score contribution    30%
 *   - Piotroski F-Score trend        20%
 *   - Beneish M-Score                15%
 *   - FCF deterioration              15%
 *   - Leverage (debt/EBITDA)         10%
 *   - Working capital squeeze        10%
 *
 * Each component is normalised so that 100 = maximum distress and 0 = no
 * distress, then the weighted average is taken.
 */

/**
 * Inputs required to calculate the composite distress score.
 */
export interface CompositeDistressInput {
  /**
   * Raw Altman Z-Score. Z < 1.81 (distress zone), 1.81–2.99 (grey zone),
   * Z > 2.99 (safe zone).
   */
  altmanZ: number;
  /**
   * Piotroski F-Score for the current period (0–9).
   * Higher F-Score = better financial health.
   */
  piotroskiFCurrent: number;
  /**
   * Piotroski F-Score for the prior period (0–9).
   * Used to detect deterioration vs improvement trends.
   */
  piotroskiFPrior: number;
  /**
   * Beneish M-Score. M > -1.78 flags likely earnings manipulation.
   * Typical manipulator range is around -1.0 to 0. Non-manipulator is around -2.5.
   */
  beneishM: number;
  /**
   * Free cash flow for the current period (any consistent currency unit).
   * Negative values indicate cash burn.
   */
  fcfCurrent: number;
  /**
   * Free cash flow for the prior period.
   * FCF declining from prior = cash deterioration signal.
   */
  fcfPrior: number;
  /**
   * Debt / EBITDA ratio. Ratios above 5x indicate highly leveraged positions.
   * Use 0 for net-cash companies; use Infinity / very large numbers for
   * companies with negative EBITDA (clamped internally).
   */
  debtToEbitda: number;
  /**
   * Working capital for the current period (current assets − current liabilities).
   * Negative working capital = potential liquidity squeeze.
   */
  workingCapitalCurrent: number;
  /**
   * Working capital for the prior period.
   * Declining working capital signals liquidity deterioration.
   */
  workingCapitalPrior: number;
}

/** Per-component 0–100 distress scores and the final weighted composite. */
export interface CompositeDistressResult {
  /**
   * Composite distress score, 0–100.
   * 0 = no distress; 100 = maximum financial distress.
   */
  score: number;
  /**
   * Individual component scores (0–100 each, higher = more distressed).
   * Keys: altmanZ, piotroskiTrend, beneishM, fcfDeterioration, leverage, workingCapital.
   */
  components: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Internal normalisation helpers
// ---------------------------------------------------------------------------

/**
 * Clamp a value to the range [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Normalise the Altman Z-Score to a 0–100 distress contribution.
 *
 * Mapping rationale:
 * - Z >= 5  → 0   (very safe, no distress contribution)
 * - Z == 2.99 → ~30 (boundary of grey zone)
 * - Z == 1.81 → ~60 (boundary of distress zone)
 * - Z <= 0   → 100 (extreme distress)
 *
 * Linear interpolation across two segments:
 *   [5, 1.81] → [0, 75]  and  [1.81, 0] → [75, 100]
 */
function normaliseAltmanZ(z: number): number {
  if (z >= 5) return 0;
  if (z >= 1.81) {
    // Safe-to-distress-boundary: z from 5 to 1.81 maps to 0–75
    return ((5 - z) / (5 - 1.81)) * 75;
  }
  // Deep distress: z from 1.81 to 0 maps to 75–100
  return 75 + ((1.81 - z) / 1.81) * 25;
}

/**
 * Normalise the Piotroski F-Score trend to a 0–100 distress contribution.
 *
 * Compares current vs prior F-Score. An improving trend reduces distress;
 * a deteriorating trend adds to it.
 *
 * Delta range: −9 (large deterioration) to +9 (large improvement).
 * -9 → 100 (worst), +9 → 0 (best).
 */
function normalisePiotroskiTrend(current: number, prior: number): number {
  const delta = current - prior; // positive = improving
  // Remap [-9, +9] → [100, 0]
  return clamp(((9 - delta) / 18) * 100, 0, 100);
}

/**
 * Normalise the Beneish M-Score to a 0–100 distress contribution.
 *
 * Manipulation threshold is -1.78. Typical clean companies score around -2.5.
 * We map the range [-4, 0] linearly: -4 → 0, 0 → 100.
 * Values above 0 are clamped to 100; values below -4 are clamped to 0.
 */
function normaliseBeneishM(m: number): number {
  const MIN_M = -4;
  const MAX_M = 0;
  return clamp(((m - MIN_M) / (MAX_M - MIN_M)) * 100, 0, 100);
}

/**
 * Normalise FCF deterioration to a 0–100 distress contribution.
 *
 * Cases:
 * - Both positive, current > prior  → 0 (improving)
 * - Both positive, current < prior  → 25–50 (mild concern)
 * - Current negative, prior positive → 75 (cash burn started)
 * - Both negative, current worse    → 100 (deepening burn)
 * - Both negative, current better   → 50 (still burning but improving)
 */
function normaliseFcfDeterioration(current: number, prior: number): number {
  if (current >= 0 && prior >= 0) {
    if (current >= prior) return 0;
    // Positive but declining: proportional to the decline
    const decline = (prior - current) / Math.max(Math.abs(prior), 1);
    return clamp(decline * 50, 0, 50);
  }
  if (current < 0 && prior >= 0) {
    return 75;
  }
  if (current < 0 && prior < 0) {
    // Both negative — is it getting worse?
    return current <= prior ? 100 : 50;
  }
  // current >= 0 && prior < 0 — turned positive (improving from burn)
  return 10;
}

/**
 * Normalise debt/EBITDA leverage ratio to a 0–100 distress contribution.
 *
 * Mapping:
 * - 0x  → 0 (net cash / no leverage)
 * - 2x  → 20
 * - 4x  → 60
 * - 5x+ → 100 (dangerously leveraged)
 * Linear interpolation, clamped at ends.
 */
function normaliseLeverage(debtToEbitda: number): number {
  if (!isFinite(debtToEbitda) || debtToEbitda < 0) return 100; // Negative EBITDA = maximum concern
  return clamp((debtToEbitda / 5) * 100, 0, 100);
}

/**
 * Normalise working capital squeeze to a 0–100 distress contribution.
 *
 * Working capital is already context-free (any scale), so we measure the
 * direction and magnitude of change relative to the prior period.
 *
 * - WC positive and rising   → 0
 * - WC positive but falling  → proportional concern (0–50)
 * - WC negative and falling  → 75–100
 * - WC negative but rising   → 40 (improving from stressed position)
 */
function normaliseWorkingCapital(current: number, prior: number): number {
  if (current >= 0 && prior >= 0) {
    if (current >= prior) return 0;
    const decline = (prior - current) / Math.max(Math.abs(prior), 1);
    return clamp(decline * 50, 0, 50);
  }
  if (current < 0 && prior >= 0) {
    return 75;
  }
  if (current < 0 && prior < 0) {
    return current <= prior ? 100 : 40;
  }
  // Turned positive from negative — improving
  return 15;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate the composite distress score for an investment.
 *
 * Each of the six components is normalised to 0–100 independently, then
 * combined using a fixed weight vector. The final score is rounded to two
 * decimal places.
 *
 * @param input - All financial inputs required for distress scoring.
 * @returns Composite score (0–100) and per-component breakdown.
 */
export function calculateCompositeDistress(input: CompositeDistressInput): CompositeDistressResult {
  const {
    altmanZ,
    piotroskiFCurrent,
    piotroskiFPrior,
    beneishM,
    fcfCurrent,
    fcfPrior,
    debtToEbitda,
    workingCapitalCurrent,
    workingCapitalPrior,
  } = input;

  const components: Record<string, number> = {
    altmanZ: normaliseAltmanZ(altmanZ),
    piotroskiTrend: normalisePiotroskiTrend(piotroskiFCurrent, piotroskiFPrior),
    beneishM: normaliseBeneishM(beneishM),
    fcfDeterioration: normaliseFcfDeterioration(fcfCurrent, fcfPrior),
    leverage: normaliseLeverage(debtToEbitda),
    workingCapital: normaliseWorkingCapital(workingCapitalCurrent, workingCapitalPrior),
  };

  const weights: Record<string, number> = {
    altmanZ: 0.30,
    piotroskiTrend: 0.20,
    beneishM: 0.15,
    fcfDeterioration: 0.15,
    leverage: 0.10,
    workingCapital: 0.10,
  };

  // Clamp each component to [0, 100] before applying weights.
  const clampedComponents: Record<string, number> = {};
  for (const [key, value] of Object.entries(components)) {
    clampedComponents[key] = clamp(value, 0, 100);
  }

  const score = Object.keys(clampedComponents).reduce((sum, key) => {
    return sum + clampedComponents[key] * weights[key];
  }, 0);

  return {
    score: Math.round(clamp(score, 0, 100) * 100) / 100,
    components: clampedComponents,
  };
}
