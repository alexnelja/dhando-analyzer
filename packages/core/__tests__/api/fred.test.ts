import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFredClient } from '../../src/api/fred.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeResponse(observations: { date: string; value: string }[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ observations }),
  };
}

describe('FRED API client', () => {
  const client = createFredClient('test-fred-key');

  beforeEach(() => { mockFetch.mockReset(); });

  it('constructs a URL with the correct series_id and api_key', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse([{ date: '2026-03-28', value: '15.2' }]));
    await client.getVix();
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('series_id=VIXCLS');
    expect(calledUrl).toContain('api_key=test-fred-key');
    expect(calledUrl).toContain('file_type=json');
    expect(calledUrl).toContain('sort_order=desc');
  });

  it('parses observations into FredObservation array', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse([
      { date: '2026-03-28', value: '15.2' },
      { date: '2026-03-27', value: '14.8' },
    ]));
    const result = await client.getVix();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ date: '2026-03-28', value: 15.2 });
    expect(result[1]).toEqual({ date: '2026-03-27', value: 14.8 });
  });

  it('filters out observations with "." (missing data)', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse([
      { date: '2026-03-28', value: '.' },
      { date: '2026-03-27', value: '5.5' },
    ]));
    const result = await client.getYieldCurve();
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(5.5);
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(client.getCreditSpread()).rejects.toThrow('FRED API error: 429');
  });

  it('returns empty array when observations is missing from response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    const result = await client.getFedFundsRate();
    expect(result).toEqual([]);
  });

  it('getCreditSpread uses series BAMLH0A0HYM2', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse([]));
    await client.getCreditSpread();
    expect(mockFetch.mock.calls[0][0]).toContain('series_id=BAMLH0A0HYM2');
  });

  it('getZarUsd uses series DEXSFUS', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse([{ date: '2026-03-28', value: '18.85' }]));
    const result = await client.getZarUsd();
    expect(mockFetch.mock.calls[0][0]).toContain('series_id=DEXSFUS');
    expect(result[0].value).toBe(18.85);
  });

  it('getSaRepoRate uses series INTDSRZAM193N', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse([{ date: '2026-01-01', value: '8.25' }]));
    await client.getSaRepoRate();
    expect(mockFetch.mock.calls[0][0]).toContain('series_id=INTDSRZAM193N');
  });

  it('getYieldCurve requests limit 30', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse([]));
    await client.getYieldCurve();
    expect(mockFetch.mock.calls[0][0]).toContain('limit=30');
  });

  it('getCPI requests limit 24', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse([]));
    await client.getCPI();
    expect(mockFetch.mock.calls[0][0]).toContain('limit=24');
  });
});
