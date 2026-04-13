export interface Financial {
  id: string;
  investmentId: string;
  source: 'api' | 'manual';
  period: 'annual' | 'quarterly';
  year: number;
  quarter: number | null;

  // --- Original income-statement / balance-sheet fields ---
  revenue: number | null;
  netIncome: number | null;
  ebitda: number | null;
  totalAssets: number | null;
  totalDebt: number | null;
  cash: number | null;
  capex: number | null;
  fcf: number | null;
  workingCapital: number | null;

  // --- Extended fields for Altman-Z / Piotroski-F / Beneish-M auto-computation ---
  /** Cumulative retained earnings from the balance sheet. */
  retainedEarnings: number | null;
  /** Earnings Before Interest and Taxes. */
  ebit: number | null;
  /** Sum of all obligations (current + non-current). */
  totalLiabilities: number | null;
  /** Non-current portion of interest-bearing debt. */
  longTermDebt: number | null;
  /** Total current assets. */
  currentAssets: number | null;
  /** Total current liabilities. */
  currentLiabilities: number | null;
  /** Weighted-average shares outstanding used for per-share calculations. */
  sharesOutstanding: number | null;
  /** Revenue minus cost of goods sold. */
  grossProfit: number | null;
  /** Trade receivables / accounts receivable. */
  receivables: number | null;
  /** Net property, plant and equipment. */
  ppe: number | null;
  /** Depreciation and amortisation charge for the period. */
  depreciation: number | null;
  /** Selling, general and administrative expenses. */
  sga: number | null;
  /** Net cash generated from operating activities. */
  cashFromOps: number | null;

  // --- Source-tracking columns ---
  /**
   * JSON blob of field values fetched from an external API before any user
   * overrides were applied.  `null` when the row was entered fully manually.
   */
  apiValuesJson: string | null;
  /**
   * JSON array of camelCase field names that the user has overridden after
   * the API fetch.  `null` or empty when no overrides have been applied.
   */
  overriddenFields: string | null;

  // --- Metadata ---
  autoUpdated: boolean;
  lastRefresh: Date | null;
  apiSource: string | null;
}
