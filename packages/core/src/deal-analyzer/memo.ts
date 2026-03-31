/**
 * Investment Memo Generator — deterministic, template-driven output.
 *
 * Produces a structured investment memo from quantitative and qualitative
 * inputs.  All text is generated from data — no AI prose.
 */

/** The fully structured investment memo. */
export interface InvestmentMemo {
  /** Max 5 sentences summarising the investment case. */
  thesis: string;
  /** Moat type and durability assessment. */
  moatAnalysis: string;
  /** Top 3–5 automatically detected risks. */
  keyRisks: string[];
  /** Intrinsic value vs current price narrative. */
  valuation: string;
  /** Conditions under which the position should be exited. */
  exitCriteria: string[];
}

/** Input data used to generate the memo. */
export interface MemoInput {
  /** Company or investment name. */
  name: string;
  /** Exchange ticker, or null for private investments. */
  ticker: string | null;
  /** Sector classification, or null if unknown. */
  sector: string | null;
  /** DCF intrinsic value per share (or aggregate). */
  intrinsicValue: number;
  /** Current market price per share (or aggregate). */
  currentPrice: number;
  /**
   * Margin of safety as a percentage (e.g. 35 means 35 %).
   * Derived from (intrinsicValue − currentPrice) / intrinsicValue × 100.
   */
  marginOfSafety: number;
  /** Moat score 1–5 (1 = no moat, 5 = wide moat). */
  moatScore: number;
  /** Management quality score 1–5. */
  managementScore: number;
  /** Composite rules-engine score 0–100. */
  compositeScore: number;
  /** Altman Z-Score zone classification. */
  altmanZZone: 'safe' | 'grey' | 'distress';
  /** True when Beneish M-Score flags likely earnings manipulation. */
  beneishManipulator: boolean;
  /** Probability-weighted expected value across scenarios. */
  expectedValue: number;
  /** Recommended Kelly position size as a fraction (0–1). */
  kellyPosition: number;
  /** Scenario summary used for the memo. */
  scenarios: { case: string; targetPrice: number; probabilityWeight: number }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a 1–5 moat score to a human-readable label and durability narrative.
 */
function moatLabel(score: number): { label: string; description: string } {
  if (score <= 1) {
    return {
      label: 'No moat',
      description:
        'The business has no identifiable competitive advantage. Earnings power is highly vulnerable to competition and pricing pressure.',
    };
  }
  if (score === 2) {
    return {
      label: 'Weak moat',
      description:
        'Minor cost advantages or switching costs exist but are unlikely to persist beyond 3–5 years without reinvestment.',
    };
  }
  if (score === 3) {
    return {
      label: 'Narrow moat',
      description:
        'A defensible competitive position exists — perhaps brand, cost advantage, or moderate switching costs — but is not dominant in the industry.',
    };
  }
  if (score === 4) {
    return {
      label: 'Solid moat',
      description:
        'Strong barriers to competition through network effects, significant switching costs, or durable cost advantages. Expected to hold for 10+ years.',
    };
  }
  return {
    label: 'Wide moat',
    description:
      'Exceptional and durable competitive advantages — likely structural (regulatory, network, or proprietary asset) — capable of sustaining excess returns for 20+ years.',
  };
}

/**
 * Format a number as a percentage string rounded to one decimal place.
 */
function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

/**
 * Format a monetary value with up to two decimal places.
 */
function money(n: number): string {
  return n.toFixed(2);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic investment memo from quantitative inputs.
 *
 * All fields are populated via template strings — the output is fully
 * reproducible from the same input.
 *
 * @param input - Quantitative and qualitative data for the investment.
 * @returns A structured {@link InvestmentMemo}.
 */
export function generateMemo(input: MemoInput): InvestmentMemo {
  const {
    name,
    ticker,
    intrinsicValue,
    currentPrice,
    marginOfSafety,
    moatScore,
    managementScore,
    compositeScore,
    altmanZZone,
    beneishManipulator,
    expectedValue,
    kellyPosition,
    scenarios,
  } = input;

  const displayName = ticker ? `${name} (${ticker})` : name;
  const kellyPct = pct(kellyPosition * 100);
  const zoneLabel =
    altmanZZone === 'safe' ? 'Safe zone' : altmanZZone === 'grey' ? 'Grey zone' : 'Distress zone';

  // ── Thesis ─────────────────────────────────────────────────────────────────
  const thesis = [
    `${displayName} trades at ${pct(marginOfSafety)} below intrinsic value of ${money(intrinsicValue)}.`,
    `Composite score ${compositeScore.toFixed(0)}/100 across all rules-engine criteria.`,
    `${zoneLabel} on Altman Z-Score — financial distress risk is ${altmanZZone === 'distress' ? 'elevated' : altmanZZone === 'grey' ? 'moderate' : 'low'}.`,
    `Probability-weighted expected value across scenarios is ${money(expectedValue)}.`,
    `Kelly criterion recommends a ${kellyPct} position size.`,
  ].join(' ');

  // ── Moat analysis ──────────────────────────────────────────────────────────
  const { label, description } = moatLabel(moatScore);
  const moatAnalysis = `Moat rating: ${label} (${moatScore}/5). ${description}`;

  // ── Key risks ──────────────────────────────────────────────────────────────
  const keyRisks: string[] = [];

  if (beneishManipulator) {
    keyRisks.push('Beneish M-Score flags potential earnings manipulation — financial statements require independent scrutiny.');
  }
  if (altmanZZone === 'distress') {
    keyRisks.push('Altman Z-Score in distress zone — elevated probability of financial distress or bankruptcy.');
  } else if (altmanZZone === 'grey') {
    keyRisks.push('Altman Z-Score in grey zone — financial health is uncertain and warrants monitoring.');
  }
  if (managementScore <= 2) {
    keyRisks.push(`Low management score (${managementScore}/5) — capital allocation quality and integrity are concerns.`);
  }
  if (moatScore <= 2) {
    keyRisks.push(`Weak or absent moat (${moatScore}/5) — competitive position may erode faster than projected.`);
  }
  if (compositeScore < 40) {
    keyRisks.push(`Low composite score (${compositeScore.toFixed(0)}/100) — investment fails multiple qualitative or quantitative criteria.`);
  }

  // Always include a valuation model risk
  keyRisks.push('DCF intrinsic value is sensitive to terminal growth rate and discount rate assumptions; small changes materially affect the margin of safety.');

  // Cap at 5 risks
  const cappedRisks = keyRisks.slice(0, 5);

  // ── Valuation ──────────────────────────────────────────────────────────────
  const scenarioSummary = scenarios
    .map((s) => `${s.case}: ${money(s.targetPrice)} (${pct(s.probabilityWeight * 100)})`)
    .join(', ');

  const valuation = [
    `Intrinsic value: ${money(intrinsicValue)}.`,
    `Current price: ${money(currentPrice)}.`,
    `Margin of safety: ${pct(marginOfSafety)}.`,
    `Expected value across scenarios [${scenarioSummary}]: ${money(expectedValue)}.`,
  ].join(' ');

  // ── Exit criteria ──────────────────────────────────────────────────────────
  const exitCriteria: string[] = [
    'Price exceeds intrinsic value (margin of safety falls to 0%).',
    'Margin of safety falls below 10% — insufficient buffer for model error.',
    'Composite score drops below 40 — investment no longer meets minimum quality threshold.',
    'Beneish M-Score crosses into manipulator territory — financial integrity is compromised.',
    'Altman Z-Score enters distress zone — probability of financial failure increases materially.',
    'Original investment thesis is invalidated by a fundamental change in business model or competitive position.',
  ];

  return {
    thesis,
    moatAnalysis,
    keyRisks: cappedRisks,
    valuation,
    exitCriteria,
  };
}
