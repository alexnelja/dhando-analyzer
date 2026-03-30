export interface SuperInvestorPosition {
  id: string;
  investorName: string;
  ticker: string;
  action: 'buy' | 'sell' | 'hold';
  quarter: string;
  shares: number;
  value: number;
}
