/**
 * Probability estimation helpers.
 *
 * Provides two utilities:
 *   1. Fermi decomposition — break a complex probability into independent
 *      sub-questions and multiply them together.
 *   2. Overconfidence correction — shrink extreme probabilities toward 0.5
 *      using a calibration shrinkage factor.
 */

/** A single question / probability pair used in Fermi decomposition. */
export interface FermiComponent {
  /** The question being estimated, e.g. "Will management execute the plan?". */
  question: string;
  /** Estimated probability for this component (0–1). */
  probability: number;
}

/** Result from Fermi decomposition. */
export interface FermiResult {
  /** The original components passed in. */
  components: FermiComponent[];
  /** Product of all component probabilities. */
  combinedProbability: number;
  /** Running product snapshot after each component is applied. */
  breakdown: { question: string; running: number }[];
}

/**
 * Decompose a complex probability estimate into independent sub-questions and
 * multiply them together (Fermi approach).
 *
 * @param components - Array of question / probability pairs.  At least one
 *   component is required.  Each probability must be within [0, 1].
 * @returns {@link FermiResult} with the combined probability and a running
 *   breakdown after each component.
 * @throws {Error} If the component array is empty.
 * @throws {Error} If any component probability is outside [0, 1].
 */
export function fermiDecompose(components: FermiComponent[]): FermiResult {
  if (components.length === 0) {
    throw new Error('fermiDecompose: at least one component is required');
  }

  for (const c of components) {
    if (c.probability < 0 || c.probability > 1) {
      throw new Error(
        `fermiDecompose: probability for "${c.question}" must be between 0 and 1 (got ${c.probability})`,
      );
    }
  }

  let running = 1;
  const breakdown: FermiResult['breakdown'] = [];

  for (const c of components) {
    running *= c.probability;
    breakdown.push({ question: c.question, running });
  }

  return {
    components,
    combinedProbability: running,
    breakdown,
  };
}

/**
 * Apply a shrinkage-based overconfidence correction to a probability estimate.
 *
 * Formula: corrected = probability × (1 − shrinkage) + 0.5 × shrinkage
 *
 * This pulls extreme estimates (near 0 or 1) toward the uninformative prior of
 * 0.5, reflecting well-documented human overconfidence in predictions.
 *
 * @param probability - The raw probability estimate (0–1).
 * @param shrinkageFactor - Fraction to shrink toward 0.5 (default 0.3).
 * @returns The calibration-corrected probability.
 * @throws {Error} If probability is outside [0, 1].
 * @throws {Error} If shrinkageFactor is outside [0, 1].
 */
export function correctOverconfidence(probability: number, shrinkageFactor = 0.3): number {
  if (probability < 0 || probability > 1) {
    throw new Error('correctOverconfidence: probability must be between 0 and 1');
  }
  if (shrinkageFactor < 0 || shrinkageFactor > 1) {
    throw new Error('correctOverconfidence: shrinkageFactor must be between 0 and 1');
  }

  return probability * (1 - shrinkageFactor) + 0.5 * shrinkageFactor;
}
