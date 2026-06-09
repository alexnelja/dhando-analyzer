/**
 * Shared result type for the `*FromFinancials` scoring adapters.
 *
 * When a `Financial` row (or pair of rows) is missing data required to compute
 * a score, the adapter returns this instead of throwing, so the UI can list the
 * exact fields the user still needs to fill in.
 */
export interface InsufficientResult {
  status: 'insufficient';
  /** camelCase names of the fields that were null/absent. */
  missingFields: string[];
}

/** Collect the names of fields whose value is null or undefined. */
export function collectMissing(fields: Record<string, number | null | undefined>): string[] {
  return Object.entries(fields)
    .filter(([, v]) => v === null || v === undefined)
    .map(([k]) => k);
}
