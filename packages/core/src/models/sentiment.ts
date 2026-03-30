export interface Sentiment {
  id: string;
  investmentId: string;
  source: 'eodhd' | 'gdelt' | 'manual';
  headline: string;
  score: number;
  confidence: number;
  date: Date;
}
