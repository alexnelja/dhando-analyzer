import { describe, it, expect } from 'vitest';
import { classifyDistress, type DistressFactors } from '../../src/distress/classification.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** All zeros → every factor signals temporary / recovery. */
const ALL_ZERO: DistressFactors = {
  cause: 0,
  industry: 0,
  balanceSheet: 0,
  management: 0,
  competition: 0,
  revenueBase: 0,
  assetValue: 0,
};

/** All tens → every factor signals permanent impairment. */
const ALL_TEN: DistressFactors = {
  cause: 10,
  industry: 10,
  balanceSheet: 10,
  management: 10,
  competition: 10,
  revenueBase: 10,
  assetValue: 10,
};

/** Balanced midpoint factors — all at 5.0 → permanenceScore = 5.0 */
const ALL_FIVE: DistressFactors = {
  cause: 5,
  industry: 5,
  balanceSheet: 5,
  management: 5,
  competition: 5,
  revenueBase: 5,
  assetValue: 5,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('classifyDistress', () => {
  describe('boundary classifications', () => {
    it('all-zero factors → temporary classification', () => {
      const result = classifyDistress(ALL_ZERO);
      expect(result.classification).toBe('temporary');
      expect(result.permanenceScore).toBe(0);
    });

    it('all-ten factors → permanent classification', () => {
      const result = classifyDistress(ALL_TEN);
      expect(result.classification).toBe('permanent');
      expect(result.permanenceScore).toBe(10);
    });

    it('all-five factors → uncertain classification', () => {
      const result = classifyDistress(ALL_FIVE);
      expect(result.classification).toBe('uncertain');
      expect(result.permanenceScore).toBeCloseTo(5.0, 5);
    });
  });

  describe('classification thresholds', () => {
    it('permanence score just below 3.5 → temporary', () => {
      // Construct factors that produce permanenceScore just under 3.5.
      // All factors at ~3.4: 3.4 * (0.20+0.15+0.20+0.15+0.10+0.10+0.10) = 3.4 * 1.0 = 3.4
      const factors: DistressFactors = {
        cause: 3.4,
        industry: 3.4,
        balanceSheet: 3.4,
        management: 3.4,
        competition: 3.4,
        revenueBase: 3.4,
        assetValue: 3.4,
      };
      const result = classifyDistress(factors);
      expect(result.classification).toBe('temporary');
      expect(result.permanenceScore).toBeLessThan(3.5);
    });

    it('permanence score just above 3.5 → uncertain', () => {
      const factors: DistressFactors = {
        cause: 3.6,
        industry: 3.6,
        balanceSheet: 3.6,
        management: 3.6,
        competition: 3.6,
        revenueBase: 3.6,
        assetValue: 3.6,
      };
      const result = classifyDistress(factors);
      expect(result.classification).toBe('uncertain');
      expect(result.permanenceScore).toBeGreaterThan(3.5);
    });

    it('permanence score exactly at 3.5 → uncertain', () => {
      const factors: DistressFactors = {
        cause: 3.5,
        industry: 3.5,
        balanceSheet: 3.5,
        management: 3.5,
        competition: 3.5,
        revenueBase: 3.5,
        assetValue: 3.5,
      };
      const result = classifyDistress(factors);
      expect(result.classification).toBe('uncertain');
      expect(result.permanenceScore).toBeCloseTo(3.5, 3);
    });

    it('permanence score just below 6.5 → uncertain', () => {
      const factors: DistressFactors = {
        cause: 6.4,
        industry: 6.4,
        balanceSheet: 6.4,
        management: 6.4,
        competition: 6.4,
        revenueBase: 6.4,
        assetValue: 6.4,
      };
      const result = classifyDistress(factors);
      expect(result.classification).toBe('uncertain');
      expect(result.permanenceScore).toBeLessThan(6.5);
    });

    it('permanence score exactly at 6.5 → uncertain', () => {
      const factors: DistressFactors = {
        cause: 6.5,
        industry: 6.5,
        balanceSheet: 6.5,
        management: 6.5,
        competition: 6.5,
        revenueBase: 6.5,
        assetValue: 6.5,
      };
      const result = classifyDistress(factors);
      expect(result.classification).toBe('uncertain');
      expect(result.permanenceScore).toBeCloseTo(6.5, 3);
    });

    it('permanence score just above 6.5 → permanent', () => {
      const factors: DistressFactors = {
        cause: 6.6,
        industry: 6.6,
        balanceSheet: 6.6,
        management: 6.6,
        competition: 6.6,
        revenueBase: 6.6,
        assetValue: 6.6,
      };
      const result = classifyDistress(factors);
      expect(result.classification).toBe('permanent');
      expect(result.permanenceScore).toBeGreaterThan(6.5);
    });
  });

  describe('weight correctness', () => {
    it('cause factor has highest weight (0.20) — alone drives large permanence', () => {
      const onlyCause: DistressFactors = {
        cause: 10,
        industry: 0,
        balanceSheet: 0,
        management: 0,
        competition: 0,
        revenueBase: 0,
        assetValue: 0,
      };
      const result = classifyDistress(onlyCause);
      expect(result.permanenceScore).toBeCloseTo(2.0, 5); // 10 * 0.20
    });

    it('balanceSheet factor has weight 0.20', () => {
      const onlyBalance: DistressFactors = {
        cause: 0,
        industry: 0,
        balanceSheet: 10,
        management: 0,
        competition: 0,
        revenueBase: 0,
        assetValue: 0,
      };
      const result = classifyDistress(onlyBalance);
      expect(result.permanenceScore).toBeCloseTo(2.0, 5); // 10 * 0.20
    });

    it('industry factor has weight 0.15', () => {
      const onlyIndustry: DistressFactors = {
        cause: 0,
        industry: 10,
        balanceSheet: 0,
        management: 0,
        competition: 0,
        revenueBase: 0,
        assetValue: 0,
      };
      const result = classifyDistress(onlyIndustry);
      expect(result.permanenceScore).toBeCloseTo(1.5, 5); // 10 * 0.15
    });

    it('management factor has weight 0.15', () => {
      const onlyManagement: DistressFactors = {
        cause: 0,
        industry: 0,
        balanceSheet: 0,
        management: 10,
        competition: 0,
        revenueBase: 0,
        assetValue: 0,
      };
      const result = classifyDistress(onlyManagement);
      expect(result.permanenceScore).toBeCloseTo(1.5, 5); // 10 * 0.15
    });

    it('competition, revenueBase, assetValue each have weight 0.10', () => {
      const smallWeightFactors: Array<keyof DistressFactors> = ['competition', 'revenueBase', 'assetValue'];
      for (const factor of smallWeightFactors) {
        const factors: DistressFactors = {
          cause: 0, industry: 0, balanceSheet: 0, management: 0,
          competition: 0, revenueBase: 0, assetValue: 0,
        };
        factors[factor] = 10;
        const result = classifyDistress(factors);
        expect(result.permanenceScore, `weight of ${factor}`).toBeCloseTo(1.0, 5); // 10 * 0.10
      }
    });

    it('all weights sum to 1.0 — max score is 10 when all factors are 10', () => {
      const result = classifyDistress(ALL_TEN);
      expect(result.permanenceScore).toBeCloseTo(10.0, 5);
    });
  });

  describe('realistic turnaround candidate', () => {
    it('cyclical downturn with strong balance sheet → temporary', () => {
      const candidate: DistressFactors = {
        cause: 1,       // external/cyclical
        industry: 2,    // stable industry
        balanceSheet: 2, // manageable debt
        management: 1,  // proven team
        competition: 2,  // holding share
        revenueBase: 3,  // mostly recurring
        assetValue: 1,   // assets > liabilities
      };
      const result = classifyDistress(candidate);
      expect(result.classification).toBe('temporary');
      expect(result.permanenceScore).toBeLessThan(3.5);
    });
  });

  describe('realistic permanent impairment', () => {
    it('structural decline with insolvent balance sheet → permanent', () => {
      const terminal: DistressFactors = {
        cause: 9,       // structural decline
        industry: 8,    // dying industry
        balanceSheet: 9, // near insolvent
        management: 7,  // management failing
        competition: 8,  // losing share fast
        revenueBase: 7,  // discretionary revenue
        assetValue: 8,   // negative book
      };
      const result = classifyDistress(terminal);
      expect(result.classification).toBe('permanent');
      expect(result.permanenceScore).toBeGreaterThan(6.5);
    });
  });

  describe('validation', () => {
    it('throws RangeError when a factor exceeds 10', () => {
      expect(() =>
        classifyDistress({ ...ALL_ZERO, cause: 11 }),
      ).toThrow(RangeError);
    });

    it('throws RangeError when a factor is below 0', () => {
      expect(() =>
        classifyDistress({ ...ALL_ZERO, industry: -1 }),
      ).toThrow(RangeError);
    });

    it('does not throw for boundary values 0 and 10', () => {
      expect(() => classifyDistress(ALL_ZERO)).not.toThrow();
      expect(() => classifyDistress(ALL_TEN)).not.toThrow();
    });
  });
});
