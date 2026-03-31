/**
 * Private Markets Analysis Pipeline — orchestrates Dhandho fit scoring,
 * EM risk overlay, and owner earnings calculation into a single result.
 *
 * Gate logic:
 *   passesGate = dhandhoFit.passesGate
 *                AND (emRisk is null OR emRisk.riskLevel !== 'high')
 *
 * EM risk is optional — domestic deals (no EM exposure) pass the EM gate
 * unconditionally.
 */

import { calculateDhandhoFit, type DhandhoFitInput } from './dhandho-fit.js';
import { assessEmRisk, type EmRiskInput, type EmRiskResult } from './em-risk.js';
import type { DhandhoFitResult } from '../contracts/index.js';
import type { DealStage } from './deal-pipeline.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Full set of inputs for the private markets analysis pipeline.
 */
export interface PrivateMarketsInput {
  /**
   * ID of the investment being analysed (used for traceability — not persisted
   * by this function directly).
   */
  investmentId: string;

  /**
   * Raw 0–10 scores for each of the 9 Dhandho principles.
   * @see {@link calculateDhandhoFit}
   */
  dhandhoFit: DhandhoFitInput;

  /**
   * EM risk factor scores (0–10 each).
   * Pass `undefined` or omit for domestic deals — the EM gate is skipped.
   */
  emRisk?: EmRiskInput;

  /**
   * Net income for the owner earnings calculation.
   * May be negative for loss-making businesses.
   */
  netIncome: number;

  /**
   * Depreciation and amortisation for the owner earnings calculation.
   */
  depreciation: number;

  /**
   * Total capital expenditure (conservative upper bound) for the owner
   * earnings calculation.
   */
  capex: number;

  /**
   * Current deal stage in the PE pipeline.
   * Passed through to the result unchanged.
   */
  currentDealStage: DealStage;
}

/**
 * Combined output of the private markets analysis pipeline.
 */
export interface PrivateMarketsResult {
  /** Dhandho fit scoring result with per-principle breakdown. */
  dhandhoFit: DhandhoFitResult;

  /**
   * EM risk result.
   * `null` when no EM risk input was provided (domestic deal).
   */
  emRisk: EmRiskResult | null;

  /**
   * Owner earnings = net income + depreciation − capex.
   * May be negative; this is meaningful information.
   */
  ownerEarnings: number;

  /** Current deal stage, passed through from input. */
  dealStage: DealStage;

  /**
   * Overall investment gate.
   * `true` only when:
   *   - Dhandho fit score passes its gate (>= 54), AND
   *   - EM risk is absent OR EM risk level is not 'high'.
   */
  passesGate: boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Run the full private markets analysis pipeline.
 *
 * @param input - All required and optional analysis inputs.
 * @returns {@link PrivateMarketsResult} with all layers populated.
 * @throws {RangeError} If any Dhandho fit or EM risk score is outside [0, 10].
 *
 * @example
 * ```ts
 * const result = analyzePrivateMarket({
 *   investmentId: 'deal-001',
 *   dhandhoFit: { existingBusiness: 9, simpleBusiness: 8, ... },
 *   emRisk: { currencyRisk: 4, politicalRisk: 5, regulatoryRisk: 3, liquidityRisk: 4 },
 *   netIncome: 500_000,
 *   depreciation: 80_000,
 *   capex: 120_000,
 *   currentDealStage: 'deep_dd',
 * });
 * // result.passesGate reflects both Dhandho fit and EM risk gates.
 * ```
 */
export function analyzePrivateMarket(input: PrivateMarketsInput): PrivateMarketsResult {
  const dhandhoFit = calculateDhandhoFit(input.dhandhoFit);

  const emRisk: EmRiskResult | null =
    input.emRisk !== undefined ? assessEmRisk(input.emRisk) : null;

  const ownerEarnings = input.netIncome + input.depreciation - input.capex;

  const emGatePasses = emRisk === null || emRisk.riskLevel !== 'high';
  const passesGate = dhandhoFit.passesGate && emGatePasses;

  return {
    dhandhoFit,
    emRisk,
    ownerEarnings,
    dealStage: input.currentDealStage,
    passesGate,
  };
}
