import { describe, it, expect } from 'vitest';
import {
  computeMoSAlert,
  type MoSAlertInput,
} from '../../src/portfolio/mos-alert.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** MoS = (200 - 130) / 200 = 0.35 → green */
const HEALTHY_INPUT: MoSAlertInput = {
  intrinsicValue: 200,
  currentPrice: 130,
};

/** MoS = (200 - 174) / 200 = 0.13 → amber */
const AMBER_INPUT: MoSAlertInput = {
  intrinsicValue: 200,
  currentPrice: 174,
};

/** MoS = (200 - 195) / 200 = 0.025 → red */
const RED_INPUT: MoSAlertInput = {
  intrinsicValue: 200,
  currentPrice: 195,
};

/** MoS < 0.15 and price rising → approachingValue = true */
const APPROACHING_INPUT: MoSAlertInput = {
  intrinsicValue: 200,
  currentPrice: 180,   // MoS = 0.10 → red, < 0.15 → approaching check applies
  previousPrice: 170,  // price rose: 170 → 180
};

/** Price above intrinsic value → MoS clamped to 0 */
const ABOVE_VALUE_INPUT: MoSAlertInput = {
  intrinsicValue: 100,
  currentPrice: 120,
};

/** MoS < 0.15 but no previousPrice → approachingValue = false */
const LOW_MOS_NO_PREVIOUS: MoSAlertInput = {
  intrinsicValue: 200,
  currentPrice: 180,
};

/** MoS < 0.15 but price is falling → approachingValue = false */
const LOW_MOS_FALLING: MoSAlertInput = {
  intrinsicValue: 200,
  currentPrice: 180,
  previousPrice: 185, // price fell: 185 → 180
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeMoSAlert', () => {
  describe('healthy margin of safety (green)', () => {
    it('computes MoS correctly', () => {
      const result = computeMoSAlert(HEALTHY_INPUT);
      // (200 - 130) / 200 = 0.35
      expect(result.currentMoS).toBeCloseTo(0.35, 10);
    });

    it('status is green', () => {
      expect(computeMoSAlert(HEALTHY_INPUT).status).toBe('green');
    });

    it('approachingValue is false', () => {
      expect(computeMoSAlert(HEALTHY_INPUT).approachingValue).toBe(false);
    });

    it('message contains "healthy" and the percentage', () => {
      const { message } = computeMoSAlert(HEALTHY_INPUT);
      expect(message).toMatch(/healthy/i);
      expect(message).toContain('35.0%');
    });
  });

  describe('amber zone', () => {
    it('computes MoS correctly', () => {
      const result = computeMoSAlert(AMBER_INPUT);
      // (200 - 174) / 200 = 0.13
      expect(result.currentMoS).toBeCloseTo(0.13, 10);
    });

    it('status is amber', () => {
      expect(computeMoSAlert(AMBER_INPUT).status).toBe('amber');
    });

    it('message contains "narrowing"', () => {
      expect(computeMoSAlert(AMBER_INPUT).message).toMatch(/narrowing/i);
    });

    it('approachingValue is false (MoS >= 0.15)', () => {
      expect(computeMoSAlert(AMBER_INPUT).approachingValue).toBe(false);
    });
  });

  describe('red zone', () => {
    it('status is red', () => {
      expect(computeMoSAlert(RED_INPUT).status).toBe('red');
    });

    it('message mentions "critical" and "exit criteria"', () => {
      const { message } = computeMoSAlert(RED_INPUT);
      expect(message).toMatch(/critical/i);
      expect(message).toMatch(/exit criteria/i);
    });
  });

  describe('approaching intrinsic value detection', () => {
    it('approachingValue is true when MoS < 0.15 and price is rising', () => {
      expect(computeMoSAlert(APPROACHING_INPUT).approachingValue).toBe(true);
    });

    it('message appends "price approaching intrinsic value" suffix', () => {
      const { message } = computeMoSAlert(APPROACHING_INPUT);
      expect(message).toMatch(/price approaching intrinsic value/i);
    });

    it('approachingValue is false when no previousPrice provided', () => {
      expect(computeMoSAlert(LOW_MOS_NO_PREVIOUS).approachingValue).toBe(false);
    });

    it('approachingValue is false when price is falling', () => {
      expect(computeMoSAlert(LOW_MOS_FALLING).approachingValue).toBe(false);
    });
  });

  describe('price above intrinsic value', () => {
    it('MoS is clamped to 0', () => {
      expect(computeMoSAlert(ABOVE_VALUE_INPUT).currentMoS).toBe(0);
    });

    it('status is red', () => {
      expect(computeMoSAlert(ABOVE_VALUE_INPUT).status).toBe('red');
    });

    it('message shows 0.0%', () => {
      expect(computeMoSAlert(ABOVE_VALUE_INPUT).message).toContain('0.0%');
    });
  });

  describe('threshold boundary: exactly 0.20 MoS', () => {
    it('is amber (green threshold is exclusive above 0.20)', () => {
      // MoS = (100 - 80) / 100 = 0.20 → NOT > 0.20 → amber
      const result = computeMoSAlert({ intrinsicValue: 100, currentPrice: 80 });
      expect(result.currentMoS).toBeCloseTo(0.2, 10);
      expect(result.status).toBe('amber');
    });
  });

  describe('threshold boundary: exactly 0.10 MoS', () => {
    it('is amber (red threshold is exclusive below 0.10)', () => {
      // MoS = (100 - 90) / 100 = 0.10 → amber (>= 0.10)
      const result = computeMoSAlert({ intrinsicValue: 100, currentPrice: 90 });
      expect(result.currentMoS).toBeCloseTo(0.1, 10);
      expect(result.status).toBe('amber');
    });
  });
});
