export const CURRENCY = 'ZAR';
export const CURRENCY_SYMBOL = 'R';
export const CURRENCY_LOCALE = 'en-ZA';

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `R ${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `R ${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `R ${(value / 1_000).toFixed(1)}K`;
  return formatCurrency(value);
}
