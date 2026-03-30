export const ScenarioCase = {
  BEAR: 'bear',
  BASE: 'base',
  BULL: 'bull',
} as const;
export type ScenarioCase = (typeof ScenarioCase)[keyof typeof ScenarioCase];

export interface Scenario {
  id: string;
  investmentId: string;
  case: ScenarioCase;
  revenueGrowth: number;
  margin: number;
  multiple: number;
  probabilityWeight: number;
  targetPrice: number;
  expectedValue: number;
}
