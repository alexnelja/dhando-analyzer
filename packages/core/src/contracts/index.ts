import type { Investment } from '../models/investment.js';
import type { Score } from '../models/score.js';
import type { Scenario } from '../models/scenario.js';
import type { DistressSummary, DistressComponentScore } from '../models/distress.js';
import type { JournalEntry } from '../models/journal.js';

export interface ScreenerOutput {
  investments: Investment[];
  scores: Score[];
  superInvestorOverlap: {
    ticker: string;
    investors: string[];
    convergenceSignal: boolean;
  }[];
}

export interface DealAnalysis {
  investment: Investment;
  scores: Score[];
  scenarios: Scenario[];
  kellyPosition: number;
  expectedValue: number;
  marginOfSafety: number;
  intrinsicValue: number;
  premortemScenarios: string[];
  memoThesis: string;
}

export interface DistressAlert {
  investment: Investment;
  distressSummary: DistressSummary;
  components: DistressComponentScore[];
  sentimentTrend: { date: string; score: number }[];
  geopoliticalFactors: string[];
  recoveryProbability: number;
}

export interface PortfolioPosition {
  investment: Investment;
  currentPrice: number;
  costBasis: number;
  returnPct: number;
  kellyOptimal: number;
  currentWeight: number;
  driftFromOptimal: number;
  trafficLight: 'green' | 'amber' | 'red';
  factors: { name: string; status: 'green' | 'amber' | 'red'; value: number }[];
  marginOfSafetyRemaining: number;
  journal: JournalEntry[];
}

export interface DhandhoFitResult {
  principleScores: {
    principle: string;
    score: number;
    weight: number;
    weighted: number;
  }[];
  totalScore: number;
  passesGate: boolean;
}
