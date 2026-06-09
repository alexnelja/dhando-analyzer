/**
 * Zod schema for financial statements extracted from free text by Claude.
 *
 * Claude is instructed to return a JSON array of period objects. `year` is the
 * only required field; every figure is optional and nullable so a partial
 * statement (e.g. an income statement with no balance-sheet data) still parses
 * — the scoring adapters report any genuinely missing fields downstream.
 */

import { z } from 'zod';

const money = z.number().nullable().optional();

/** One reporting period as extracted from text. */
export const ExtractedPeriodSchema = z.object({
  year: z.number().int(),
  period: z.enum(['annual', 'quarterly']).optional(),
  quarter: z.number().int().nullable().optional(),

  revenue: money,
  netIncome: money,
  ebitda: money,
  totalAssets: money,
  totalDebt: money,
  cash: money,
  capex: money,
  fcf: money,
  workingCapital: money,
  retainedEarnings: money,
  ebit: money,
  totalLiabilities: money,
  longTermDebt: money,
  currentAssets: money,
  currentLiabilities: money,
  sharesOutstanding: money,
  grossProfit: money,
  receivables: money,
  ppe: money,
  depreciation: money,
  sga: money,
  cashFromOps: money,
});

/** Claude may return a bare array or wrap it under a `financials` key. */
export const ExtractedFinancialsSchema = z.union([
  z.array(ExtractedPeriodSchema),
  z.object({ financials: z.array(ExtractedPeriodSchema) }).transform((o) => o.financials),
]);

export type ExtractedPeriod = z.infer<typeof ExtractedPeriodSchema>;
