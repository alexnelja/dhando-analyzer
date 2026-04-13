import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/**
 * Core investment entity — listed stocks, private equity deals, or real assets.
 */
export const investments = sqliteTable('investments', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  ticker: text('ticker'),
  exchange: text('exchange'),
  sector: text('sector'),
  industry: text('industry'),
  status: text('status').notNull().default('screening'),
  peDealStage: text('pe_deal_stage'),
  dataSource: text('data_source').notNull().default('manual'),
  intrinsicValue: real('intrinsic_value'),
  intrinsicValueCalculatedAt: text('intrinsic_value_calculated_at'),
  moatScore: integer('moat_score'),
  managementScore: integer('management_score'),
  circleOfCompetenceFit: integer('circle_of_competence_fit'),
  userId: text('user_id').notNull().default('solo-investor'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),

  // Auto-compute eligibility
  marketCap: real('market_cap'),
  needsManualFinancials: integer('needs_manual_financials', { mode: 'boolean' }).default(false),
});

/**
 * Raw and normalised financial statements per investment per period.
 * Both manual entries and auto-fetched data live here; auto_updated flag
 * distinguishes the two so stale-data warnings can be surfaced.
 */
export const financials = sqliteTable('financials', {
  id: text('id').primaryKey(),
  investmentId: text('investment_id').notNull().references(() => investments.id),
  source: text('source').notNull(),
  period: text('period').notNull(),
  year: integer('year').notNull(),
  quarter: integer('quarter'),
  revenue: real('revenue'),
  netIncome: real('net_income'),
  ebitda: real('ebitda'),
  totalAssets: real('total_assets'),
  totalDebt: real('total_debt'),
  cash: real('cash'),
  capex: real('capex'),
  fcf: real('fcf'),
  workingCapital: real('working_capital'),
  autoUpdated: integer('auto_updated', { mode: 'boolean' }).default(false),
  lastRefresh: text('last_refresh'),
  apiSource: text('api_source'),

  // Extended fields for Altman-Z / Piotroski-F / Beneish-M auto-computation
  retainedEarnings: real('retained_earnings'),
  ebit: real('ebit'),
  totalLiabilities: real('total_liabilities'),
  longTermDebt: real('long_term_debt'),
  currentAssets: real('current_assets'),
  currentLiabilities: real('current_liabilities'),
  sharesOutstanding: real('shares_outstanding'),
  grossProfit: real('gross_profit'),
  receivables: real('receivables'),
  ppe: real('ppe'),
  depreciation: real('depreciation'),
  sga: real('sga'),
  cashFromOps: real('cash_from_ops'),

  // Source-tracking columns
  apiValuesJson: text('api_values_json'),
  overriddenFields: text('overridden_fields'),
});

/**
 * Computed scores (Munger checklist, Buffett moat, Kelly sizing, etc.)
 * keyed by score_type so new scoring models can be added without schema changes.
 */
export const scores = sqliteTable('scores', {
  id: text('id').primaryKey(),
  investmentId: text('investment_id').notNull().references(() => investments.id),
  scoreType: text('score_type').notNull(),
  value: real('value').notNull(),
  calculatedAt: text('calculated_at').notNull(),
  inputsJson: text('inputs_json').default('{}'),
  financialsVersionId: text('financials_version_id'),
  dataStalenessHours: integer('data_staleness_hours').default(0),
  staleWarning: integer('stale_warning', { mode: 'boolean' }).default(false),
});

/**
 * Individual factor scores that feed into the composite distress assessment.
 */
export const distressComponents = sqliteTable('distress_components', {
  id: text('id').primaryKey(),
  investmentId: text('investment_id').notNull().references(() => investments.id),
  component: text('component').notNull(),
  factorScore: real('factor_score').notNull(),
  calculatedAt: text('calculated_at').notNull(),
});

/**
 * Rolled-up distress verdict per investment: composite score, permanence
 * assessment, and classification (temporary / structural / terminal).
 */
export const distressSummary = sqliteTable('distress_summary', {
  id: text('id').primaryKey(),
  investmentId: text('investment_id').notNull().references(() => investments.id),
  compositeScore: real('composite_score').notNull(),
  permanenceScore: real('permanence_score').notNull(),
  classification: text('classification').notNull(),
  calculatedAt: text('calculated_at').notNull(),
});

/**
 * Versioned investment rules (Munger mental models, Buffett checklist items,
 * user-defined guardrails). Each row is an immutable rule version; the
 * believability score updates as outcome data accumulates.
 */
export const rules = sqliteTable('rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: integer('version').notNull().default(1),
  category: text('category').notNull(),
  type: text('type').notNull(),
  sourceType: text('source_type').notNull(),
  sourceDetail: text('source_detail').notNull(),
  description: text('description').notNull(),
  conditionsYaml: text('conditions_yaml').notNull(),
  weight: real('weight').notNull().default(1.0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  activeFrom: text('active_from').notNull(),
  activeTo: text('active_to'),
  createdAt: text('created_at').notNull(),
  timesFired: integer('times_fired').notNull().default(0),
  timesCorrect: integer('times_correct').notNull().default(0),
  believabilityScore: real('believability_score').notNull().default(0.5),
});

/**
 * Immutable audit trail of every rule evaluation, including any analyst
 * overrides and the reason given. Enables post-mortem calibration.
 */
export const ruleAuditLog = sqliteTable('rule_audit_log', {
  id: text('id').primaryKey(),
  investmentId: text('investment_id').notNull().references(() => investments.id),
  ruleId: text('rule_id').notNull().references(() => rules.id),
  ruleVersion: integer('rule_version').notNull(),
  firedAt: text('fired_at').notNull(),
  result: text('result').notNull(),
  override: integer('override', { mode: 'boolean' }).default(false),
  overrideReason: text('override_reason'),
});

/**
 * Bear / base / bull scenario models with probability weights, used to
 * compute an expected intrinsic value via probability-weighted DCF.
 */
export const scenarios = sqliteTable('scenarios', {
  id: text('id').primaryKey(),
  investmentId: text('investment_id').notNull().references(() => investments.id),
  scenarioCase: text('scenario_case').notNull(),
  revenueGrowth: real('revenue_growth'),
  margin: real('margin'),
  multiple: real('multiple'),
  probabilityWeight: real('probability_weight'),
  targetPrice: real('target_price'),
  expectedValue: real('expected_value'),
});

/**
 * Decision journal entries with embedded Brier scoring so calibration
 * can be measured over time. Stores the original thesis for post-mortem review.
 */
export const decisionJournal = sqliteTable('decision_journal', {
  id: text('id').primaryKey(),
  investmentId: text('investment_id').notNull().references(() => investments.id),
  entryType: text('entry_type').notNull(),
  thesis: text('thesis'),
  confidence: integer('confidence'),
  keyAssumptionsJson: text('key_assumptions_json').default('{}'),
  predictedProbability: real('predicted_probability'),
  actualOutcome: real('actual_outcome'),
  brierScore: real('brier_score'),
  lessons: text('lessons'),
  createdAt: text('created_at').notNull(),
});

/**
 * 13F-derived super-investor position changes, used as a signal overlay
 * rather than a primary investment trigger.
 */
export const superInvestorPositions = sqliteTable('super_investor_positions', {
  id: text('id').primaryKey(),
  investorName: text('investor_name').notNull(),
  ticker: text('ticker').notNull(),
  action: text('action').notNull(),
  quarter: text('quarter').notNull(),
  shares: integer('shares'),
  value: real('value'),
});

/**
 * NLP-derived sentiment signals from news, filings, and earnings calls.
 * Confidence column allows downstream weighting by source reliability.
 */
export const sentiment = sqliteTable('sentiment', {
  id: text('id').primaryKey(),
  investmentId: text('investment_id').notNull().references(() => investments.id),
  source: text('source').notNull(),
  headline: text('headline').notNull(),
  score: real('score').notNull(),
  confidence: real('confidence').default(1.0),
  date: text('date').notNull(),
});

/**
 * M&A comparable transaction database for private-market valuation benchmarks.
 */
export const comparableTransactions = sqliteTable('comparable_transactions', {
  id: text('id').primaryKey(),
  dealType: text('deal_type').notNull(),
  sector: text('sector'),
  industry: text('industry'),
  valuationMetric: text('valuation_metric'),
  valuationMultiple: real('valuation_multiple'),
  date: text('date'),
  notes: text('notes'),
});

/**
 * Geopolitical event patterns with sector/ticker relevance weights.
 * Rules engine queries this table to modulate risk scores when macro events fire.
 */
export const geopoliticalEvents = sqliteTable('geopolitical_events', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  eventPattern: text('event_pattern').notNull(),
  affectedSectors: text('affected_sectors').notNull(),
  affectedTickers: text('affected_tickers'),
  relevanceWeight: real('relevance_weight').notNull().default(0.5),
  triggerThreshold: integer('trigger_threshold').notNull().default(50),
  lastTriggered: text('last_triggered'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

/**
 * Conflict log for local/cloud sync divergence. Persists both values so
 * a human can resolve ambiguity rather than silently overwriting data.
 */
export const syncConflictLog = sqliteTable('sync_conflict_log', {
  id: text('id').primaryKey(),
  tableName: text('table_name').notNull(),
  recordId: text('record_id').notNull(),
  localValue: text('local_value'),
  cloudValue: text('cloud_value'),
  conflictAt: text('conflict_at').notNull(),
  resolved: integer('resolved', { mode: 'boolean' }).default(false),
  resolution: text('resolution'),
});

/**
 * Point-in-time decision snapshots that freeze the active rule set, scores,
 * and Kelly sizing at the moment a trade decision is recorded.
 * Enables forensic post-mortems without mutable state.
 */
export const decisionSnapshots = sqliteTable('decision_snapshots', {
  id: text('id').primaryKey(),
  investmentId: text('investment_id').notNull().references(() => investments.id),
  snapshotAt: text('snapshot_at').notNull(),
  activeRulesJson: text('active_rules_json').notNull(),
  scoresJson: text('scores_json').notNull(),
  kellyPosition: real('kelly_position'),
  scenarioJson: text('scenario_json'),
});
