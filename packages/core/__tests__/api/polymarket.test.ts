import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPolymarketClient } from '../../src/api/polymarket.js';
import type { PolymarketEvent } from '../../src/api/polymarket.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okJson(payload: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
}

function errorResponse(status: number) {
  return Promise.resolve({ ok: false, status });
}

function makeEvent(overrides: Partial<PolymarketEvent> = {}): PolymarketEvent {
  return {
    id: 'evt-1',
    slug: 'test-event',
    title: 'Test Event',
    description: 'A test event',
    volume: 500000,
    liquidity: 200000,
    endDate: '2026-12-31T00:00:00Z',
    active: true,
    markets: [
      {
        id: '0xabc',
        question: 'Will it happen?',
        outcomePrices: '["0.6","0.4"]',
        volume: '300000',
        active: true,
        outcomes: '["Yes","No"]',
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// searchMarkets
// ---------------------------------------------------------------------------

describe('searchMarkets', () => {
  const client = createPolymarketClient();

  beforeEach(() => { mockFetch.mockReset(); });

  it('constructs correct Gamma URL with encoded query and limit', async () => {
    mockFetch.mockResolvedValueOnce(okJson([]));
    await client.searchMarkets('federal reserve', 5);
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('gamma-api.polymarket.com/events');
    expect(url).toContain('title_contains=federal%20reserve');
    expect(url).toContain('limit=5');
    expect(url).toContain('active=true');
    expect(url).toContain('closed=false');
  });

  it('defaults limit to 10', async () => {
    mockFetch.mockResolvedValueOnce(okJson([]));
    await client.searchMarkets('inflation');
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('limit=10');
  });

  it('returns empty array when API returns empty array', async () => {
    mockFetch.mockResolvedValueOnce(okJson([]));
    const result = await client.searchMarkets('nothing');
    expect(result).toEqual([]);
  });

  it('returns empty array when API returns non-array', async () => {
    mockFetch.mockResolvedValueOnce(okJson({}));
    const result = await client.searchMarkets('nothing');
    expect(result).toEqual([]);
  });

  it('extracts yes/no probabilities from outcomePrices JSON string', async () => {
    mockFetch.mockResolvedValueOnce(okJson([makeEvent()]));
    const [result] = await client.searchMarkets('test');
    expect(result.yesProbability).toBeCloseTo(0.6);
    expect(result.noProbability).toBeCloseTo(0.4);
    expect(result.source).toBe('polymarket');
  });

  it('uses market.volume when present, falls back to event.volume', async () => {
    mockFetch.mockResolvedValueOnce(okJson([makeEvent()]));
    const [result] = await client.searchMarkets('test');
    expect(result.volume).toBe(300000);
  });

  it('falls back to event.volume when market.volume is missing', async () => {
    const event = makeEvent();
    event.markets[0].volume = '';
    mockFetch.mockResolvedValueOnce(okJson([event]));
    const [result] = await client.searchMarkets('test');
    expect(result.volume).toBe(500000);
  });

  it('uses event.liquidity on the result', async () => {
    mockFetch.mockResolvedValueOnce(okJson([makeEvent()]));
    const [result] = await client.searchMarkets('test');
    expect(result.liquidity).toBe(200000);
  });

  it('uses market.question when present, falls back to event.title', async () => {
    mockFetch.mockResolvedValueOnce(okJson([makeEvent()]));
    const [result] = await client.searchMarkets('test');
    expect(result.question).toBe('Will it happen?');
  });

  it('falls back to event.title when market.question is empty', async () => {
    const event = makeEvent();
    event.markets[0].question = '';
    mockFetch.mockResolvedValueOnce(okJson([event]));
    const [result] = await client.searchMarkets('test');
    expect(result.question).toBe('Test Event');
  });

  it('returns one record per market across multiple events', async () => {
    const event1 = makeEvent({ id: 'e1', slug: 'e1' });
    const event2 = makeEvent({
      id: 'e2',
      slug: 'e2',
      markets: [
        {
          id: '0xdef',
          question: 'Second market?',
          outcomePrices: '["0.3","0.7"]',
          volume: '100000',
          active: true,
          outcomes: '["Yes","No"]',
        },
      ],
    });
    mockFetch.mockResolvedValueOnce(okJson([event1, event2]));
    const results = await client.searchMarkets('test');
    expect(results).toHaveLength(2);
    expect(results[1].question).toBe('Second market?');
    expect(results[1].yesProbability).toBeCloseTo(0.3);
  });

  it('skips malformed outcomePrices without throwing', async () => {
    const event = makeEvent();
    event.markets[0].outcomePrices = 'not-json';
    mockFetch.mockResolvedValueOnce(okJson([event]));
    // Should not throw; malformed market is silently skipped
    const results = await client.searchMarkets('test');
    expect(results).toHaveLength(0);
  });

  it('handles event with empty markets array', async () => {
    mockFetch.mockResolvedValueOnce(okJson([makeEvent({ markets: [] })]));
    const results = await client.searchMarkets('test');
    expect(results).toHaveLength(0);
  });

  it('throws on non-ok HTTP response', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(429));
    await expect(client.searchMarkets('test')).rejects.toThrow('Polymarket API error: 429');
  });
});

// ---------------------------------------------------------------------------
// getEvent
// ---------------------------------------------------------------------------

describe('getEvent', () => {
  const client = createPolymarketClient();

  beforeEach(() => { mockFetch.mockReset(); });

  it('builds URL with slug parameter', async () => {
    mockFetch.mockResolvedValueOnce(okJson([]));
    await client.getEvent('fed-rate-cuts-2026');
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('slug=fed-rate-cuts-2026');
    expect(url).toContain('gamma-api.polymarket.com/events');
  });

  it('returns empty array when no event found', async () => {
    mockFetch.mockResolvedValueOnce(okJson([]));
    const result = await client.getEvent('nonexistent');
    expect(result).toEqual([]);
  });

  it('maps all markets in the first event', async () => {
    const event = makeEvent({
      markets: [
        { id: '0x1', question: 'Q1?', outcomePrices: '["0.7","0.3"]', volume: '100', active: true, outcomes: '["Yes","No"]' },
        { id: '0x2', question: 'Q2?', outcomePrices: '["0.2","0.8"]', volume: '200', active: true, outcomes: '["Yes","No"]' },
      ],
    });
    mockFetch.mockResolvedValueOnce(okJson([event]));
    const results = await client.getEvent('test-event');
    expect(results).toHaveLength(2);
    expect(results[0].yesProbability).toBeCloseTo(0.7);
    expect(results[1].yesProbability).toBeCloseTo(0.2);
    expect(results[0].source).toBe('polymarket');
  });

  it('defaults to 0.5 probabilities on missing outcomePrices', async () => {
    const event = makeEvent();
    event.markets[0].outcomePrices = '';
    mockFetch.mockResolvedValueOnce(okJson([event]));
    const [result] = await client.getEvent('test-event');
    expect(result.yesProbability).toBe(0.5);
    expect(result.noProbability).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// getPriceHistory
// ---------------------------------------------------------------------------

describe('getPriceHistory', () => {
  const client = createPolymarketClient();

  beforeEach(() => { mockFetch.mockReset(); });

  it('builds CLOB prices-history URL with conditionId and interval', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ history: [] }));
    await client.getPriceHistory('0xabc123', '1w');
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('clob.polymarket.com/prices-history');
    expect(url).toContain('market=0xabc123');
    expect(url).toContain('interval=1w');
  });

  it('defaults interval to 1d', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ history: [] }));
    await client.getPriceHistory('0xabc');
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toContain('interval=1d');
  });

  it('parses history entries into { timestamp, price } records', async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({ history: [{ t: 1700000000, p: '0.52' }, { t: 1700086400, p: '0.55' }] }),
    );
    const result = await client.getPriceHistory('0xabc');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ timestamp: 1700000000, price: 0.52 });
    expect(result[1]).toEqual({ timestamp: 1700086400, price: 0.55 });
  });

  it('returns empty array when history field is absent', async () => {
    mockFetch.mockResolvedValueOnce(okJson({}));
    const result = await client.getPriceHistory('0xabc');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getMacroProbabilities — deduplication
// ---------------------------------------------------------------------------

describe('getMacroProbabilities', () => {
  const client = createPolymarketClient();

  beforeEach(() => { mockFetch.mockReset(); });

  it('deduplicates results with the same question text', async () => {
    // All 5 keyword searches return the same question "Recession 2026?"
    const duplicateEvent = makeEvent({
      markets: [
        {
          id: '0xdup',
          question: 'Recession 2026?',
          outcomePrices: '["0.4","0.6"]',
          volume: '1000000',
          active: true,
          outcomes: '["Yes","No"]',
        },
      ],
    });
    // Called 5 times (one per keyword), all return the same market
    mockFetch.mockResolvedValue(okJson([duplicateEvent]));
    const results = await client.getMacroProbabilities();
    const questions = results.map(r => r.question);
    const unique = new Set(questions);
    expect(unique.size).toBe(questions.length);
    // Only one "Recession 2026?" entry despite 5 fetches
    expect(questions.filter(q => q === 'Recession 2026?')).toHaveLength(1);
  });

  it('skips failed keyword queries and returns remaining results', async () => {
    // First call fails (recession), remaining 4 return one result each
    mockFetch
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValue(
        okJson([
          makeEvent({
            markets: [
              {
                id: '0xuniq',
                question: 'Unique question for this call',
                outcomePrices: '["0.5","0.5"]',
                volume: '50000',
                active: true,
                outcomes: '["Yes","No"]',
              },
            ],
          }),
        ]),
      );
    // Should not throw; failed queries are silently skipped
    const results = await client.getMacroProbabilities();
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns empty array when all queries fail', async () => {
    mockFetch.mockResolvedValue(errorResponse(503));
    const results = await client.getMacroProbabilities();
    expect(results).toEqual([]);
  });
});
