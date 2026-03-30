export interface Financial {
  id: string;
  investmentId: string;
  source: 'api' | 'manual';
  period: 'annual' | 'quarterly';
  year: number;
  quarter: number | null;
  revenue: number | null;
  netIncome: number | null;
  ebitda: number | null;
  totalAssets: number | null;
  totalDebt: number | null;
  cash: number | null;
  capex: number | null;
  fcf: number | null;
  workingCapital: number | null;
  autoUpdated: boolean;
  lastRefresh: Date | null;
  apiSource: string | null;
}
