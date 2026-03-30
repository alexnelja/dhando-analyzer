import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGdeltClient } from '../../src/api/gdelt.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GDELT client', () => {
  const client = createGdeltClient();

  beforeEach(() => { mockFetch.mockReset(); });

  it('queries events matching a pattern', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        articles: [
          { title: 'BRICS nations discuss dedollarization', url: 'https://example.com/1', seendate: '20260329', domain: 'reuters.com', tone: -2.5 },
          { title: 'SA supports BRICS currency discussions', url: 'https://example.com/2', seendate: '20260328', domain: 'bloomberg.com', tone: -1.2 },
        ],
      }),
    });
    const events = await client.queryEvents('BRICS dedollar', 7);
    expect(events.length).toBe(2);
    expect(events[0].title).toContain('BRICS');
    expect(events[0].tone).toBe(-2.5);
  });

  it('counts mentions for threshold detection', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        articles: Array(60).fill({ title: 'Load shedding continues', seendate: '20260329', tone: -3.0 }),
      }),
    });
    const count = await client.countMentions('load shedding South Africa', 30);
    expect(count).toBe(60);
  });

  it('handles empty results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    const events = await client.queryEvents('nonexistent topic', 7);
    expect(events.length).toBe(0);
  });
});
