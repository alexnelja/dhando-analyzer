/**
 * Key/value store for app-level settings (e.g. per-user API keys).
 *
 * Persisted in the `app_settings` table inside the user's SQLite database, so
 * each user supplies their own credentials at runtime rather than relying on a
 * developer's `.env`. Values are stored as-is; callers decide what to persist.
 */

import type { DatabaseConnection } from './db.js';

/** Read a single setting, or `null` if unset. */
export function getSetting(db: DatabaseConnection, key: string): string | null {
  const row = db.get<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = ?`,
    key,
  );
  return row ? row.value : null;
}

/**
 * Upsert a setting. Passing an empty string deletes the key, so clearing a
 * field in the UI removes the stored value rather than persisting `''`.
 */
export function setSetting(db: DatabaseConnection, key: string, value: string): void {
  if (value === '') {
    db.run(`DELETE FROM app_settings WHERE key = ?`, key);
    return;
  }
  db.run(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

/** Return all settings as a plain object. */
export function getAllSettings(db: DatabaseConnection): Record<string, string> {
  const rows = db.all<{ key: string; value: string }>(`SELECT key, value FROM app_settings`);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
