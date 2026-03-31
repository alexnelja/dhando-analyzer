import { describe, it, expect } from 'vitest';
import {
  generatePostMortem,
  type PostMortemInput,
} from '../../src/portfolio/post-mortem.js';

/** Minimal valid base input used across tests. */
const BASE_INPUT: PostMortemInput = {
  name: 'Test Co',
  originalThesis: 'Dominant moat in a growing market with cheap valuation',
  predictedProbability: 0.75,
  actualOutcome: 1,
  entryPrice: 100,
  exitPrice: 150,
  holdingPeriodDays: 365,
  moatScoreAtEntry: 4,
  moatScoreAtExit: 4,
  keyAssumptions: { revenueGrowth: '10%', multiple: 15 },
};

describe('generatePostMortem', () => {
  // ---------------------------------------------------------------------------
  // Return calculation
  // ---------------------------------------------------------------------------

  it('calculates return percentage correctly for a gain', () => {
    const result = generatePostMortem({ ...BASE_INPUT, entryPrice: 100, exitPrice: 150 });
    expect(result.returnPct).toBeCloseTo(0.5, 5);
  });

  it('calculates return percentage correctly for a loss', () => {
    const result = generatePostMortem({ ...BASE_INPUT, entryPrice: 200, exitPrice: 100 });
    expect(result.returnPct).toBeCloseTo(-0.5, 5);
  });

  it('passes through holdingPeriodDays unchanged', () => {
    const result = generatePostMortem({ ...BASE_INPUT, holdingPeriodDays: 730 });
    expect(result.holdingPeriodDays).toBe(730);
  });

  // ---------------------------------------------------------------------------
  // Brier contribution
  // ---------------------------------------------------------------------------

  it('computes Brier contribution = (predicted - actual)^2', () => {
    const result = generatePostMortem({
      ...BASE_INPUT,
      predictedProbability: 0.8,
      actualOutcome: 1,
    });
    // (0.8 - 1)^2 = 0.04
    expect(result.brierContribution).toBeCloseTo(0.04, 5);
  });

  it('Brier contribution = 0 for perfect prediction', () => {
    const result = generatePostMortem({
      ...BASE_INPUT,
      predictedProbability: 1,
      actualOutcome: 1,
    });
    expect(result.brierContribution).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Tetlock quadrants
  // ---------------------------------------------------------------------------

  it('quadrant: Good Process + Good Outcome', () => {
    // |0.75 - 1| = 0.25 < 0.3 → good process; returnPct > 0 → good outcome
    const result = generatePostMortem({
      ...BASE_INPUT,
      predictedProbability: 0.75,
      actualOutcome: 1,
      entryPrice: 100,
      exitPrice: 120,
    });

    expect(result.processQuality).toBe('good');
    expect(result.outcomeQuality).toBe('good');
    expect(result.quadrant).toBe('Good Process, Good Outcome');
    expect(result.lessons).toContain('Skill confirmed');
  });

  it('quadrant: Good Process + Poor Outcome', () => {
    // |0.75 - 1| = 0.25 < 0.3 → good process; returnPct < 0 → poor outcome
    const result = generatePostMortem({
      ...BASE_INPUT,
      predictedProbability: 0.75,
      actualOutcome: 1,
      entryPrice: 100,
      exitPrice: 80,
    });

    expect(result.processQuality).toBe('good');
    expect(result.outcomeQuality).toBe('poor');
    expect(result.quadrant).toBe('Good Process, Poor Outcome');
    expect(result.lessons).toContain('Bad luck');
  });

  it('quadrant: Poor Process + Good Outcome', () => {
    // |0.1 - 1| = 0.9 >= 0.3 → poor process; returnPct > 0 → good outcome
    const result = generatePostMortem({
      ...BASE_INPUT,
      predictedProbability: 0.1,
      actualOutcome: 1,
      entryPrice: 100,
      exitPrice: 150,
    });

    expect(result.processQuality).toBe('poor');
    expect(result.outcomeQuality).toBe('good');
    expect(result.quadrant).toBe('Poor Process, Good Outcome');
    expect(result.lessons).toContain('Got lucky');
  });

  it('quadrant: Poor Process + Poor Outcome', () => {
    // |0.9 - 0| = 0.9 >= 0.3 → poor process; returnPct < 0 → poor outcome
    const result = generatePostMortem({
      ...BASE_INPUT,
      predictedProbability: 0.9,
      actualOutcome: 0,
      entryPrice: 100,
      exitPrice: 50,
    });

    expect(result.processQuality).toBe('poor');
    expect(result.outcomeQuality).toBe('poor');
    expect(result.quadrant).toBe('Poor Process, Poor Outcome');
    expect(result.lessons).toContain('Double failure');
  });

  // ---------------------------------------------------------------------------
  // Thesis review
  // ---------------------------------------------------------------------------

  it('thesis review includes the original thesis and win label', () => {
    const result = generatePostMortem({ ...BASE_INPUT, actualOutcome: 1 });
    expect(result.thesisReview).toContain(BASE_INPUT.originalThesis);
    expect(result.thesisReview).toContain('win');
  });

  it('thesis review uses loss label for actualOutcome = 0', () => {
    const result = generatePostMortem({
      ...BASE_INPUT,
      actualOutcome: 0,
      predictedProbability: 0.8,
      entryPrice: 100,
      exitPrice: 100, // flat — not a positive return
    });
    expect(result.thesisReview).toContain('loss');
  });

  // ---------------------------------------------------------------------------
  // Moat change detection
  // ---------------------------------------------------------------------------

  it('moat change reflects no change when scores are equal', () => {
    const result = generatePostMortem({
      ...BASE_INPUT,
      moatScoreAtEntry: 3,
      moatScoreAtExit: 3,
    });
    expect(result.moatChange).toBe('Moat score changed from 3 to 3');
  });

  it('moat change reflects improvement', () => {
    const result = generatePostMortem({
      ...BASE_INPUT,
      moatScoreAtEntry: 3,
      moatScoreAtExit: 5,
    });
    expect(result.moatChange).toBe('Moat score changed from 3 to 5');
  });

  it('moat change reflects deterioration', () => {
    const result = generatePostMortem({
      ...BASE_INPUT,
      moatScoreAtEntry: 4,
      moatScoreAtExit: 2,
    });
    expect(result.moatChange).toBe('Moat score changed from 4 to 2');
  });

  // ---------------------------------------------------------------------------
  // Edge: exactly at calibration boundary
  // ---------------------------------------------------------------------------

  it('process is poor when |predicted - actual| equals the threshold (0.3)', () => {
    // |0.7 - 1| = 0.3, not strictly < 0.3 → poor process
    const result = generatePostMortem({
      ...BASE_INPUT,
      predictedProbability: 0.7,
      actualOutcome: 1,
      entryPrice: 100,
      exitPrice: 110,
    });
    expect(result.processQuality).toBe('poor');
  });

  // ---------------------------------------------------------------------------
  // Name is passed through
  // ---------------------------------------------------------------------------

  it('passes name through to result', () => {
    const result = generatePostMortem({ ...BASE_INPUT, name: 'Acme Corp' });
    expect(result.name).toBe('Acme Corp');
  });
});
