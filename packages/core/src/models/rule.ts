export const RuleType = {
  HARD_GATE: 'hard_gate',
  SOFT_GATE: 'soft_gate',
  SCORING: 'scoring',
} as const;
export type RuleType = (typeof RuleType)[keyof typeof RuleType];

export const RuleSourceType = {
  BOOK: 'book',
  MEETING: 'meeting',
  MISTAKE: 'mistake',
  EXPERT: 'expert',
} as const;
export type RuleSourceType = (typeof RuleSourceType)[keyof typeof RuleSourceType];

export const RuleCategory = {
  VALUATION: 'valuation',
  RISK: 'risk',
  QUALITY: 'quality',
  BEHAVIOUR: 'behaviour',
  POSITION_SIZING: 'position_sizing',
  DISTRESS: 'distress',
  EM_PRIVATE: 'em_private',
} as const;
export type RuleCategory = (typeof RuleCategory)[keyof typeof RuleCategory];

export interface RuleCondition {
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'between';
  value: number | [number, number];
  weight: number;
}

export interface Rule {
  id: string;
  name: string;
  version: number;
  category: RuleCategory;
  type: RuleType;
  sourceType: RuleSourceType;
  sourceDetail: string;
  description: string;
  conditions: RuleCondition[];
  weight: number;
  active: boolean;
  activeFrom: Date;
  activeTo: Date | null;
  createdAt: Date;
  timesFired: number;
  timesCorrect: number;
  believabilityScore: number;
}

export interface RuleAuditEntry {
  id: string;
  investmentId: string;
  ruleId: string;
  ruleVersion: number;
  firedAt: Date;
  result: 'pass' | 'fail' | 'warn';
  override: boolean;
  overrideReason: string | null;
}
