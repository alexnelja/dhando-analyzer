import { describe, it, expect } from 'vitest';
import {
  generateRebalanceSignals,
  type RebalanceInput,
  type RebalanceSignal,
} from '../../src/portfolio/kelly-rebalance.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Overweight by 12pp — high urgency trim. */
const OVERWEIGHT_HIGH: RebalanceInput = {
  investmentId: 'inv-001',
  name: 'Berkshire Hathaway',
  currentWeight: 0.22,
  kellyOptimal: 0.10,
};

/** Overweight by 7pp — medium urgency trim. */
const OVERWEIGHT_MEDIUM: RebalanceInput = {
  investmentId: 'inv-002',
  name: 'Apple',
  currentWeight: 0.17,
  kellyOptimal: 0.10,
};

/** Underweight by 11pp — high urgency add. */
const UNDERWEIGHT_HIGH: RebalanceInput = {
  investmentId: 'inv-003',
  name: 'Alphabet',
  currentWeight: 0.04,
  kellyOptimal: 0.15,
};

/** Underweight by 6pp — medium urgency add. */
const UNDERWEIGHT_MEDIUM: RebalanceInput = {
  investmentId: 'inv-004',
  name: 'Microsoft',
  currentWeight: 0.09,
  kellyOptimal: 0.15,
};

/** Within default 5pp tolerance — no action. */
const WITHIN_TOLERANCE: RebalanceInput = {
  investmentId: 'inv-005',
  name: 'Meta',
  currentWeight: 0.12,
  kellyOptimal: 0.10, // drift = +0.02 < 0.05
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateRebalanceSignals', () => {
  describe('overweight position', () => {
    it('action is trim for overweight position', () => {
      const [signal] = generateRebalanceSignals([OVERWEIGHT_HIGH]);
      expect(signal.action).toBe('trim');
    });

    it('drift is positive for overweight', () => {
      const [signal] = generateRebalanceSignals([OVERWEIGHT_HIGH]);
      expect(signal.drift).toBeCloseTo(0.12, 10);
    });

    it('urgency is high when drift > 10pp', () => {
      const [signal] = generateRebalanceSignals([OVERWEIGHT_HIGH]);
      expect(signal.urgency).toBe('high');
    });

    it('urgency is medium when drift is 5–10pp', () => {
      const [signal] = generateRebalanceSignals([OVERWEIGHT_MEDIUM]);
      expect(signal.urgency).toBe('medium');
    });

    it('message uses "Trim" and includes pp amount and "(overweight)"', () => {
      const [signal] = generateRebalanceSignals([OVERWEIGHT_HIGH]);
      expect(signal.message).toMatch(/^Trim Berkshire Hathaway/);
      expect(signal.message).toMatch(/12\.0pp/);
      expect(signal.message).toMatch(/\(overweight\)/);
    });

    it('passes optimalWeight through correctly', () => {
      const [signal] = generateRebalanceSignals([OVERWEIGHT_HIGH]);
      expect(signal.optimalWeight).toBe(0.10);
    });
  });

  describe('underweight position', () => {
    it('action is add for underweight position', () => {
      const [signal] = generateRebalanceSignals([UNDERWEIGHT_HIGH]);
      expect(signal.action).toBe('add');
    });

    it('drift is negative for underweight', () => {
      const [signal] = generateRebalanceSignals([UNDERWEIGHT_HIGH]);
      expect(signal.drift).toBeCloseTo(-0.11, 10);
    });

    it('urgency is high when |drift| > 10pp', () => {
      const [signal] = generateRebalanceSignals([UNDERWEIGHT_HIGH]);
      expect(signal.urgency).toBe('high');
    });

    it('urgency is medium when |drift| is 5–10pp', () => {
      const [signal] = generateRebalanceSignals([UNDERWEIGHT_MEDIUM]);
      expect(signal.urgency).toBe('medium');
    });

    it('message uses "Add to" and includes pp amount and "(underweight)"', () => {
      const [signal] = generateRebalanceSignals([UNDERWEIGHT_HIGH]);
      expect(signal.message).toMatch(/^Add to Alphabet/);
      expect(signal.message).toMatch(/11\.0pp/);
      expect(signal.message).toMatch(/\(underweight\)/);
    });
  });

  describe('within tolerance', () => {
    it('action is none', () => {
      const [signal] = generateRebalanceSignals([WITHIN_TOLERANCE]);
      expect(signal.action).toBe('none');
    });

    it('urgency is low', () => {
      const [signal] = generateRebalanceSignals([WITHIN_TOLERANCE]);
      expect(signal.urgency).toBe('low');
    });

    it('message says "within tolerance"', () => {
      const [signal] = generateRebalanceSignals([WITHIN_TOLERANCE]);
      expect(signal.message).toContain('within tolerance');
      expect(signal.message).toContain('Meta');
    });
  });

  describe('multiple positions with mixed signals', () => {
    const positions: RebalanceInput[] = [
      OVERWEIGHT_HIGH,
      UNDERWEIGHT_MEDIUM,
      WITHIN_TOLERANCE,
    ];

    it('returns one signal per position', () => {
      const signals = generateRebalanceSignals(positions);
      expect(signals).toHaveLength(3);
    });

    it('preserves input order', () => {
      const signals = generateRebalanceSignals(positions);
      expect(signals[0].investmentId).toBe('inv-001');
      expect(signals[1].investmentId).toBe('inv-004');
      expect(signals[2].investmentId).toBe('inv-005');
    });

    it('each signal has correct action', () => {
      const signals = generateRebalanceSignals(positions);
      expect(signals[0].action).toBe('trim');
      expect(signals[1].action).toBe('add');
      expect(signals[2].action).toBe('none');
    });
  });

  describe('custom drift threshold', () => {
    it('position outside default threshold but within custom threshold is none', () => {
      // drift = 0.07 (outside default 0.05, but within custom 0.10)
      const input: RebalanceInput = {
        investmentId: 'inv-006',
        name: 'Tesla',
        currentWeight: 0.17,
        kellyOptimal: 0.10,
      };
      const [signal] = generateRebalanceSignals([input], 0.10);
      expect(signal.action).toBe('none');
      expect(signal.urgency).toBe('low');
    });

    it('small custom threshold triggers signal on small drift', () => {
      const input: RebalanceInput = {
        investmentId: 'inv-007',
        name: 'Nvidia',
        currentWeight: 0.12,
        kellyOptimal: 0.10, // drift = 0.02
      };
      const [signal] = generateRebalanceSignals([input], 0.01);
      expect(signal.action).toBe('trim');
    });
  });

  describe('signal fields are populated correctly', () => {
    it('includes investmentId and name', () => {
      const [signal] = generateRebalanceSignals([OVERWEIGHT_HIGH]);
      expect(signal.investmentId).toBe('inv-001');
      expect(signal.name).toBe('Berkshire Hathaway');
    });

    it('includes currentWeight', () => {
      const [signal] = generateRebalanceSignals([OVERWEIGHT_HIGH]);
      expect(signal.currentWeight).toBe(0.22);
    });
  });
});
