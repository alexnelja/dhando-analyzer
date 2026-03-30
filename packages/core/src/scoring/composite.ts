/**
 * Composite quantitative score normalizer.
 *
 * Combines Altman Z-Score, Piotroski F-Score, and Beneish M-Score into a
 * single 0–100 composite score. Each raw score is first mapped to [0, 100]
 * using a linear clamp, then blended with fixed weights:
 *
 *   composite = 0.35 * Z_norm + 0.35 * F_norm + 0.30 * M_norm
 *
 * Weight rationale (spec A.1):
 * - Z and F are complementary health signals (solvency + operational
 *   strength): 0.35 each.
 * - M is a fraud veto signal — different in kind but equally critical: 0.30.
 */

/**
 * Normalize the Altman Z-Score to [0, 100].
 *
 * Clamp range: [-5, 10]. Values below -5 map to 0; above 10 map to 100.
 * Higher Z (healthier) produces a higher normalized score.
 *
 * @param z - Raw Altman Z-Score.
 * @returns Normalized score in [0, 100].
 */
export function normalizeAltmanZ(z: number): number {
  const MIN = -5;
  const MAX = 10;
  const clamped = Math.max(MIN, Math.min(MAX, z));
  return ((clamped - MIN) / (MAX - MIN)) * 100;
}

/**
 * Normalize the Piotroski F-Score to [0, 100].
 *
 * Natural range [0, 9]. Clamps to that range then scales linearly.
 *
 * @param f - Raw Piotroski F-Score (integer 0–9).
 * @returns Normalized score in [0, 100].
 */
export function normalizePiotroskiF(f: number): number {
  return (Math.max(0, Math.min(9, f)) / 9) * 100;
}

/**
 * Normalize the Beneish M-Score to [0, 100].
 *
 * Clamp range: [-3, 2]. M is an inverse signal — lower (more negative) means
 * the company is less likely to be manipulating earnings, so we invert:
 * M = -3 → 100, M = 2 → 0.
 *
 * @param m - Raw Beneish M-Score.
 * @returns Normalized score in [0, 100] where 100 = clean.
 */
export function normalizeBeneishM(m: number): number {
  const MIN = -3;
  const MAX = 2;
  const clamped = Math.max(MIN, Math.min(MAX, m));
  // Invert: a lower M (cleaner company) maps to a higher normalized score.
  return ((MAX - clamped) / (MAX - MIN)) * 100;
}

/**
 * Calculate the composite quantitative score (0–100) from raw Z, F, M values.
 *
 * Each raw score is normalized to [0, 100] before weighting.
 *
 * Formula: `composite = 0.35 * Z_norm + 0.35 * F_norm + 0.30 * M_norm`
 *
 * @param scores - Object containing raw `z` (Altman), `f` (Piotroski 0-9),
 *                 and `m` (Beneish — more negative is better).
 * @returns Composite score in [0, 100].
 */
export function calculateCompositeScore(scores: { z: number; f: number; m: number }): number {
  const zNorm = normalizeAltmanZ(scores.z);
  const fNorm = normalizePiotroskiF(scores.f);
  const mNorm = normalizeBeneishM(scores.m);
  return 0.35 * zNorm + 0.35 * fNorm + 0.30 * mNorm;
}
