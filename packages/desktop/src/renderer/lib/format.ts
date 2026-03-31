/** Format a decimal as percentage: 0.08 → "8.0%" */
export function formatPct(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Parse percentage input back to decimal: "8" → 0.08, "8%" → 0.08 */
export function parsePctInput(input: string): number {
  const cleaned = input.replace('%', '').trim();
  return parseFloat(cleaned) / 100;
}

/** Format large numbers with abbreviation: 100000000 → "100.0M" */
export function formatNumber(value: number): string {
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

/** Format a ratio for display: 4.5 → "4.5x" */
export function formatMultiple(value: number): string {
  return `${value.toFixed(1)}x`;
}
