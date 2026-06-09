/**
 * Extract structured financial statements from free-form text using Claude.
 *
 * The user pastes (e.g.) an annual-report income statement; Claude returns a
 * JSON array which is validated against {@link ExtractedFinancialsSchema} and
 * mapped to fully-formed {@link Financial} rows tagged `source: 'manual'`.
 */

import type { Financial } from '../models/financial.js';
import type { ClaudeMessage } from './claude.js';
import { ExtractedFinancialsSchema, type ExtractedPeriod } from './claude-extractor-schema.js';

/** Minimal shape of the Claude client this module needs (see `createClaudeClient`). */
export interface ChatClient {
  chat(messages: ClaudeMessage[], systemPrompt?: string): Promise<string>;
}

/** Raised when Claude's reply cannot be parsed/validated; carries the raw text. */
export class ExtractError extends Error {
  readonly rawText: string;
  constructor(message: string, rawText: string) {
    super(message);
    this.name = 'ExtractError';
    this.rawText = rawText;
  }
}

const SYSTEM_PROMPT = `You extract financial-statement figures from text and output ONLY JSON.

Return a JSON array; one object per reporting period, each with:
- "year" (integer, required)
- "period" ("annual" or "quarterly", optional; default annual)
- "quarter" (integer or null, optional)
- numeric fields where present: revenue, netIncome, ebitda, ebit, grossProfit, sga,
  totalAssets, totalLiabilities, totalDebt, cash, retainedEarnings, longTermDebt,
  currentAssets, currentLiabilities, sharesOutstanding, receivables, ppe,
  workingCapital, depreciation, capex, fcf, cashFromOps.

Use null for figures not present in the text. All amounts in the statement's
reporting currency and scale. Output the JSON array and nothing else.`;

/** Strip a leading/trailing ```json … ``` fence if Claude added one. */
function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

/** Build a complete {@link Financial} from a validated extracted period. */
function toFinancial(investmentId: string, p: ExtractedPeriod): Financial {
  const period = p.period ?? 'annual';
  const quarter = p.quarter ?? null;
  const n = (v: number | null | undefined): number | null => (v == null ? null : v);
  return {
    id: `${investmentId}-${period}-${p.year}-${quarter ?? 'A'}`,
    investmentId,
    source: 'manual',
    period,
    year: p.year,
    quarter,
    revenue: n(p.revenue),
    netIncome: n(p.netIncome),
    ebitda: n(p.ebitda),
    totalAssets: n(p.totalAssets),
    totalDebt: n(p.totalDebt),
    cash: n(p.cash),
    capex: n(p.capex),
    fcf: n(p.fcf),
    workingCapital: n(p.workingCapital),
    retainedEarnings: n(p.retainedEarnings),
    ebit: n(p.ebit),
    totalLiabilities: n(p.totalLiabilities),
    longTermDebt: n(p.longTermDebt),
    currentAssets: n(p.currentAssets),
    currentLiabilities: n(p.currentLiabilities),
    sharesOutstanding: n(p.sharesOutstanding),
    grossProfit: n(p.grossProfit),
    receivables: n(p.receivables),
    ppe: n(p.ppe),
    depreciation: n(p.depreciation),
    sga: n(p.sga),
    cashFromOps: n(p.cashFromOps),
    apiValuesJson: null,
    overriddenFields: null,
    autoUpdated: false,
    lastRefresh: null,
    apiSource: null,
  };
}

/**
 * Ask Claude to extract financials from `text` and return validated rows.
 *
 * @throws {ExtractError} when the reply is not valid JSON, or fails schema
 *   validation (e.g. a period missing the required `year`). The error's
 *   `rawText` holds Claude's original reply for display/debugging.
 */
export async function extractFinancialsFromText(
  client: ChatClient,
  investmentId: string,
  text: string,
): Promise<Financial[]> {
  const reply = await client.chat([{ role: 'user', content: text }], SYSTEM_PROMPT);
  const stripped = stripFences(reply);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new ExtractError('Claude reply was not valid JSON', reply);
  }

  const result = ExtractedFinancialsSchema.safeParse(parsed);
  if (!result.success) {
    throw new ExtractError(`Extracted financials failed validation: ${result.error.message}`, reply);
  }

  return result.data.map((p) => toFinancial(investmentId, p));
}
