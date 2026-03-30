import { describe, it, expect, vi } from 'vitest';
import { createProvider } from '../../src/api/provider.js';
import type { DataProvider, FailoverPolicy } from '../../src/api/types.js';

describe('DataProvider failover', () => {
  it('returns data from primary source', async () => {
    const primary: DataProvider = {
      name: 'primary',
      getFundamentals: vi.fn().mockResolvedValue({ revenue: 1000 }),
      getPrice: vi.fn().mockResolvedValue({ price: 50, date: '2026-03-28' }),
    };
    const fallback: DataProvider = {
      name: 'fallback',
      getFundamentals: vi.fn().mockResolvedValue({ revenue: 999 }),
      getPrice: vi.fn().mockResolvedValue({ price: 49, date: '2026-03-28' }),
    };

    const policy: FailoverPolicy = {
      maxStalenessHours: 72,
      fallbackChain: [primary, fallback],
      onPartialFailure: 'serve_partial',
      cacheBehavior: 'prefer_fresh',
    };

    const provider = createProvider(policy);
    const result = await provider.getFundamentals('CPI.JSE');
    expect(result.data).toEqual({ revenue: 1000 });
    expect(result.source).toBe('primary');
    expect(primary.getFundamentals).toHaveBeenCalledWith('CPI.JSE');
    expect(fallback.getFundamentals).not.toHaveBeenCalled();
  });

  it('falls back when primary fails', async () => {
    const primary: DataProvider = {
      name: 'primary',
      getFundamentals: vi.fn().mockRejectedValue(new Error('API timeout')),
      getPrice: vi.fn(),
    };
    const fallback: DataProvider = {
      name: 'fallback',
      getFundamentals: vi.fn().mockResolvedValue({ revenue: 999 }),
      getPrice: vi.fn(),
    };

    const policy: FailoverPolicy = {
      maxStalenessHours: 72,
      fallbackChain: [primary, fallback],
      onPartialFailure: 'serve_partial',
      cacheBehavior: 'prefer_fresh',
    };

    const provider = createProvider(policy);
    const result = await provider.getFundamentals('CPI.JSE');
    expect(result.data).toEqual({ revenue: 999 });
    expect(result.source).toBe('fallback');
  });

  it('throws when all providers fail', async () => {
    const primary: DataProvider = {
      name: 'primary',
      getFundamentals: vi.fn().mockRejectedValue(new Error('fail')),
      getPrice: vi.fn(),
    };

    const policy: FailoverPolicy = {
      maxStalenessHours: 72,
      fallbackChain: [primary],
      onPartialFailure: 'fail_hard',
      cacheBehavior: 'prefer_fresh',
    };

    const provider = createProvider(policy);
    await expect(provider.getFundamentals('CPI.JSE')).rejects.toThrow(
      'All data providers failed for CPI.JSE'
    );
  });
});
