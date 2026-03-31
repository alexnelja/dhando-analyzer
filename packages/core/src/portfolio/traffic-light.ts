/**
 * Traffic-light dashboard scorer.
 *
 * Evaluates a held position across 8 independent factors and produces a
 * per-factor green / amber / red status. The overall result is the worst
 * status across all factors (any red → red, else any amber → amber,
 * else green).
 *
 * All logic is pure — no side effects, no I/O.
 */

/** Possible traffic-light status values, ordered worst → best. */
export type TrafficLight = 'green' | 'amber' | 'red';

/** Result for a single traffic-light factor. */
export interface TrafficLightFactor {
  /** Human-readable factor name. */
  name: string;
  /** Computed status for this factor. */
  status: TrafficLight;
  /** The raw numeric value that was evaluated. */
  value: number;
  /** Threshold description for each status tier. */
  threshold: {
    green: string;
    amber: string;
    red: string;
  };
}

/** Full traffic-light result: per-factor breakdown plus an overall verdict. */
export interface TrafficLightResult {
  /** One entry per evaluated factor. */
  factors: TrafficLightFactor[];
  /** Worst status across all factors. */
  overall: TrafficLight;
}

/** All inputs required to score the 8-factor traffic light. */
export interface TrafficLightInput {
  /** Margin of safety as a fraction, e.g. 0.30 = 30%. */
  marginOfSafety: number;
  /** Economic moat score on a 1–5 scale. */
  moatScore: number;
  /** Management quality score on a 1–5 scale. */
  managementScore: number;
  /** Altman Z-Score (raw). */
  altmanZScore: number;
  /** Piotroski F-Score (0–9). */
  piotroskiFScore: number;
  /** Beneish M-Score (raw, more negative = less likely to manipulate). */
  beneishMScore: number;
  /** Absolute Kelly drift (|currentWeight − kellyOptimal|). */
  kellyDriftAbsolute: number;
  /** Sentiment score in the range −1 to 1. */
  sentimentScore: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Determine the worst status from an array of statuses. */
function worstOf(statuses: TrafficLight[]): TrafficLight {
  if (statuses.includes('red')) return 'red';
  if (statuses.includes('amber')) return 'amber';
  return 'green';
}

/** Build a factor result from a precomputed status. */
function factor(
  name: string,
  status: TrafficLight,
  value: number,
  threshold: TrafficLightFactor['threshold'],
): TrafficLightFactor {
  return { name, status, value, threshold };
}

// ---------------------------------------------------------------------------
// Individual factor scorers
// ---------------------------------------------------------------------------

function scoreMarginOfSafety(mos: number): TrafficLightFactor {
  const status: TrafficLight = mos > 0.2 ? 'green' : mos >= 0.1 ? 'amber' : 'red';
  return factor('Margin of Safety', status, mos, {
    green: '> 20%',
    amber: '10%–20%',
    red: '< 10%',
  });
}

function scoreMoat(moat: number): TrafficLightFactor {
  const status: TrafficLight = moat >= 4 ? 'green' : moat >= 3 ? 'amber' : 'red';
  return factor('Moat', status, moat, {
    green: '>= 4',
    amber: '3',
    red: '<= 2',
  });
}

function scoreManagement(mgmt: number): TrafficLightFactor {
  const status: TrafficLight = mgmt >= 4 ? 'green' : mgmt >= 3 ? 'amber' : 'red';
  return factor('Management', status, mgmt, {
    green: '>= 4',
    amber: '3',
    red: '<= 2',
  });
}

function scoreAltmanZ(z: number): TrafficLightFactor {
  const status: TrafficLight = z > 2.99 ? 'green' : z >= 1.81 ? 'amber' : 'red';
  return factor('Altman Z-Score', status, z, {
    green: '> 2.99',
    amber: '1.81–2.99',
    red: '< 1.81',
  });
}

function scorePiotroski(f: number): TrafficLightFactor {
  const status: TrafficLight = f >= 7 ? 'green' : f >= 5 ? 'amber' : 'red';
  return factor('Piotroski F-Score', status, f, {
    green: '>= 7',
    amber: '5–6',
    red: '<= 4',
  });
}

function scoreBeneish(m: number): TrafficLightFactor {
  // More negative = safer; threshold at -2.22 (manipulator boundary)
  const status: TrafficLight = m < -2.22 ? 'green' : m <= -1.78 ? 'amber' : 'red';
  return factor('Beneish M-Score', status, m, {
    green: '< -2.22',
    amber: '-2.22 to -1.78',
    red: '> -1.78',
  });
}

function scoreKellyDrift(drift: number): TrafficLightFactor {
  const status: TrafficLight = drift < 0.03 ? 'green' : drift <= 0.08 ? 'amber' : 'red';
  return factor('Kelly Drift', status, drift, {
    green: '< 3pp',
    amber: '3pp–8pp',
    red: '> 8pp',
  });
}

function scoreSentiment(sentiment: number): TrafficLightFactor {
  const status: TrafficLight =
    sentiment > 0.2 ? 'green' : sentiment >= -0.2 ? 'amber' : 'red';
  return factor('Sentiment', status, sentiment, {
    green: '> 0.2',
    amber: '-0.2 to 0.2',
    red: '< -0.2',
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score a position across 8 Dhandho-aligned factors.
 *
 * @param input - All factor values for the position being evaluated.
 * @returns Per-factor traffic-light results and an overall verdict.
 */
export function scoreTrafficLight(input: TrafficLightInput): TrafficLightResult {
  const factors: TrafficLightFactor[] = [
    scoreMarginOfSafety(input.marginOfSafety),
    scoreMoat(input.moatScore),
    scoreManagement(input.managementScore),
    scoreAltmanZ(input.altmanZScore),
    scorePiotroski(input.piotroskiFScore),
    scoreBeneish(input.beneishMScore),
    scoreKellyDrift(input.kellyDriftAbsolute),
    scoreSentiment(input.sentimentScore),
  ];

  const overall = worstOf(factors.map((f) => f.status));

  return { factors, overall };
}
