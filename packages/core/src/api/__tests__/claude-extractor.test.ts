import { describe, it, expect, vi } from 'vitest';
import { extractFinancialsFromText, ExtractError } from '../claude-extractor.js';

const makeClient = (reply: string) => ({ chat: vi.fn(async () => reply) });

const VALID = JSON.stringify([
  { year: 2025, revenue: 1000, netIncome: 100, totalAssets: 5000 },
  { year: 2024, revenue: 900, netIncome: 60 },
]);

describe('extractFinancialsFromText', () => {
  it('parses a valid JSON array into Financial[]', async () => {
    const client = makeClient(VALID);
    const rows = await extractFinancialsFromText(client, 'inv1', 'paste of statements');
    expect(rows).toHaveLength(2);
    expect(rows[0].year).toBe(2025);
    expect(rows[0].revenue).toBe(1000);
    expect(rows[0].investmentId).toBe('inv1');
    expect(rows[0].source).toBe('manual');
    expect(rows[0].apiValuesJson).toBeNull();
    // Unspecified fields default to null, not undefined.
    expect(rows[0].cashFromOps).toBeNull();
  });

  it('strips markdown code fences before parsing', async () => {
    const client = makeClient('```json\n' + VALID + '\n```');
    const rows = await extractFinancialsFromText(client, 'inv1', 'text');
    expect(rows).toHaveLength(2);
    expect(rows[1].year).toBe(2024);
  });

  it('accepts an object wrapping the array under "financials"', async () => {
    const client = makeClient(JSON.stringify({ financials: [{ year: 2025, revenue: 5 }] }));
    const rows = await extractFinancialsFromText(client, 'inv1', 'text');
    expect(rows).toHaveLength(1);
    expect(rows[0].revenue).toBe(5);
  });

  it('throws ExtractError carrying the raw text on invalid JSON', async () => {
    const client = makeClient('I could not find any financials, sorry!');
    await expect(extractFinancialsFromText(client, 'inv1', 'text')).rejects.toBeInstanceOf(
      ExtractError,
    );
    try {
      await extractFinancialsFromText(client, 'inv1', 'text');
    } catch (e) {
      expect((e as ExtractError).rawText).toContain('could not find');
    }
  });

  it('throws when a period is missing the required year', async () => {
    const client = makeClient(JSON.stringify([{ revenue: 1000 }]));
    await expect(extractFinancialsFromText(client, 'inv1', 'text')).rejects.toBeInstanceOf(
      ExtractError,
    );
  });

  it('assigns deterministic ids keyed by period/year/quarter', async () => {
    const client = makeClient(VALID);
    const rows = await extractFinancialsFromText(client, 'inv1', 'text');
    expect(rows[0].id).toBe('inv1-annual-2025-A');
  });
});
