/**
 * Deal Analyzer Pipeline — orchestrates all analysis layers into a single
 * `DealAnalysis` result.
 *
 * Steps:
 *   1. Run scenario model → probability-weighted expected value.
 *   2. Calculate DCF → intrinsic value and margin of safety.
 *   3. Run pre-mortem → overconfidence-adjusted win probability.
 *   4. Calculate Kelly position sizing (using adjusted probability).
 *   5. Generate investment memo.
 *   6. Optionally run rules engine; if blocked, force kellyPosition = 0.
 *   7. Optionally persist scenarios, journal entry, and decision snapshot.
 *   8. Return DealAnalysis.
 */

import { modelScenarios, type ScenarioInput } from './scenarios.js';
import { calculateKelly } from './kelly.js';
import { calculateDcf, type DcfInput } from './dcf.js';
import { generateMemo } from './memo.js';
import { runPreMortem, type PreMortemInput, type PreMortemResult } from './premortem.js';
import { saveScenarios, deleteScenarios } from './scenario-store.js';
import { createJournalEntry } from './journal-store.js';
import { runEngine } from '../rules-engine/engine.js';
import { captureDecisionSnapshot } from '../rules-engine/snapshots.js';
import type { InvestmentMemo } from './memo.js';
import type { ScenarioModelResult } from './scenarios.js';
import type { DcfResult } from './dcf.js';
import type { KellyResult } from './kelly.js';
import type { EngineResult } from '../rules-engine/engine.js';
import type { Rule } from '../models/rule.js';
import type { DatabaseConnection } from '../data/db.js';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Full set of inputs consumed by the deal analyzer pipeline. */
export interface DealAnalyzerInput {
  /** ID of an existing investment row in the database. */
  investmentId: string;
  /** Display name. */
  name: string;
  /** Exchange ticker (null for private investments). */
  ticker: string | null;
  /** Sector classification (null if unknown). */
  sector: string | null;
  /** Current market price per share (or aggregate). */
  currentPrice: number;
  /** Market capitalisation. */
  marketCap: number;
  /** Diluted shares outstanding. */
  sharesOutstanding: number;
  /** Pre-computed screener scores for the investment. */
  screenerResult: {
    altmanZ: { score: number; zone: 'safe' | 'grey' | 'distress' };
    piotroskiF: { score: number };
    beneishM: { score: number; likelyManipulator: boolean };
    compositeScore: number;
    valuation: {
      evEbitda: number | null;
      pe: number | null;
      pb: number | null;
      fcfYield: number | null;
      ownerEarnings: number;
    };
  };
  /** Moat score 1–5 (qualitative assessment). */
  moatScore: number;
  /** Management quality score 1–5 (qualitative assessment). */
  managementScore: number;
  /** Bear / base / bull scenario definitions. */
  scenarioInputs: ScenarioInput[];
  /** Current-year (year-0) revenue used in scenario projections. */
  baseRevenue: number;
  /** Projection horizon in years (used for both scenarios and DCF). */
  projectionYears: number;
  /** DCF inputs for intrinsic value calculation. */
  dcfInput: DcfInput;
  /**
   * Raw analyst/analyst-adjusted win probability (0–1).
   * Will be corrected for overconfidence inside the pipeline.
   */
  winProbability: number;
  /**
   * Age of the underlying financial data in hours.
   * Used to apply a staleness penalty to the Kelly half-Kelly recommendation.
   */
  dataStalenessHours?: number;
  /**
   * Debt/EBITDA ratio for leverage risk assessment.
   * Pass null when EBITDA is unavailable.
   */
  debtToEbitda?: number | null;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/** Complete output of the deal analyzer pipeline. */
export interface DealAnalysis {
  /** Investment identifier matching the input. */
  investmentId: string;
  /** Aggregated scenario model output. */
  scenarioModel: ScenarioModelResult;
  /** DCF valuation result. */
  dcf: DcfResult;
  /** Kelly position sizing result (using adjusted win probability). */
  kelly: KellyResult;
  /**
   * Recommended Kelly position as a fraction (0–1).
   * Set to 0 when blocked by a hard-gate rule.
   */
  kellyPosition: number;
  /** Probability-weighted expected value from the scenario model. */
  expectedValue: number;
  /** DCF intrinsic value. */
  intrinsicValue: number;
  /** Margin of safety as a fraction (may be negative if price > IV). */
  marginOfSafety: number;
  /** Structured investment memo. */
  memo: InvestmentMemo;
  /** Pre-mortem risk assessment. */
  preMortem: PreMortemResult;
  /**
   * Rules engine result.
   * Null when no rules were supplied.
   */
  rulesEngineResult: EngineResult | null;
  /**
   * True when a hard-gate rule blocked this investment.
   * When true, kellyPosition is forced to 0.
   */
  blocked: boolean;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full deal analyzer pipeline.
 *
 * All computation is deterministic given the same input.  The optional `db`
 * parameter enables persistence of scenarios, a journal entry, and a decision
 * snapshot.  The optional `rules` parameter enables the rules engine gate.
 *
 * @param input - Complete deal analysis inputs.
 * @param db - Optional database connection for persistence.
 * @param rules - Optional rules to evaluate; hard-gate failures force
 *   `kellyPosition` to 0.
 * @returns {@link DealAnalysis} with all analysis layers populated.
 */
export function runDealAnalyzer(
  input: DealAnalyzerInput,
  db?: DatabaseConnection,
  rules?: Rule[],
): DealAnalysis {
  const {
    investmentId,
    name,
    ticker,
    sector,
    currentPrice,
    sharesOutstanding,
    screenerResult,
    moatScore,
    managementScore,
    scenarioInputs,
    baseRevenue,
    projectionYears,
    dcfInput,
    winProbability,
    dataStalenessHours,
    debtToEbitda,
  } = input;

  // ── Step 1: Scenario model ─────────────────────────────────────────────────
  const scenarioModel = modelScenarios(baseRevenue, sharesOutstanding, projectionYears, scenarioInputs);
  const { expectedValue } = scenarioModel;

  // ── Step 2: DCF ────────────────────────────────────────────────────────────
  const dcf = calculateDcf(dcfInput, currentPrice);
  const intrinsicValue = dcf.intrinsicValue;
  const marginOfSafety = dcf.marginOfSafety ?? 0;

  // ── Step 3: Pre-mortem (provides overconfidence-adjusted probability) ───────
  const preMortemInput: PreMortemInput = {
    winProbability,
    altmanZZone: screenerResult.altmanZ.zone,
    beneishManipulator: screenerResult.beneishM.likelyManipulator,
    debtToEbitda: debtToEbitda ?? null,
    managementScore,
    moatScore,
    compositeScore: screenerResult.compositeScore,
  };
  const preMortem = runPreMortem(preMortemInput);
  const adjustedProbability = preMortem.adjustedWinProbability;

  // ── Step 4: Kelly position sizing ─────────────────────────────────────────
  // gainFraction = (intrinsicValue - currentPrice) / currentPrice (upside from current)
  // lossFraction = downside estimated as 50% of current price (conservative floor)
  const gainFraction = Math.max((intrinsicValue - currentPrice) / currentPrice, 0.01);
  const lossFraction = 0.5; // conservative permanent-loss assumption

  const kelly = calculateKelly(
    { winProbability: adjustedProbability, gainFraction, lossFraction },
    dataStalenessHours,
  );

  // ── Step 5: Rules engine ───────────────────────────────────────────────────
  let rulesEngineResult: EngineResult | null = null;
  let blocked = false;

  if (rules && rules.length > 0) {
    const context: Record<string, number> = {
      altman_z: screenerResult.altmanZ.score,
      piotroski_f: screenerResult.piotroskiF.score,
      beneish_m: screenerResult.beneishM.score,
      composite_score: screenerResult.compositeScore,
      margin_of_safety: marginOfSafety,
      intrinsic_value: intrinsicValue,
      current_price: currentPrice,
      kelly_fraction: kelly.halfKelly,
      moat_score: moatScore,
      management_score: managementScore,
      ...(debtToEbitda !== null && debtToEbitda !== undefined
        ? { debt_to_ebitda: debtToEbitda }
        : {}),
    };
    rulesEngineResult = runEngine(rules, context);
    blocked = rulesEngineResult.blocked;
  }

  // ── Step 5b: Force kelly to 0 if blocked ──────────────────────────────────
  const kellyPosition = blocked ? 0 : kelly.halfKelly;

  // ── Step 6: Investment memo ────────────────────────────────────────────────
  const marginOfSafetyPct = marginOfSafety * 100;
  const kellyPct = kellyPosition; // already a fraction; memo converts internally

  const memoScenarios = scenarioModel.scenarios.map((s) => ({
    case: s.case,
    targetPrice: s.targetPrice,
    probabilityWeight: s.probabilityWeight,
  }));

  const memo = generateMemo({
    name,
    ticker,
    sector,
    intrinsicValue,
    currentPrice,
    marginOfSafety: marginOfSafetyPct,
    moatScore,
    managementScore,
    compositeScore: screenerResult.compositeScore,
    altmanZZone: screenerResult.altmanZ.zone,
    beneishManipulator: screenerResult.beneishM.likelyManipulator,
    expectedValue,
    kellyPosition: kellyPct,
    scenarios: memoScenarios,
  });

  // ── Step 7: Persistence (optional) ────────────────────────────────────────
  if (db) {
    // Persist scenarios — replace any stale rows.
    deleteScenarios(db, investmentId);
    saveScenarios(
      db,
      investmentId,
      scenarioModel.scenarios.map((s) => ({
        case: s.case,
        probabilityWeight: s.probabilityWeight,
        targetPrice: s.targetPrice,
        expectedValue: s.weightedValue,
      })),
    );

    // Journal entry capturing the decision at this point in time.
    createJournalEntry(db, {
      investmentId,
      entryType: 'deal_analysis',
      thesis: memo.thesis,
      confidence: Math.round(adjustedProbability * 100),
      keyAssumptions: {
        intrinsicValue,
        currentPrice,
        marginOfSafety,
        kellyPosition,
        blocked,
      },
      predictedProbability: adjustedProbability,
    });

    // Decision snapshot for audit trail.
    captureDecisionSnapshot(
      db,
      investmentId,
      rules ?? [],
      rulesEngineResult?.allResults ?? [],
      kellyPosition,
      scenarioModel.scenarios.map((s) => ({
        scenarioCase: s.case,
        probabilityWeight: s.probabilityWeight,
        targetPrice: s.targetPrice,
        expectedValue: s.weightedValue,
      })),
    );
  }

  return {
    investmentId,
    scenarioModel,
    dcf,
    kelly,
    kellyPosition,
    expectedValue,
    intrinsicValue,
    marginOfSafety,
    memo,
    preMortem,
    rulesEngineResult,
    blocked,
  };
}
