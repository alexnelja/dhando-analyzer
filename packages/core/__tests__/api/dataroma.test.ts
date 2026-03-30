import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDataromaClient } from '../../src/api/dataroma.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Dataroma client', () => {
  const client = createDataromaClient();

  beforeEach(() => { mockFetch.mockReset(); });

  it('parses super investor positions from HTML', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(
        '<table><tr><td>Stock A</td><td><a href="#">GOOGL</a></td></tr><tr><td>Stock B</td><td><a href="#">BABA</a></td></tr></table>'
      ),
    });
    const positions = await client.getPositions('mohnish-pabrai');
    expect(positions.length).toBe(2);
    expect(positions[0].investorName).toBe('mohnish-pabrai');
    expect(positions[0].ticker).toBe('GOOGL');
  });

  it('returns convergence signals when >= threshold investors hold same stock', () => {
    const positions = [
      { investorName: 'pabrai', ticker: 'GOOGL', action: 'buy' as const, quarter: '2026-Q1', shares: 100, value: 1000 },
      { investorName: 'klarman', ticker: 'GOOGL', action: 'buy' as const, quarter: '2026-Q1', shares: 200, value: 2000 },
      { investorName: 'burry', ticker: 'GOOGL', action: 'buy' as const, quarter: '2026-Q1', shares: 50, value: 500 },
      { investorName: 'pabrai', ticker: 'BABA', action: 'buy' as const, quarter: '2026-Q1', shares: 500, value: 4000 },
    ];
    const convergence = client.findConvergence(positions, 3);
    expect(convergence.length).toBe(1);
    expect(convergence[0].ticker).toBe('GOOGL');
    expect(convergence[0].convergenceSignal).toBe(true);
  });

  it('returns empty when no convergence', () => {
    const positions = [
      { investorName: 'pabrai', ticker: 'GOOGL', action: 'hold' as const, quarter: '2026-Q1', shares: 100, value: 1000 },
      { investorName: 'klarman', ticker: 'BABA', action: 'hold' as const, quarter: '2026-Q1', shares: 200, value: 2000 },
    ];
    const convergence = client.findConvergence(positions, 3);
    expect(convergence.length).toBe(0);
  });
});
