/**
 * Pre-Mortem Framework — Pabrai's 5 failure categories.
 *
 * Imagines the investment has failed, then catalogs the most plausible causes
 * across five structural failure modes.  Includes an overconfidence-corrected
 * win probability derived from the calibration helper in probability.ts.
 *
 * Reference: Pabrai, "The Dhandho Investor," Ch. 9 (checklist & pre-mortem).
 */

import { correctOverconfidence } from './probability.js';

/** Risk severity level for a single pre-mortem category. */
export type RiskLevel = 'low' | 'medium' | 'high';

/** A single pre-mortem failure category with supporting evidence. */
export interface PreMortemCategory {
  /** One of Pabrai's five failure categories. */
  category: string;
  /** The key question framing this failure mode. */
  question: string;
  /** Automatically assigned risk level based on input data. */
  riskLevel: RiskLevel;
  /** Data-derived evidence sentence explaining the assignment. */
  evidence: string;
}

/** Aggregated pre-mortem result. */
export interface PreMortemResult {
  /** Evaluated risk for each of the five failure categories. */
  categories: PreMortemCategory[];
  /** The highest risk level across all categories. */
  overallRiskLevel: RiskLevel;
  /**
   * Win probability after applying a 0.3 shrinkage overconfidence correction.
   * Pulls extreme estimates toward 0.5.
   */
  adjustedWinProbability: number;
}

/** Input data required to run the pre-mortem. */
export interface PreMortemInput {
  /** Raw win probability estimate, 0–1. */
  winProbability: number;
  /** Altman Z-Score zone classification. */
  altmanZZone: 'safe' | 'grey' | 'distress';
  /** True when Beneish M-Score flags potential earnings manipulation. */
  beneishManipulator: boolean;
  /**
   * Debt / EBITDA ratio.  Null when EBITDA is unavailable or negative.
   */
  debtToEbitda: number | null;
  /** Management quality score 1–5. */
  managementScore: number;
  /** Moat durability score 1–5. */
  moatScore: number;
  /** Rules-engine composite score 0–100. */
  compositeScore: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Order risk levels for comparison: low < medium < high.
 */
const RISK_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

/**
 * Return the highest risk level from an array of levels.
 */
function maxRisk(levels: RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>(
    (best, current) => (RISK_ORDER[current] > RISK_ORDER[best] ? current : best),
    'low',
  );
}

// ---------------------------------------------------------------------------
// Five category evaluators
// ---------------------------------------------------------------------------

/**
 * Category 1: Valuation errors.
 *
 * High if compositeScore < 40 or beneishManipulator is true.
 * The composite score being low signals the investment failed multiple
 * quantitative filters.  A Beneish flag means reported financials used to
 * derive intrinsic value may be unreliable.
 */
function evaluateValuationErrors(input: PreMortemInput): PreMortemCategory {
  const isHigh = input.compositeScore < 40 || input.beneishManipulator;

  let riskLevel: RiskLevel;
  let evidence: string;

  if (input.beneishManipulator && input.compositeScore < 40) {
    riskLevel = 'high';
    evidence = `Beneish M-Score flags potential earnings manipulation AND composite score is ${input.compositeScore.toFixed(0)}/100 — intrinsic value estimate is unreliable.`;
  } else if (input.beneishManipulator) {
    riskLevel = 'high';
    evidence = `Beneish M-Score flags potential earnings manipulation — the financials underlying the valuation may be distorted.`;
  } else if (input.compositeScore < 40) {
    riskLevel = 'high';
    evidence = `Composite score ${input.compositeScore.toFixed(0)}/100 is below the minimum threshold (40) — the investment fails multiple screening criteria, increasing the probability of a valuation error.`;
  } else {
    riskLevel = isHigh ? 'high' : 'low';
    evidence = `Composite score ${input.compositeScore.toFixed(0)}/100 is acceptable and no manipulation flag detected — valuation error risk is low.`;
  }

  return {
    category: 'Valuation errors',
    question: 'Could our intrinsic value estimate be materially wrong due to data quality, model assumptions, or earnings manipulation?',
    riskLevel,
    evidence,
  };
}

/**
 * Category 2: Leverage risks.
 *
 * High if debtToEbitda > 4 or altmanZZone === 'distress'.
 */
function evaluateLeverageRisk(input: PreMortemInput): PreMortemCategory {
  const highDebt = input.debtToEbitda !== null && input.debtToEbitda > 4;
  const inDistress = input.altmanZZone === 'distress';

  let riskLevel: RiskLevel;
  let evidence: string;

  if (highDebt && inDistress) {
    riskLevel = 'high';
    evidence = `Debt/EBITDA of ${input.debtToEbitda!.toFixed(1)}× exceeds the 4× danger threshold AND Altman Z is in the distress zone — leverage is an existential risk.`;
  } else if (inDistress) {
    riskLevel = 'high';
    evidence = `Altman Z-Score is in the distress zone — elevated probability of financial distress even if leverage data is unavailable.`;
  } else if (highDebt) {
    riskLevel = 'high';
    evidence = `Debt/EBITDA of ${input.debtToEbitda!.toFixed(1)}× exceeds the 4× threshold — the business is highly leveraged and vulnerable to earnings deterioration or rate increases.`;
  } else if (input.altmanZZone === 'grey') {
    riskLevel = 'medium';
    evidence = `Altman Z-Score is in the grey zone — financial health is uncertain and should be monitored closely.`;
  } else if (input.debtToEbitda !== null && input.debtToEbitda > 2) {
    riskLevel = 'medium';
    evidence = `Debt/EBITDA of ${input.debtToEbitda.toFixed(1)}× is elevated but below the critical 4× threshold.`;
  } else {
    riskLevel = 'low';
    const debtDetail =
      input.debtToEbitda !== null
        ? `Debt/EBITDA of ${input.debtToEbitda.toFixed(1)}× is acceptable.`
        : 'Debt/EBITDA data is unavailable — assume no significant leverage unless confirmed.';
    evidence = `Altman Z-Score is in the safe zone. ${debtDetail}`;
  }

  return {
    category: 'Leverage risks',
    question: 'Could excessive debt, rising interest rates, or a liquidity crunch force distressed asset sales or bankruptcy?',
    riskLevel,
    evidence,
  };
}

/**
 * Category 3: Management / ownership.
 *
 * High if managementScore <= 2.
 */
function evaluateManagementRisk(input: PreMortemInput): PreMortemCategory {
  let riskLevel: RiskLevel;
  let evidence: string;

  if (input.managementScore <= 2) {
    riskLevel = 'high';
    evidence = `Management score ${input.managementScore}/5 — capital allocation quality, integrity, or track record is a serious concern.`;
  } else if (input.managementScore === 3) {
    riskLevel = 'medium';
    evidence = `Management score ${input.managementScore}/5 — adequate but not exceptional; owner-operator alignment is not confirmed.`;
  } else {
    riskLevel = 'low';
    evidence = `Management score ${input.managementScore}/5 — strong capital allocation track record and aligned incentives reduce agency risk.`;
  }

  return {
    category: 'Management / ownership',
    question: 'Could poor capital allocation, misaligned incentives, or management fraud destroy value?',
    riskLevel,
    evidence,
  };
}

/**
 * Category 4: Moat deterioration.
 *
 * High if moatScore <= 2.
 */
function evaluateMoatDeterioration(input: PreMortemInput): PreMortemCategory {
  let riskLevel: RiskLevel;
  let evidence: string;

  if (input.moatScore <= 2) {
    riskLevel = 'high';
    evidence = `Moat score ${input.moatScore}/5 — competitive advantages are weak or absent, making the projected earnings power fragile.`;
  } else if (input.moatScore === 3) {
    riskLevel = 'medium';
    evidence = `Moat score ${input.moatScore}/5 — a narrow moat exists but may not withstand aggressive competition over the investment horizon.`;
  } else {
    riskLevel = 'low';
    evidence = `Moat score ${input.moatScore}/5 — durable competitive advantages should protect earnings power over the projection period.`;
  }

  return {
    category: 'Moat deterioration',
    question: 'Could competition, technology disruption, or regulatory change erode the competitive moat faster than projected?',
    riskLevel,
    evidence,
  };
}

/**
 * Category 5: Personal biases.
 *
 * Always medium — human biases (narrative fallacy, anchoring, overconfidence)
 * are present by default and cannot be auto-detected from quantitative data.
 */
function evaluatePersonalBiases(): PreMortemCategory {
  return {
    category: 'Personal biases',
    question: 'Are we anchoring on an initial price target, falling for a compelling narrative, or overweighting recent information?',
    riskLevel: 'medium',
    evidence: 'Personal biases (anchoring, narrative fallacy, overconfidence) are inherent in any human investment decision and cannot be quantitatively detected — always assume medium risk.',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the pre-mortem framework against investment data.
 *
 * Evaluates each of Pabrai's five failure categories, determines the overall
 * risk level, and applies a 0.3 shrinkage overconfidence correction to the
 * supplied win probability.
 *
 * @param input - Quantitative and qualitative investment data.
 * @returns {@link PreMortemResult} with per-category risk, overall risk, and
 *   adjusted win probability.
 */
export function runPreMortem(input: PreMortemInput): PreMortemResult {
  const categories: PreMortemCategory[] = [
    evaluateValuationErrors(input),
    evaluateLeverageRisk(input),
    evaluateManagementRisk(input),
    evaluateMoatDeterioration(input),
    evaluatePersonalBiases(),
  ];

  const overallRiskLevel = maxRisk(categories.map((c) => c.riskLevel));

  const adjustedWinProbability = correctOverconfidence(input.winProbability, 0.3);

  return { categories, overallRiskLevel, adjustedWinProbability };
}
