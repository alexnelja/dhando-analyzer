/**
 * Altman Z-Score calculator.
 *
 * Source: Altman (1968), "Financial Ratios, Discriminant Analysis and the
 * Prediction of Corporate Bankruptcy."
 *
 * Formula: Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E
 *
 * Originally validated on publicly traded manufacturing companies. Use with
 * caution for non-manufacturing, private, or financial companies — consider
 * the modified Z'-Score or Z''-Score variants for those contexts.
 */

import type { Financial } from '../models/financial.js';
import { collectMissing, type InsufficientResult } from './insufficient.js';

/**
 * Inputs required for the Altman Z-Score calculation.
 * All monetary values must be in a consistent unit (e.g. thousands, millions).
 */
export interface AltmanZInputs {
  /** Current assets minus current liabilities. */
  workingCapital: number;
  /** Balance sheet total assets. */
  totalAssets: number;
  /** Accumulated retained earnings on the balance sheet. */
  retainedEarnings: number;
  /** Earnings before interest and taxes (operating profit). */
  ebit: number;
  /** Market capitalisation of equity (shares outstanding × price). */
  marketCapEquity: number;
  /** Total liabilities (current + long-term). */
  totalLiabilities: number;
  /** Net revenue / turnover for the period. */
  revenue: number;
}

/** The five intermediate ratios that compose the Z-Score. */
export interface AltmanZComponents {
  /** Working Capital / Total Assets — liquidity proxy. */
  A: number;
  /** Retained Earnings / Total Assets — cumulative profitability. */
  B: number;
  /** EBIT / Total Assets — operating efficiency. */
  C: number;
  /** Market Cap of Equity / Total Liabilities — solvency proxy. */
  D: number;
  /** Revenue / Total Assets — asset turnover. */
  E: number;
}

/** Zone classification derived from the raw Z-Score. */
export type AltmanZZone = 'safe' | 'grey' | 'distress';

export interface AltmanZResult {
  /** The raw Altman Z-Score. */
  z: number;
  /** Breakdown of the five component ratios. */
  components: AltmanZComponents;
  /** Textual zone classification. */
  zone: AltmanZZone;
}

/**
 * Map a raw Z-Score to its Altman zone classification.
 *
 * - Z > 2.99  → safe     (low bankruptcy risk)
 * - Z 1.81–2.99 → grey  (moderate risk; further research required)
 * - Z < 1.81  → distress (high bankruptcy risk)
 *
 * @param z - The raw Z-Score value.
 * @returns The zone label.
 */
export function interpretAltmanZ(z: number): AltmanZZone {
  if (z > 2.99) return 'safe';
  if (z >= 1.81) return 'grey';
  return 'distress';
}

/**
 * Calculate the Altman Z-Score for a manufacturing / industrial company.
 *
 * Formula: Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E
 *
 * @param inputs - Financial inputs. See {@link AltmanZInputs}.
 * @returns Full {@link AltmanZResult} including components and zone.
 * @throws {Error} If `totalAssets` or `totalLiabilities` is zero.
 */
export function calculateAltmanZ(inputs: AltmanZInputs): AltmanZResult {
  const {
    workingCapital,
    totalAssets,
    retainedEarnings,
    ebit,
    marketCapEquity,
    totalLiabilities,
    revenue,
  } = inputs;

  if (totalAssets === 0) {
    throw new Error('Altman Z-Score: totalAssets must not be zero');
  }
  if (totalLiabilities === 0) {
    throw new Error('Altman Z-Score: totalLiabilities must not be zero');
  }

  const A = workingCapital / totalAssets;
  const B = retainedEarnings / totalAssets;
  const C = ebit / totalAssets;
  const D = marketCapEquity / totalLiabilities;
  const E = revenue / totalAssets;

  const z = 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;

  return { z, components: { A, B, C, D, E }, zone: interpretAltmanZ(z) };
}

/**
 * Compute the Altman Z-Score from a {@link Financial} row plus market cap.
 *
 * EBIT is taken directly when present; otherwise it falls back to
 * `ebitda - depreciation` when both are available. If any required input is
 * missing the function returns {@link InsufficientResult} listing every absent
 * field (camelCase), rather than throwing.
 *
 * @param current - The current-period financial statement.
 * @param opts.marketCap - Market capitalisation of equity (shares × price).
 */
export function calculateAltmanZFromFinancials(
  current: Financial,
  opts: { marketCap: number | null },
): AltmanZResult | InsufficientResult {
  const effectiveEbit =
    current.ebit ??
    (current.ebitda != null && current.depreciation != null
      ? current.ebitda - current.depreciation
      : null);

  const missingFields = collectMissing({
    workingCapital: current.workingCapital,
    totalAssets: current.totalAssets,
    retainedEarnings: current.retainedEarnings,
    ebit: effectiveEbit,
    totalLiabilities: current.totalLiabilities,
    revenue: current.revenue,
    marketCap: opts.marketCap,
  });

  if (missingFields.length > 0) {
    return { status: 'insufficient', missingFields };
  }

  return calculateAltmanZ({
    workingCapital: current.workingCapital!,
    totalAssets: current.totalAssets!,
    retainedEarnings: current.retainedEarnings!,
    ebit: effectiveEbit!,
    marketCapEquity: opts.marketCap!,
    totalLiabilities: current.totalLiabilities!,
    revenue: current.revenue!,
  });
}
