import Database from 'better-sqlite3';

/**
 * Thin wrapper around a better-sqlite3 connection that exposes typed
 * query helpers and enforces WAL mode + foreign keys on every connection.
 *
 * Using raw SQL for table creation (rather than drizzle-kit push) gives
 * deterministic, dependency-free initialisation suitable for both production
 * SQLite files and in-memory test databases.
 */
export interface DatabaseConnection {
  /** The raw better-sqlite3 instance, available for advanced use. */
  readonly sqlite: Database.Database;
  /** Close the underlying connection. */
  close(): void;
  /** Execute a SELECT and return all matching rows typed as T. */
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[];
  /** Execute a mutating statement and return the run result. */
  run(sql: string, ...params: unknown[]): Database.RunResult;
  /** Execute a SELECT and return the first matching row typed as T, or undefined. */
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined;
}

/**
 * Create (or open) a SQLite database at the given path.
 * Pass `':memory:'` for an ephemeral in-process database (useful in tests).
 *
 * All 15 application tables are created idempotently via `CREATE TABLE IF NOT EXISTS`.
 *
 * @param path - Filesystem path or `':memory:'`.
 * @returns A {@link DatabaseConnection} ready for use.
 */
export function createDatabase(path: string): DatabaseConnection {
  const sqlite = new Database(path);

  // WAL mode: concurrent reads do not block writes; safe for single-process use.
  sqlite.pragma('journal_mode = WAL');
  // Enforce referential integrity at the SQLite level.
  sqlite.pragma('foreign_keys = ON');

  sqlite.exec(CREATE_TABLES_SQL);
  runMigrations(sqlite);

  return {
    sqlite,
    close() {
      sqlite.close();
    },
    all<T>(sql: string, ...params: unknown[]): T[] {
      return sqlite.prepare(sql).all(...params) as T[];
    },
    run(sql: string, ...params: unknown[]): Database.RunResult {
      return sqlite.prepare(sql).run(...params);
    },
    get<T>(sql: string, ...params: unknown[]): T | undefined {
      return sqlite.prepare(sql).get(...params) as T | undefined;
    },
  };
}

/**
 * Idempotent migrations run after table creation on every connection.
 * SQLite does not support `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, so each
 * ALTER is wrapped in a try/catch that re-throws any error that is NOT the
 * "duplicate column" error SQLite raises when the column already exists.
 */
function runMigrations(sqlite: Database.Database): void {
  const addColumn = (table: string, col: string, decl: string) => {
    try {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('duplicate column')) throw e;
    }
  };
  const financialCols: [string, string][] = [
    ['retained_earnings', 'REAL'], ['ebit', 'REAL'], ['total_liabilities', 'REAL'],
    ['long_term_debt', 'REAL'], ['current_assets', 'REAL'], ['current_liabilities', 'REAL'],
    ['shares_outstanding', 'REAL'], ['gross_profit', 'REAL'], ['receivables', 'REAL'],
    ['ppe', 'REAL'], ['depreciation', 'REAL'], ['sga', 'REAL'], ['cash_from_ops', 'REAL'],
    ['api_values_json', 'TEXT'], ['overridden_fields', 'TEXT'],
  ];
  for (const [c, t] of financialCols) addColumn('financials', c, t);
  addColumn('investments', 'market_cap', 'REAL');
  addColumn('investments', 'needs_manual_financials', 'INTEGER DEFAULT 0');

  // Enforce one row per (investment, period, year, quarter). SQLite treats
  // distinct NULLs as unique, so annual rows (quarter IS NULL) would not be
  // de-duplicated by a plain index — IFNULL(quarter, -1) collapses them.
  sqlite.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_financials_unique
       ON financials(investment_id, period, year, IFNULL(quarter, -1))`,
  );
}

/**
 * DDL executed on every new connection.
 * All statements use `IF NOT EXISTS` so re-opening an existing database is safe.
 */
const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS investments (
  id                             TEXT PRIMARY KEY,
  type                           TEXT NOT NULL,
  name                           TEXT NOT NULL,
  ticker                         TEXT,
  exchange                       TEXT,
  sector                         TEXT,
  industry                       TEXT,
  status                         TEXT NOT NULL DEFAULT 'screening',
  pe_deal_stage                  TEXT,
  data_source                    TEXT NOT NULL DEFAULT 'manual',
  intrinsic_value                REAL,
  intrinsic_value_calculated_at  TEXT,
  moat_score                     INTEGER,
  management_score               INTEGER,
  circle_of_competence_fit       INTEGER,
  user_id                        TEXT NOT NULL DEFAULT 'solo-investor',
  created_at                     TEXT NOT NULL,
  updated_at                     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS financials (
  id              TEXT PRIMARY KEY,
  investment_id   TEXT NOT NULL REFERENCES investments(id),
  source          TEXT NOT NULL,
  period          TEXT NOT NULL,
  year            INTEGER NOT NULL,
  quarter         INTEGER,
  revenue         REAL,
  net_income      REAL,
  ebitda          REAL,
  total_assets    REAL,
  total_debt      REAL,
  cash            REAL,
  capex           REAL,
  fcf             REAL,
  working_capital REAL,
  auto_updated    INTEGER DEFAULT 0,
  last_refresh    TEXT,
  api_source      TEXT
);

CREATE TABLE IF NOT EXISTS scores (
  id                     TEXT PRIMARY KEY,
  investment_id          TEXT NOT NULL REFERENCES investments(id),
  score_type             TEXT NOT NULL,
  value                  REAL NOT NULL,
  calculated_at          TEXT NOT NULL,
  inputs_json            TEXT DEFAULT '{}',
  financials_version_id  TEXT,
  data_staleness_hours   INTEGER DEFAULT 0,
  stale_warning          INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS distress_components (
  id            TEXT PRIMARY KEY,
  investment_id TEXT NOT NULL REFERENCES investments(id),
  component     TEXT NOT NULL,
  factor_score  REAL NOT NULL,
  calculated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS distress_summary (
  id                TEXT PRIMARY KEY,
  investment_id     TEXT NOT NULL REFERENCES investments(id),
  composite_score   REAL NOT NULL,
  permanence_score  REAL NOT NULL,
  classification    TEXT NOT NULL,
  calculated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rules (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  version             INTEGER NOT NULL DEFAULT 1,
  category            TEXT NOT NULL,
  type                TEXT NOT NULL,
  source_type         TEXT NOT NULL,
  source_detail       TEXT NOT NULL,
  description         TEXT NOT NULL,
  conditions_yaml     TEXT NOT NULL,
  weight              REAL NOT NULL DEFAULT 1.0,
  active              INTEGER NOT NULL DEFAULT 1,
  active_from         TEXT NOT NULL,
  active_to           TEXT,
  created_at          TEXT NOT NULL,
  times_fired         INTEGER NOT NULL DEFAULT 0,
  times_correct       INTEGER NOT NULL DEFAULT 0,
  believability_score REAL NOT NULL DEFAULT 0.5
);

CREATE TABLE IF NOT EXISTS rule_audit_log (
  id              TEXT PRIMARY KEY,
  investment_id   TEXT NOT NULL REFERENCES investments(id),
  rule_id         TEXT NOT NULL REFERENCES rules(id),
  rule_version    INTEGER NOT NULL,
  fired_at        TEXT NOT NULL,
  result          TEXT NOT NULL,
  override        INTEGER DEFAULT 0,
  override_reason TEXT
);

CREATE TABLE IF NOT EXISTS scenarios (
  id                TEXT PRIMARY KEY,
  investment_id     TEXT NOT NULL REFERENCES investments(id),
  scenario_case     TEXT NOT NULL,
  revenue_growth    REAL,
  margin            REAL,
  multiple          REAL,
  probability_weight REAL,
  target_price      REAL,
  expected_value    REAL
);

CREATE TABLE IF NOT EXISTS decision_journal (
  id                    TEXT PRIMARY KEY,
  investment_id         TEXT NOT NULL REFERENCES investments(id),
  entry_type            TEXT NOT NULL,
  thesis                TEXT,
  confidence            INTEGER,
  key_assumptions_json  TEXT DEFAULT '{}',
  predicted_probability REAL,
  actual_outcome        REAL,
  brier_score           REAL,
  lessons               TEXT,
  created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS super_investor_positions (
  id            TEXT PRIMARY KEY,
  investor_name TEXT NOT NULL,
  ticker        TEXT NOT NULL,
  action        TEXT NOT NULL,
  quarter       TEXT NOT NULL,
  shares        INTEGER,
  value         REAL
);

CREATE TABLE IF NOT EXISTS sentiment (
  id            TEXT PRIMARY KEY,
  investment_id TEXT NOT NULL REFERENCES investments(id),
  source        TEXT NOT NULL,
  headline      TEXT NOT NULL,
  score         REAL NOT NULL,
  confidence    REAL DEFAULT 1.0,
  date          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comparable_transactions (
  id                 TEXT PRIMARY KEY,
  deal_type          TEXT NOT NULL,
  sector             TEXT,
  industry           TEXT,
  valuation_metric   TEXT,
  valuation_multiple REAL,
  date               TEXT,
  notes              TEXT
);

CREATE TABLE IF NOT EXISTS geopolitical_events (
  id                TEXT PRIMARY KEY,
  event_type        TEXT NOT NULL,
  event_pattern     TEXT NOT NULL,
  affected_sectors  TEXT NOT NULL,
  affected_tickers  TEXT,
  relevance_weight  REAL NOT NULL DEFAULT 0.5,
  trigger_threshold INTEGER NOT NULL DEFAULT 50,
  last_triggered    TEXT,
  active            INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sync_conflict_log (
  id           TEXT PRIMARY KEY,
  table_name   TEXT NOT NULL,
  record_id    TEXT NOT NULL,
  local_value  TEXT,
  cloud_value  TEXT,
  conflict_at  TEXT NOT NULL,
  resolved     INTEGER DEFAULT 0,
  resolution   TEXT
);

CREATE TABLE IF NOT EXISTS decision_snapshots (
  id                TEXT PRIMARY KEY,
  investment_id     TEXT NOT NULL REFERENCES investments(id),
  snapshot_at       TEXT NOT NULL,
  active_rules_json TEXT NOT NULL,
  scores_json       TEXT NOT NULL,
  kelly_position    REAL,
  scenario_json     TEXT
);

CREATE TABLE IF NOT EXISTS portfolio_positions (
  id            TEXT PRIMARY KEY,
  investment_id TEXT NOT NULL REFERENCES investments(id),
  cost_basis    REAL NOT NULL,
  shares        REAL NOT NULL,
  entered_at    TEXT NOT NULL,
  exited_at     TEXT,
  exit_price    REAL
);
`;
