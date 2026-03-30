export interface FundamentalsData {
  revenue?: number;
  netIncome?: number;
  ebitda?: number;
  totalAssets?: number;
  totalDebt?: number;
  cash?: number;
  capex?: number;
  fcf?: number;
  workingCapital?: number;
  [key: string]: unknown;
}

export interface PriceData {
  price: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  date: string;
}

export interface DataProvider {
  name: string;
  getFundamentals(ticker: string): Promise<FundamentalsData>;
  getPrice(ticker: string): Promise<PriceData>;
}

export interface FailoverPolicy {
  maxStalenessHours: number;
  fallbackChain: DataProvider[];
  onPartialFailure: 'serve_partial' | 'fail_hard' | 'use_cache';
  cacheBehavior: 'prefer_fresh' | 'prefer_available';
}

export interface ProviderResult<T> {
  data: T;
  source: string;
  fetchedAt: Date;
  staleWarning: boolean;
}
