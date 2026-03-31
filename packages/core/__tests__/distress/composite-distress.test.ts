import { describe, it, expect } from 'vitest';
import {
  calculateCompositeDistress,
  type CompositeDistressInput,
} from '../../src/distress/composite-distress.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** Healthy company: strong Z, improving F, clean M, growing FCF, low debt, rising WC. */
const HEALTHY_INPUT: CompositeDistressInput = {
  altmanZ: 4.5,
  piotroskiFCurrent: 8,
  piotroskiFPrior: 6,
  beneishM: -3.2,
  fcfCurrent: 500_000,
  fcfPrior: 400_000,
  debtToEbitda: 0.8,
  workingCapitalCurrent: 1_000_000,
  workingCapitalPrior: 800_000,
};

/** Distressed company: Z in distress zone, declining F, manipulation flag, burning cash, high leverage, shrinking WC. */
const DISTRESSED_INPUT: CompositeDistressInput = {
  altmanZ: 0.8,
  piotroskiFCurrent: 2,
  piotroskiFPrior: 6,
  beneishM: -0.5,
  fcfCurrent: -300_000,
  fcfPrior: 100_000,
  debtToEbitda: 7,
  workingCapitalCurrent: -200_000,
  workingCapitalPrior: 150_000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('calculateCompositeDistress', () => {
  describe('score range validation', () => {
    it('returns a score in [0, 100]', () => {
      const r = calculateCompositeDistress(HEALTHY_INPUT);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    });

    it('returns a score in [0, 100] for distressed company', () => {
      const r = calculateCompositeDistress(DISTRESSED_INPUT);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    });

    it('returns all six components in [0, 100]', () => {
      const r = calculateCompositeDistress(HEALTHY_INPUT);
      const componentKeys = ['altmanZ', 'piotroskiTrend', 'beneishM', 'fcfDeterioration', 'leverage', 'workingCapital'];
      for (const key of componentKeys) {
        expect(r.components[key], `component ${key}`).toBeGreaterThanOrEqual(0);
        expect(r.components[key], `component ${key}`).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('healthy vs distressed ordering', () => {
    it('healthy company scores significantly lower than distressed company', () => {
      const healthy = calculateCompositeDistress(HEALTHY_INPUT);
      const distressed = calculateCompositeDistress(DISTRESSED_INPUT);
      expect(healthy.score).toBeLessThan(35);
      expect(distressed.score).toBeGreaterThan(65);
    });

    it('healthy composite score is below 35', () => {
      const { score } = calculateCompositeDistress(HEALTHY_INPUT);
      expect(score).toBeLessThan(35);
    });

    it('distressed composite score is above 65', () => {
      const { score } = calculateCompositeDistress(DISTRESSED_INPUT);
      expect(score).toBeGreaterThan(65);
    });
  });

  describe('individual component behaviour', () => {
    it('Altman Z in safe zone yields low altmanZ component', () => {
      const r = calculateCompositeDistress({ ...HEALTHY_INPUT, altmanZ: 4.5 });
      expect(r.components.altmanZ).toBeLessThan(30);
    });

    it('Altman Z in deep distress yields high altmanZ component', () => {
      const r = calculateCompositeDistress({ ...HEALTHY_INPUT, altmanZ: 0.5 });
      expect(r.components.altmanZ).toBeGreaterThan(80);
    });

    it('Altman Z at boundary of safe zone (3.0) yields moderate altmanZ component', () => {
      const r = calculateCompositeDistress({ ...HEALTHY_INPUT, altmanZ: 3.0 });
      expect(r.components.altmanZ).toBeLessThan(55);
    });

    it('improving Piotroski F yields low piotroskiTrend component', () => {
      const r = calculateCompositeDistress({ ...HEALTHY_INPUT, piotroskiFCurrent: 9, piotroskiFPrior: 4 });
      expect(r.components.piotroskiTrend).toBeLessThan(30);
    });

    it('deteriorating Piotroski F yields high piotroskiTrend component', () => {
      const r = calculateCompositeDistress({ ...HEALTHY_INPUT, piotroskiFCurrent: 2, piotroskiFPrior: 8 });
      expect(r.components.piotroskiTrend).toBeGreaterThan(70);
    });

    it('Beneish M below -1.78 (clean) yields low beneishM component', () => {
      const r = calculateCompositeDistress({ ...HEALTHY_INPUT, beneishM: -3.5 });
      expect(r.components.beneishM).toBeLessThan(15);
    });

    it('Beneish M above -1.78 (manipulator flag) yields elevated beneishM component', () => {
      const r = calculateCompositeDistress({ ...HEALTHY_INPUT, beneishM: -0.5 });
      expect(r.components.beneishM).toBeGreaterThan(60);
    });

    it('growing FCF yields zero fcfDeterioration', () => {
      const r = calculateCompositeDistress({ ...HEALTHY_INPUT, fcfCurrent: 600_000, fcfPrior: 400_000 });
      expect(r.components.fcfDeterioration).toBe(0);
    });

    it('FCF turning negative from positive yields elevated fcfDeterioration', () => {
      const r = calculateCompositeDistress({ ...HEALTHY_INPUT, fcfCurrent: -100_000, fcfPrior: 200_000 });
      expect(r.components.fcfDeterioration).toBe(75);
    });

    it('zero leverage yields low leverage component', () => {
      const r = calculateCompositeDistress({ ...HEALTHY_INPUT, debtToEbitda: 0 });
      expect(r.components.leverage).toBe(0);
    });

    it('leverage above 5x yields 100 leverage component', () => {
      const r = calculateCompositeDistress({ ...HEALTHY_INPUT, debtToEbitda: 6 });
      expect(r.components.leverage).toBe(100);
    });

    it('negative EBITDA (debtToEbitda = Infinity) yields 100 leverage component', () => {
      const r = calculateCompositeDistress({ ...HEALTHY_INPUT, debtToEbitda: Infinity });
      expect(r.components.leverage).toBe(100);
    });

    it('growing working capital yields zero workingCapital component', () => {
      const r = calculateCompositeDistress({
        ...HEALTHY_INPUT,
        workingCapitalCurrent: 1_200_000,
        workingCapitalPrior: 1_000_000,
      });
      expect(r.components.workingCapital).toBe(0);
    });

    it('working capital turning negative yields elevated workingCapital component', () => {
      const r = calculateCompositeDistress({
        ...HEALTHY_INPUT,
        workingCapitalCurrent: -50_000,
        workingCapitalPrior: 300_000,
      });
      expect(r.components.workingCapital).toBe(75);
    });
  });

  describe('mixed signals', () => {
    it('good balance sheet but deteriorating earnings produces mid-range score', () => {
      const mixed: CompositeDistressInput = {
        altmanZ: 3.5,           // safe
        piotroskiFCurrent: 3,   // declining from 7 — weak trend
        piotroskiFPrior: 7,
        beneishM: -2.0,         // borderline
        fcfCurrent: 50_000,     // barely positive
        fcfPrior: 400_000,      // was much stronger
        debtToEbitda: 2.5,
        workingCapitalCurrent: 100_000,
        workingCapitalPrior: 200_000,
      };
      const { score } = calculateCompositeDistress(mixed);
      expect(score).toBeGreaterThan(25);
      expect(score).toBeLessThan(75);
    });

    it('stable Piotroski F produces midpoint piotroskiTrend component', () => {
      const r = calculateCompositeDistress({
        ...HEALTHY_INPUT,
        piotroskiFCurrent: 5,
        piotroskiFPrior: 5,
      });
      // delta = 0 → midpoint of [0, 100] = 50
      expect(r.components.piotroskiTrend).toBeCloseTo(50, 5);
    });
  });

  describe('edge cases', () => {
    it('handles Altman Z at exactly 5 (safe ceiling)', () => {
      const r = calculateCompositeDistress({ ...HEALTHY_INPUT, altmanZ: 5 });
      expect(r.components.altmanZ).toBe(0);
    });

    it('handles Altman Z above 5 (clamps to 0)', () => {
      const r = calculateCompositeDistress({ ...HEALTHY_INPUT, altmanZ: 10 });
      expect(r.components.altmanZ).toBe(0);
    });

    it('handles zero FCF for both periods', () => {
      const r = calculateCompositeDistress({ ...HEALTHY_INPUT, fcfCurrent: 0, fcfPrior: 0 });
      expect(r.components.fcfDeterioration).toBeGreaterThanOrEqual(0);
      expect(r.components.fcfDeterioration).toBeLessThanOrEqual(100);
    });

    it('handles both FCF negative with current worse', () => {
      const r = calculateCompositeDistress({
        ...HEALTHY_INPUT,
        fcfCurrent: -500_000,
        fcfPrior: -200_000,
      });
      expect(r.components.fcfDeterioration).toBe(100);
    });

    it('handles both FCF negative with current better', () => {
      const r = calculateCompositeDistress({
        ...HEALTHY_INPUT,
        fcfCurrent: -100_000,
        fcfPrior: -300_000,
      });
      expect(r.components.fcfDeterioration).toBe(50);
    });

    it('handles both WC negative with current worse', () => {
      const r = calculateCompositeDistress({
        ...HEALTHY_INPUT,
        workingCapitalCurrent: -400_000,
        workingCapitalPrior: -100_000,
      });
      expect(r.components.workingCapital).toBe(100);
    });

    it('returns score rounded to 2 decimal places', () => {
      const r = calculateCompositeDistress(HEALTHY_INPUT);
      const rounded = Math.round(r.score * 100) / 100;
      expect(r.score).toBe(rounded);
    });

    it('total weight across components equals 1.0', () => {
      // Verify by checking that an input producing 100 on every component → score = 100
      const allMax: CompositeDistressInput = {
        altmanZ: -1,          // > distress
        piotroskiFCurrent: 0,
        piotroskiFPrior: 9,   // massive deterioration
        beneishM: 1,          // well above manipulation threshold
        fcfCurrent: -500_000,
        fcfPrior: -200_000,   // both negative, current worse
        debtToEbitda: 10,     // well above 5x cap
        workingCapitalCurrent: -400_000,
        workingCapitalPrior: -100_000, // both negative, current worse
      };
      const r = calculateCompositeDistress(allMax);
      expect(r.score).toBe(100);
    });
  });
});
