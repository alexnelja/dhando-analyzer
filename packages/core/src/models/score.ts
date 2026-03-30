export const ScoreType = {
  ALTMAN_Z: 'altman_z',
  PIOTROSKI_F: 'piotroski_f',
  BENEISH_M: 'beneish_m',
  COMPOSITE_DISTRESS: 'composite_distress',
  DHANDHO_FIT: 'dhandho_fit',
  MOAT: 'moat',
  MANAGEMENT: 'management',
  KELLY: 'kelly',
  COMPOSITE: 'composite',
} as const;
export type ScoreType = (typeof ScoreType)[keyof typeof ScoreType];

export interface Score {
  id: string;
  investmentId: string;
  scoreType: ScoreType;
  value: number;
  calculatedAt: Date;
  inputsJson: Record<string, unknown>;
  financialsVersionId: string | null;
  dataStalenessHours: number;
  staleWarning: boolean;
}
