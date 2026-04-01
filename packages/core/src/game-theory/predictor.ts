/**
 * Mesquita-style game theory prediction model for stakeholder analysis.
 *
 * Based on the Expected Utility Model (EUM) developed by Bruce Bueno de Mesquita.
 * Each stakeholder has a policy position, how much they care (salience), and how
 * much clout they have (power). The model iterates rounds of pairwise challenges
 * until positions converge to a predicted outcome.
 *
 * Reference: Bueno de Mesquita, B. (2009). "The Predictioneer's Game."
 */

/** A named actor with a policy preference and resources. */
export interface Stakeholder {
  name: string;
  /** Desired policy position on a 0–100 scale. */
  position: number;
  /** How intensely the stakeholder cares about this issue (0–100). */
  salience: number;
  /** Relative political/economic power (0–100). */
  power: number;
}

/** Snapshot of stakeholder positions after one iteration round. */
export interface PredictionRound {
  round: number;
  /** Salience-power weighted median of all stakeholders in this round. */
  weightedMedian: number;
  stakeholderPositions: {
    name: string;
    position: number;
    /** Whether this stakeholder shifted position during this round. */
    moved: boolean;
  }[];
}

/** Full output of the game theory prediction model. */
export interface GameTheoryResult {
  /** Model's final predicted outcome on the 0–100 scale. */
  predictedOutcome: number;
  /** 0–1 convergence confidence: higher when model converges quickly. */
  confidence: number;
  /**
   * Probability of the outcome exceeding the midpoint (50).
   * For binary investment scenarios: probability of the "Yes" side winning.
   */
  probability: number;
  /** Per-round iteration history showing how positions evolved. */
  rounds: PredictionRound[];
  /** Round number at which the model converged (or maxRounds if it did not). */
  convergenceRound: number;
  /** All stakeholders ranked by effective influence (power × salience / 10000). */
  stakeholderInfluence: { name: string; influence: number }[];
}

/**
 * Compute the salience-power weighted median position across all stakeholders.
 * Each stakeholder's weight = salience × power. The median is the position at
 * which cumulative weight first reaches or exceeds half the total weight.
 *
 * @param stakeholders - Array of stakeholders; zero-weight entries are ignored.
 * @returns Weighted median position (0–100), or 50 if total weight is zero.
 */
export function weightedMedian(stakeholders: Stakeholder[]): number {
  const items = stakeholders
    .map(s => ({ position: s.position, weight: s.salience * s.power }))
    .filter(item => item.weight > 0)
    .sort((a, b) => a.position - b.position);

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return 50;

  let cumulative = 0;
  for (const item of items) {
    cumulative += item.weight;
    if (cumulative >= totalWeight / 2) return item.position;
  }
  return items[items.length - 1]?.position ?? 50;
}

/**
 * Calculate the probability that the challenger successfully moves the target.
 *
 * P_ij = Σ(c_k × s_k × |x_j − x_k|) / [Σ(c_k × s_k × |x_i − x_k|) + Σ(c_k × s_k × |x_j − x_k|)]
 *
 * Intuition: each third-party stakeholder k supports whoever is positionally
 * closer to them. The challenger wins if more weighted support sides with it.
 *
 * @param challenger     - The stakeholder initiating the challenge.
 * @param target         - The stakeholder being challenged.
 * @param allStakeholders - All stakeholders including challenger and target.
 * @returns Probability 0–1 that the challenger prevails.
 */
export function probabilityOfSuccess(
  challenger: Stakeholder,
  target: Stakeholder,
  allStakeholders: Stakeholder[],
): number {
  let supportChallenger = 0;
  let supportTarget = 0;

  for (const k of allStakeholders) {
    const weight = k.power * k.salience;
    const distToChallenger = Math.abs(challenger.position - k.position);
    const distToTarget = Math.abs(target.position - k.position);
    // k's support for challenger = how far k is from the target
    supportChallenger += weight * distToTarget;
    // k's support for target = how far k is from the challenger
    supportTarget += weight * distToChallenger;
  }

  const total = supportChallenger + supportTarget;
  return total > 0 ? supportChallenger / total : 0.5;
}

/**
 * Expected utility for stakeholder i of challenging stakeholder j.
 *
 * EU = P(win) × U(win) + (1 − P) × U(lose) − U(status quo)
 *
 * Positive EU means the challenge is worth initiating; the actor will shift
 * toward the target's position proportionally.
 *
 * @param challenger     - The actor considering a challenge.
 * @param target         - The actor being challenged.
 * @param median         - Current weighted median (status quo).
 * @param allStakeholders - Full stakeholder set for probability calculation.
 * @returns Signed expected utility; positive = incentive to challenge.
 */
export function expectedUtilityOfChallenge(
  challenger: Stakeholder,
  target: Stakeholder,
  median: number,
  allStakeholders: Stakeholder[],
): number {
  const p = probabilityOfSuccess(challenger, target, allStakeholders);
  const uWin = challenger.salience * (1 - Math.abs(challenger.position - target.position) / 100);
  const uLose = -challenger.salience * (Math.abs(challenger.position - target.position) / 100);
  const uStatusQuo = challenger.salience * (1 - Math.abs(challenger.position - median) / 100);

  return p * uWin + (1 - p) * uLose - uStatusQuo;
}

/**
 * Run the full Mesquita prediction model.
 *
 * Each round, every stakeholder scans all other stakeholders and takes the
 * challenge with the highest positive expected utility, shifting their position
 * toward that target. Iteration stops when max position change falls below
 * `convergenceThreshold` or `maxRounds` is reached.
 *
 * @param stakeholders         - Initial stakeholder configuration.
 * @param maxRounds            - Hard cap on iteration count (default 20).
 * @param convergenceThreshold - Position-change threshold for stopping (default 0.5).
 * @returns Full prediction result including final outcome and iteration history.
 */
export function predict(
  stakeholders: Stakeholder[],
  maxRounds: number = 20,
  convergenceThreshold: number = 0.5,
): GameTheoryResult {
  if (stakeholders.length === 0) {
    return {
      predictedOutcome: 50,
      confidence: 0,
      probability: 0.5,
      rounds: [],
      convergenceRound: 0,
      stakeholderInfluence: [],
    };
  }

  // Deep clone so the caller's array is not mutated
  let current = stakeholders.map(s => ({ ...s }));
  const rounds: PredictionRound[] = [];
  let converged = false;
  let convergenceRound = maxRounds;

  for (let round = 1; round <= maxRounds; round++) {
    const median = weightedMedian(current);
    const moved = new Set<string>();

    const nextPositions = current.map(actor => {
      let bestShift = 0;
      let shouldMove = false;

      for (const target of current) {
        if (target.name === actor.name) continue;

        const eu = expectedUtilityOfChallenge(actor, target, median, current);
        if (eu > 0) {
          // Move toward target proportional to EU and dampened by 0.3
          const shift = (target.position - actor.position) * 0.3 * (eu / (actor.salience || 1));
          if (Math.abs(shift) > Math.abs(bestShift)) {
            bestShift = shift;
            shouldMove = true;
          }
        }
      }

      if (shouldMove) moved.add(actor.name);
      return {
        ...actor,
        position: Math.max(0, Math.min(100, actor.position + bestShift)),
      };
    });

    rounds.push({
      round,
      weightedMedian: median,
      stakeholderPositions: current.map(s => ({
        name: s.name,
        position: s.position,
        moved: moved.has(s.name),
      })),
    });

    // Convergence check: stop when no stakeholder moves significantly
    const maxChange = Math.max(
      ...current.map((s, i) => Math.abs(s.position - nextPositions[i].position)),
    );

    current = nextPositions;

    if (maxChange < convergenceThreshold) {
      converged = true;
      convergenceRound = round;
      break;
    }
  }

  const finalMedian = weightedMedian(current);

  // Confidence is higher when the model converges and converges quickly
  const confidence = converged ? Math.min(1, 0.6 + (1 - convergenceRound / maxRounds) * 0.4) : 0.4;

  const stakeholderInfluence = current
    .map(s => ({ name: s.name, influence: (s.power * s.salience) / 10000 }))
    .sort((a, b) => b.influence - a.influence);

  return {
    predictedOutcome: finalMedian,
    confidence,
    probability: finalMedian / 100,
    rounds,
    convergenceRound,
    stakeholderInfluence,
  };
}
