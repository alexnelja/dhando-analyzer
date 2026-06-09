/**
 * `useFinancials` — the single subscription point every page uses to read the
 * shared financial data store.
 *
 * It fetches an investment's statements over IPC, recomputes a derived
 * completeness state, and re-fetches automatically whenever any window writes
 * to the store (via the `dhando:financials:changed` broadcast).
 */

import { useCallback, useEffect, useState } from 'react';
// Deep-import the pure scoring adapters: the package root pulls in the
// fs-using rules-engine, which is not browser/renderer-safe. The scoring
// module is dependency-free.
import {
  calculateAltmanZFromFinancials,
  calculatePiotroskiFFromFinancials,
  calculateBeneishMFromFinancials,
} from '@dhando/core/dist/scoring/index.js';
import type { Financial } from '@dhando/core';
import { getFinancials, onFinancialsChanged } from '../lib/ipc';

/** Whether the store has enough data to compute all distress scores. */
export type FinancialsStatus = 'missing' | 'incomplete' | 'loaded';

export interface FinancialsState {
  current: Financial | null;
  prior: Financial | null;
  status: FinancialsStatus;
  /** Statement fields still required before scores can compute. */
  missingFields: string[];
}

// Sentinel market cap so the Altman adapter only reports missing *statement*
// fields here — market cap is an investment-level concern, not a statement one.
const MARKET_CAP_SENTINEL = 1;

/**
 * Derive completeness state from the rows returned by the store.
 *
 * `loaded` means all three distress scores (Altman, Piotroski, Beneish) can be
 * computed; otherwise `missingFields` lists the offending `current.*`/`prior.*`
 * statement fields. Pure — no React, no IO — so it is unit-testable directly.
 */
export function computeFinancialsState(rows: Financial[]): FinancialsState {
  const current = rows[0] ?? null;
  const prior = rows[1] ?? null;

  if (!current) {
    return { current: null, prior: null, status: 'missing', missingFields: [] };
  }

  const results = [
    calculateAltmanZFromFinancials(current, { marketCap: MARKET_CAP_SENTINEL }),
    calculatePiotroskiFFromFinancials(current, prior),
    calculateBeneishMFromFinancials(current, prior),
  ];

  const missingFields = Array.from(
    new Set(
      results.flatMap((r) =>
        'status' in r && r.status === 'insufficient' ? r.missingFields : [],
      ),
    ),
  );

  return {
    current,
    prior,
    status: missingFields.length === 0 ? 'loaded' : 'incomplete',
    missingFields,
  };
}

export interface UseFinancialsResult extends FinancialsState {
  /** All stored rows, newest period first. */
  rows: Financial[];
  /** Re-fetch from the store on demand. */
  refetch: () => Promise<void>;
}

/**
 * Subscribe a component to an investment's financials.
 *
 * @param investmentId - The investment to load; `null`/empty clears the state.
 */
export function useFinancials(investmentId: string | null | undefined): UseFinancialsResult {
  const [rows, setRows] = useState<Financial[]>([]);

  const refetch = useCallback(async () => {
    if (!investmentId) {
      setRows([]);
      return;
    }
    setRows(await getFinancials(investmentId));
  }, [investmentId]);

  useEffect(() => {
    void refetch();
    const unsubscribe = onFinancialsChanged((changedId) => {
      if (changedId === investmentId) void refetch();
    });
    return unsubscribe;
  }, [investmentId, refetch]);

  return { ...computeFinancialsState(rows), rows, refetch };
}
