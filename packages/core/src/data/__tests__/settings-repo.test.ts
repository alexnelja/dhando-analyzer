import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DatabaseConnection } from '../db.js';
import { getSetting, setSetting, getAllSettings } from '../settings-repo.js';

describe('settings-repo', () => {
  let db: DatabaseConnection;
  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  it('returns null for an unset key', () => {
    expect(getSetting(db, 'EODHD_API_KEY')).toBeNull();
  });

  it('round-trips a value', () => {
    setSetting(db, 'EODHD_API_KEY', 'abc123');
    expect(getSetting(db, 'EODHD_API_KEY')).toBe('abc123');
  });

  it('upserts (second write overwrites)', () => {
    setSetting(db, 'EODHD_API_KEY', 'old');
    setSetting(db, 'EODHD_API_KEY', 'new');
    expect(getSetting(db, 'EODHD_API_KEY')).toBe('new');
    expect(getAllSettings(db)).toEqual({ EODHD_API_KEY: 'new' });
  });

  it('clears a key when set to empty string', () => {
    setSetting(db, 'EODHD_API_KEY', 'abc');
    setSetting(db, 'EODHD_API_KEY', '');
    expect(getSetting(db, 'EODHD_API_KEY')).toBeNull();
  });

  it('getAllSettings returns every stored pair', () => {
    setSetting(db, 'EODHD_API_KEY', 'e');
    setSetting(db, 'ANTHROPIC_API_KEY', 'a');
    expect(getAllSettings(db)).toEqual({ EODHD_API_KEY: 'e', ANTHROPIC_API_KEY: 'a' });
  });
});
