import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFinnhubClient } from '../../src/api/finnhub.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Finnhub API client', () => {
  const client = createFinnhubClient('test-finnhub-key');

  beforeEach(() => { mockFetch.mockReset(); });

  // ── Insider Transactions ───────────────────────────────────────────────────

  it('constructs insider transaction URL with symbol and token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
    await client.getInsiderTransactions('AAPL');
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/stock/insider-transactions');
    expect(calledUrl).toContain('symbol=AAPL');
    expect(calledUrl).toContain('token=test-finnhub-key');
  });

  it('parses insider transactions into typed objects', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: [
          {
            name: 'Tim Cook',
            share: 50000,
            change: -10000,
            transactionDate: '2026-03-15',
            transactionCode: 'S',
            transactionPrice: 185.5,
          },
          {
            name: 'Luca Maestri',
            share: 20000,
            change: 5000,
            transactionDate: '2026-03-10',
            transactionCode: 'P',
            transactionPrice: 180.0,
          },
        ],
      }),
    });
    const result = await client.getInsiderTransactions('AAPL');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: 'Tim Cook',
      share: 50000,
      change: -10000,
      transactionDate: '2026-03-15',
      transactionCode: 'S',
      transactionPrice: 185.5,
    });
    expect(result[1].transactionCode).toBe('P');
  });

  it('returns empty array when data field is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    const result = await client.getInsiderTransactions('AAPL');
    expect(result).toEqual([]);
  });

  it('fills missing fields with defaults', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{}] }),
    });
    const result = await client.getInsiderTransactions('AAPL');
    expect(result[0]).toEqual({
      name: '',
      share: 0,
      change: 0,
      transactionDate: '',
      transactionCode: '',
      transactionPrice: 0,
    });
  });

  it('throws on non-OK response for insider transactions', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(client.getInsiderTransactions('AAPL')).rejects.toThrow('Finnhub API error: 403');
  });

  // ── Analyst Recommendations ────────────────────────────────────────────────

  it('constructs recommendation URL with symbol and token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });
    await client.getRecommendations('MSFT');
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/stock/recommendation');
    expect(calledUrl).toContain('symbol=MSFT');
    expect(calledUrl).toContain('token=test-finnhub-key');
  });

  it('returns recommendation array as-is', async () => {
    const recs = [{ buy: 20, hold: 5, sell: 1, strongBuy: 10, strongSell: 0, period: '2026-03-01' }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(recs),
    });
    const result = await client.getRecommendations('MSFT');
    expect(result).toEqual(recs);
  });

  it('returns empty array when recommendation response is not an array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(null),
    });
    const result = await client.getRecommendations('MSFT');
    expect(result).toEqual([]);
  });

  // ── Basic Financials ──────────────────────────────────────────────────────

  it('constructs basic financials URL with symbol, metric=all, and token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ metric: { peNormalizedAnnual: 22.5 } }),
    });
    await client.getBasicFinancials('NVDA');
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/stock/metric');
    expect(calledUrl).toContain('symbol=NVDA');
    expect(calledUrl).toContain('metric=all');
    expect(calledUrl).toContain('token=test-finnhub-key');
  });

  it('returns metric object from basic financials', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ metric: { peNormalizedAnnual: 22.5, marketCapitalization: 1500000 } }),
    });
    const result = await client.getBasicFinancials('NVDA');
    expect(result.peNormalizedAnnual).toBe(22.5);
    expect(result.marketCapitalization).toBe(1500000);
  });

  // ── Earnings Calendar ─────────────────────────────────────────────────────

  it('constructs earnings calendar URL with from/to dates and token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ earningsCalendar: [] }),
    });
    await client.getEarningsCalendar('2026-04-01', '2026-04-30');
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/calendar/earnings');
    expect(calledUrl).toContain('from=2026-04-01');
    expect(calledUrl).toContain('to=2026-04-30');
    expect(calledUrl).toContain('token=test-finnhub-key');
  });

  it('returns earnings calendar array', async () => {
    const earnings = [{ symbol: 'AAPL', epsEstimate: 1.5, date: '2026-04-24' }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ earningsCalendar: earnings }),
    });
    const result = await client.getEarningsCalendar('2026-04-01', '2026-04-30');
    expect(result).toEqual(earnings);
  });
});
