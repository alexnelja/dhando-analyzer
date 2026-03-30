export const JournalEntryType = {
  PRE_INVESTMENT: 'pre_investment',
  PRE_MORTEM: 'pre_mortem',
  QUARTERLY_REVIEW: 'quarterly_review',
  POSITION_EXIT: 'position_exit',
  POST_MORTEM: 'post_mortem',
} as const;
export type JournalEntryType = (typeof JournalEntryType)[keyof typeof JournalEntryType];

export interface JournalEntry {
  id: string;
  investmentId: string;
  entryType: JournalEntryType;
  thesis: string | null;
  confidence: number | null;
  keyAssumptions: Record<string, unknown>;
  predictedProbability: number | null;
  actualOutcome: number | null;
  brierScore: number | null;
  lessons: string | null;
  createdAt: Date;
}
