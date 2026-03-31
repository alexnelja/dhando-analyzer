/**
 * Kelly rebalancing signal generator.
 *
 * Compares each position's current portfolio weight against its Kelly-optimal
 * weight and generates a structured rebalancing signal with an urgency tier.
 *
 * Urgency tiers (based on absolute drift):
 *   - high:   |drift| > 0.10 (10 percentage points)
 *   - medium: |drift| > 0.05 (5 percentage points, default threshold)
 *   - low:    |drift| <= threshold (within tolerance)
 *
 * All logic is pure — no side effects, no I/O.
 */

/** A rebalancing signal for a single position. */
export interface RebalanceSignal {
  /** Unique identifier for the investment. */
  investmentId: string;
  /** Human-readable name for display in messages. */
  name: string;
  /** Recommended action: trim the position, add to it, or do nothing. */
  action: 'trim' | 'add' | 'none';
  /** Current portfolio weight (0–1). */
  currentWeight: number;
  /** Kelly-optimal target weight (0–1). */
  optimalWeight: number;
  /**
   * Signed drift: currentWeight − kellyOptimal.
   * Positive = overweight; negative = underweight.
   */
  drift: number;
  /** Urgency level based on the magnitude of drift. */
  urgency: 'low' | 'medium' | 'high';
  /** Human-readable rebalancing instruction. */
  message: string;
}

/** Input for a single position to be evaluated. */
export interface RebalanceInput {
  /** Unique identifier for the investment. */
  investmentId: string;
  /** Human-readable investment name. */
  name: string;
  /** Current portfolio weight (0–1). */
  currentWeight: number;
  /** Half-Kelly optimal weight (0–1). */
  kellyOptimal: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_DRIFT_THRESHOLD = 0.05;
const HIGH_URGENCY_THRESHOLD = 0.10;

function formatPp(fraction: number): string {
  return `${(Math.abs(fraction) * 100).toFixed(1)}pp`;
}

function buildSignal(
  input: RebalanceInput,
  threshold: number,
): RebalanceSignal {
  const { investmentId, name, currentWeight, kellyOptimal } = input;
  const drift = currentWeight - kellyOptimal;
  const absDrift = Math.abs(drift);

  if (absDrift < threshold) {
    return {
      investmentId,
      name,
      action: 'none',
      currentWeight,
      optimalWeight: kellyOptimal,
      drift,
      urgency: 'low',
      message: `${name} within tolerance`,
    };
  }

  const overweight = drift > 0;
  const action: 'trim' | 'add' = overweight ? 'trim' : 'add';
  const urgency: 'medium' | 'high' = absDrift > HIGH_URGENCY_THRESHOLD ? 'high' : 'medium';

  const message = overweight
    ? `Trim ${name} by ${formatPp(drift)} (overweight)`
    : `Add to ${name} by ${formatPp(drift)} (underweight)`;

  return {
    investmentId,
    name,
    action,
    currentWeight,
    optimalWeight: kellyOptimal,
    drift,
    urgency,
    message,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate rebalancing signals for a set of portfolio positions.
 *
 * @param positions - Array of positions with current and optimal weights.
 * @param driftThreshold - Minimum absolute drift to trigger a signal (default 0.05).
 * @returns Array of rebalancing signals, one per position, in input order.
 */
export function generateRebalanceSignals(
  positions: RebalanceInput[],
  driftThreshold: number = DEFAULT_DRIFT_THRESHOLD,
): RebalanceSignal[] {
  return positions.map((p) => buildSignal(p, driftThreshold));
}
