import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEodhdClient } from '../../src/api/eodhd.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('EODHD API client', () => {
  const client = createEodhdClient('test-api-key');

  beforeEach(() => { mockFetch.mockReset(); });

  it('fetches fundamentals for a JSE ticker', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        Financials: {
          Income_Statement: { yearly: { '2025-12-31': { totalRevenue: '50000000000', netIncome: '10000000000' } } },
          Balance_Sheet: { yearly: { '2025-12-31': { totalAssets: '200000000000', totalLiab: '100000000000', cash: '30000000000' } } },
        },
      }),
    });

    const result = await client.getFundamentals('CPI.JSE');
    expect(result.revenue).toBe(50000000000);
    expect(result.totalAssets).toBe(200000000000);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('api_token=test-api-key'));
  });

  it('fetches price data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ date: '2026-03-28', open: 250, high: 255, low: 248, close: 253, volume: 100000 }]),
    });

    const result = await client.getPrice('CPI.JSE');
    expect(result.price).toBe(253);
    expect(result.date).toBe('2026-03-28');
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });
    await expect(client.getFundamentals('CPI.JSE')).rejects.toThrow('EODHD API error: 401');
  });
});
