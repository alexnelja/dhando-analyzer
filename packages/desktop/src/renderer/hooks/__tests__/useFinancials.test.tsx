// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useFinancials } from '../useFinancials.js';
import type { Financial } from '@dhando/core';

const row = (year: number): Partial<Financial> => ({
  id: `inv1-annual-${year}-A`,
  investmentId: 'inv1',
  source: 'api',
  period: 'annual',
  year,
  quarter: null,
  revenue: 1000,
});

let changedCallback: ((id: string) => void) | null = null;

beforeEach(() => {
  changedCallback = null;
  (window as any).dhando = {
    financials: {
      get: vi.fn(async (_id: string) => [row(2025), row(2024)]),
      onChanged: vi.fn((cb: (id: string) => void) => {
        changedCallback = cb;
        return () => {
          changedCallback = null;
        };
      }),
    },
  };
});

describe('useFinancials', () => {
  it('fetches on mount and derives loaded/missing state', async () => {
    const { result } = renderHook(() => useFinancials('inv1'));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect((window as any).dhando.financials.get).toHaveBeenCalledWith('inv1');
    expect(result.current.current?.year).toBe(2025);
  });

  it('does not fetch when investmentId is null', async () => {
    const { result } = renderHook(() => useFinancials(null));
    await waitFor(() => expect(result.current.status).toBe('missing'));
    expect((window as any).dhando.financials.get).not.toHaveBeenCalled();
  });

  it('re-fetches when a matching changed event fires', async () => {
    const getMock = (window as any).dhando.financials.get;
    const { result } = renderHook(() => useFinancials('inv1'));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(getMock).toHaveBeenCalledTimes(1);

    getMock.mockResolvedValueOnce([row(2025)]);
    await act(async () => {
      changedCallback?.('inv1');
    });
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
  });

  it('ignores changed events for other investments', async () => {
    const getMock = (window as any).dhando.financials.get;
    renderHook(() => useFinancials('inv1'));
    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      changedCallback?.('some-other-id');
    });
    // Give any erroneous refetch a chance to fire.
    await new Promise((r) => setTimeout(r, 20));
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});
