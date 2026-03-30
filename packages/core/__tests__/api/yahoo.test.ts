import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createYahooClient } from '../../src/api/yahoo.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Yahoo Finance client', () => {
  const client = createYahooClient();

  beforeEach(() => { mockFetch.mockReset(); });

  it('fetches price data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        chart: {
          result: [{
            meta: { regularMarketPrice: 253.5 },
            timestamp: [1711584000],
            indicators: { quote: [{ open: [250], high: [255], low: [248], close: [253.5], volume: [100000] }] },
          }],
        },
      }),
    });

    const result = await client.getPrice('CPI.JO');
    expect(result.price).toBe(253.5);
  });

  it('returns empty fundamentals (price-only fallback)', async () => {
    const result = await client.getFundamentals('CPI.JO');
    expect(result).toEqual({});
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });
    await expect(client.getPrice('INVALID')).rejects.toThrow('Yahoo Finance API error: 404');
  });
});
