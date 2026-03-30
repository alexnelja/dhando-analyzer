export const DistressComponent = {
  CAUSE: 'cause',
  INDUSTRY: 'industry',
  BALANCE_SHEET: 'balance_sheet',
  MANAGEMENT: 'management',
  COMPETITION: 'competition',
  REVENUE_BASE: 'revenue_base',
  ASSET_VALUE: 'asset_value',
} as const;
export type DistressComponent = (typeof DistressComponent)[keyof typeof DistressComponent];

export const DistressClassification = {
  TEMPORARY: 'temporary',
  UNCERTAIN: 'uncertain',
  PERMANENT: 'permanent',
} as const;
export type DistressClassification = (typeof DistressClassification)[keyof typeof DistressClassification];

export interface DistressComponentScore {
  id: string;
  investmentId: string;
  component: DistressComponent;
  factorScore: number;
  calculatedAt: Date;
}

export interface DistressSummary {
  id: string;
  investmentId: string;
  compositeScore: number;
  permanenceScore: number;
  classification: DistressClassification;
  calculatedAt: Date;
}
