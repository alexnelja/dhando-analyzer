import { describe, it, expect } from 'vitest';
import {
  scoreTrafficLight,
  type TrafficLightInput,
  type TrafficLight,
} from '../../src/portfolio/traffic-light.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** All factors clearly in the green zone. */
const ALL_GREEN_INPUT: TrafficLightInput = {
  marginOfSafety: 0.35,    // > 0.20 → green
  moatScore: 5,            // >= 4 → green
  managementScore: 4,      // >= 4 → green
  altmanZScore: 3.5,       // > 2.99 → green
  piotroskiFScore: 8,      // >= 7 → green
  beneishMScore: -3.0,     // < -2.22 → green
  kellyDriftAbsolute: 0.01,// < 0.03 → green
  sentimentScore: 0.5,     // > 0.2 → green
};

/** All factors clearly in the red zone. */
const ALL_RED_INPUT: TrafficLightInput = {
  marginOfSafety: 0.05,    // < 0.10 → red
  moatScore: 1,            // <= 2 → red
  managementScore: 2,      // <= 2 → red
  altmanZScore: 1.0,       // < 1.81 → red
  piotroskiFScore: 3,      // <= 4 → red
  beneishMScore: -1.0,     // > -1.78 → red
  kellyDriftAbsolute: 0.15,// > 0.08 → red
  sentimentScore: -0.5,    // < -0.2 → red
};

/** Mostly green but one amber factor. */
const MIXED_AMBER_INPUT: TrafficLightInput = {
  ...ALL_GREEN_INPUT,
  marginOfSafety: 0.15,    // 0.10–0.20 → amber
};

/** Mostly green but one red factor — overall should be red. */
const MIXED_RED_INPUT: TrafficLightInput = {
  ...ALL_GREEN_INPUT,
  piotroskiFScore: 2,      // <= 4 → red
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scoreTrafficLight', () => {
  describe('all-green position', () => {
    it('returns green for all 8 factors', () => {
      const result = scoreTrafficLight(ALL_GREEN_INPUT);
      expect(result.factors).toHaveLength(8);
      result.factors.forEach((f) => {
        expect(f.status).toBe('green');
      });
    });

    it('overall verdict is green', () => {
      expect(scoreTrafficLight(ALL_GREEN_INPUT).overall).toBe('green');
    });
  });

  describe('all-red position', () => {
    it('returns red for all 8 factors', () => {
      const result = scoreTrafficLight(ALL_RED_INPUT);
      result.factors.forEach((f) => {
        expect(f.status).toBe('red');
      });
    });

    it('overall verdict is red', () => {
      expect(scoreTrafficLight(ALL_RED_INPUT).overall).toBe('red');
    });
  });

  describe('mixed position: overall picks worst', () => {
    it('one amber → overall is amber (not green)', () => {
      expect(scoreTrafficLight(MIXED_AMBER_INPUT).overall).toBe('amber');
    });

    it('one red among greens → overall is red', () => {
      expect(scoreTrafficLight(MIXED_RED_INPUT).overall).toBe('red');
    });
  });

  describe('each factor result contains name, value, and threshold text', () => {
    it('includes factor names', () => {
      const result = scoreTrafficLight(ALL_GREEN_INPUT);
      const names = result.factors.map((f) => f.name);
      expect(names).toContain('Margin of Safety');
      expect(names).toContain('Moat');
      expect(names).toContain('Management');
      expect(names).toContain('Altman Z-Score');
      expect(names).toContain('Piotroski F-Score');
      expect(names).toContain('Beneish M-Score');
      expect(names).toContain('Kelly Drift');
      expect(names).toContain('Sentiment');
    });

    it('passes raw value through to each factor', () => {
      const result = scoreTrafficLight(ALL_GREEN_INPUT);
      const mosFactor = result.factors.find((f) => f.name === 'Margin of Safety')!;
      expect(mosFactor.value).toBe(0.35);
    });
  });

  describe('boundary values per factor', () => {
    /** Helper: score a single mutated input and return the named factor's status. */
    function factorStatus(
      overrides: Partial<TrafficLightInput>,
      factorName: string,
    ): TrafficLight {
      const result = scoreTrafficLight({ ...ALL_GREEN_INPUT, ...overrides });
      return result.factors.find((f) => f.name === factorName)!.status;
    }

    describe('Margin of Safety', () => {
      it('0.20 is amber (not green — boundary is exclusive)', () => {
        expect(factorStatus({ marginOfSafety: 0.2 }, 'Margin of Safety')).toBe('amber');
      });
      it('0.10 is green-side boundary: amber', () => {
        expect(factorStatus({ marginOfSafety: 0.1 }, 'Margin of Safety')).toBe('amber');
      });
      it('0.099 is red', () => {
        expect(factorStatus({ marginOfSafety: 0.099 }, 'Margin of Safety')).toBe('red');
      });
      it('0.21 is green', () => {
        expect(factorStatus({ marginOfSafety: 0.21 }, 'Margin of Safety')).toBe('green');
      });
    });

    describe('Moat', () => {
      it('score 4 is green', () => {
        expect(factorStatus({ moatScore: 4 }, 'Moat')).toBe('green');
      });
      it('score 3 is amber', () => {
        expect(factorStatus({ moatScore: 3 }, 'Moat')).toBe('amber');
      });
      it('score 2 is red', () => {
        expect(factorStatus({ moatScore: 2 }, 'Moat')).toBe('red');
      });
    });

    describe('Management', () => {
      it('score 4 is green', () => {
        expect(factorStatus({ managementScore: 4 }, 'Management')).toBe('green');
      });
      it('score 3 is amber', () => {
        expect(factorStatus({ managementScore: 3 }, 'Management')).toBe('amber');
      });
      it('score 2 is red', () => {
        expect(factorStatus({ managementScore: 2 }, 'Management')).toBe('red');
      });
    });

    describe('Altman Z-Score', () => {
      it('z = 3.0 is green', () => {
        expect(factorStatus({ altmanZScore: 3.0 }, 'Altman Z-Score')).toBe('green');
      });
      it('z = 2.99 is amber', () => {
        expect(factorStatus({ altmanZScore: 2.99 }, 'Altman Z-Score')).toBe('amber');
      });
      it('z = 1.81 is amber (lower boundary inclusive)', () => {
        expect(factorStatus({ altmanZScore: 1.81 }, 'Altman Z-Score')).toBe('amber');
      });
      it('z = 1.80 is red', () => {
        expect(factorStatus({ altmanZScore: 1.80 }, 'Altman Z-Score')).toBe('red');
      });
    });

    describe('Piotroski F-Score', () => {
      it('f = 7 is green', () => {
        expect(factorStatus({ piotroskiFScore: 7 }, 'Piotroski F-Score')).toBe('green');
      });
      it('f = 6 is amber', () => {
        expect(factorStatus({ piotroskiFScore: 6 }, 'Piotroski F-Score')).toBe('amber');
      });
      it('f = 5 is amber', () => {
        expect(factorStatus({ piotroskiFScore: 5 }, 'Piotroski F-Score')).toBe('amber');
      });
      it('f = 4 is red', () => {
        expect(factorStatus({ piotroskiFScore: 4 }, 'Piotroski F-Score')).toBe('red');
      });
    });

    describe('Beneish M-Score', () => {
      it('m = -3.0 is green', () => {
        expect(factorStatus({ beneishMScore: -3.0 }, 'Beneish M-Score')).toBe('green');
      });
      it('m = -2.22 is amber (boundary inclusive)', () => {
        expect(factorStatus({ beneishMScore: -2.22 }, 'Beneish M-Score')).toBe('amber');
      });
      it('m = -2.0 is amber', () => {
        expect(factorStatus({ beneishMScore: -2.0 }, 'Beneish M-Score')).toBe('amber');
      });
      it('m = -1.78 is amber (upper boundary inclusive)', () => {
        expect(factorStatus({ beneishMScore: -1.78 }, 'Beneish M-Score')).toBe('amber');
      });
      it('m = -1.77 is red', () => {
        expect(factorStatus({ beneishMScore: -1.77 }, 'Beneish M-Score')).toBe('red');
      });
    });

    describe('Kelly Drift', () => {
      it('drift = 0.02 is green', () => {
        expect(factorStatus({ kellyDriftAbsolute: 0.02 }, 'Kelly Drift')).toBe('green');
      });
      it('drift = 0.03 is amber (boundary inclusive)', () => {
        expect(factorStatus({ kellyDriftAbsolute: 0.03 }, 'Kelly Drift')).toBe('amber');
      });
      it('drift = 0.08 is amber (upper boundary inclusive)', () => {
        expect(factorStatus({ kellyDriftAbsolute: 0.08 }, 'Kelly Drift')).toBe('amber');
      });
      it('drift = 0.09 is red', () => {
        expect(factorStatus({ kellyDriftAbsolute: 0.09 }, 'Kelly Drift')).toBe('red');
      });
    });

    describe('Sentiment', () => {
      it('sentiment = 0.5 is green', () => {
        expect(factorStatus({ sentimentScore: 0.5 }, 'Sentiment')).toBe('green');
      });
      it('sentiment = 0.2 is amber (boundary exclusive)', () => {
        expect(factorStatus({ sentimentScore: 0.2 }, 'Sentiment')).toBe('amber');
      });
      it('sentiment = 0 is amber', () => {
        expect(factorStatus({ sentimentScore: 0 }, 'Sentiment')).toBe('amber');
      });
      it('sentiment = -0.2 is amber (lower boundary inclusive)', () => {
        expect(factorStatus({ sentimentScore: -0.2 }, 'Sentiment')).toBe('amber');
      });
      it('sentiment = -0.21 is red', () => {
        expect(factorStatus({ sentimentScore: -0.21 }, 'Sentiment')).toBe('red');
      });
    });
  });
});
