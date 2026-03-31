import { describe, it, expect } from 'vitest';
import {
  matchGeopoliticalEvents,
  type NewsArticle,
  type GeopoliticalEventRule,
} from '../../src/distress/geopolitical-matcher.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeArticle(title: string, tone: number): NewsArticle {
  return { title, tone };
}

function makeRule(
  eventType: string,
  eventPattern: string,
  affectedSectors: string[],
  relevanceWeight: number,
  triggerThreshold: number,
): GeopoliticalEventRule {
  return { eventType, eventPattern, affectedSectors, relevanceWeight, triggerThreshold };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LOAD_SHEDDING_RULE = makeRule(
  'load_shedding',
  'load.?shedding|eskom|power.?cut',
  ['utilities', 'mining', 'manufacturing'],
  0.8,
  2, // trigger when matchCount > 2
);

const DEDOLLARIZATION_RULE = makeRule(
  'dedollarization',
  'de.?dollarization|dollar.?collapse|brics.?currency',
  ['banking', 'forex'],
  0.5,
  5,
);

const OIL_PRICE_RULE = makeRule(
  'oil_price',
  'oil.?price|crude.?oil|brent',
  ['energy', 'transport'],
  0.7,
  3,
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('matchGeopoliticalEvents', () => {
  describe('empty inputs', () => {
    it('returns empty array when no rules are provided', () => {
      const articles = [makeArticle('Eskom announces new load shedding schedule', -2.5)];
      expect(matchGeopoliticalEvents(articles, [])).toEqual([]);
    });

    it('returns zero matches when no articles are provided', () => {
      const result = matchGeopoliticalEvents([], [LOAD_SHEDDING_RULE]);
      expect(result).toHaveLength(1);
      expect(result[0].matchCount).toBe(0);
      expect(result[0].triggered).toBe(false);
      expect(result[0].avgTone).toBe(0);
    });

    it('returns one result per rule when both empty', () => {
      const result = matchGeopoliticalEvents([], [LOAD_SHEDDING_RULE, OIL_PRICE_RULE]);
      expect(result).toHaveLength(2);
    });
  });

  describe('pattern matching', () => {
    it('matches articles whose title contains the pattern (case-insensitive)', () => {
      const articles = [
        makeArticle('Eskom announces new load shedding schedule', -2.5),
        makeArticle('LOAD SHEDDING stage 4 extended', -3.0),
        makeArticle('Oil prices surge to 6-month high', 1.5),
      ];
      const result = matchGeopoliticalEvents(articles, [LOAD_SHEDDING_RULE]);
      expect(result[0].matchCount).toBe(2);
    });

    it('does not match articles that do not contain the pattern', () => {
      const articles = [
        makeArticle('JSE closes higher on strong mining results', 1.2),
        makeArticle('Rand strengthens against dollar', 0.5),
      ];
      const result = matchGeopoliticalEvents(articles, [LOAD_SHEDDING_RULE]);
      expect(result[0].matchCount).toBe(0);
    });

    it('matching is case-insensitive', () => {
      const articles = [
        makeArticle('LOAD SHEDDING continues in Cape Town', -1.5),
        makeArticle('Load Shedding affects SA economy', -2.0),
        makeArticle('load shedding stage 6 imminent', -3.0),
      ];
      const result = matchGeopoliticalEvents(articles, [LOAD_SHEDDING_RULE]);
      expect(result[0].matchCount).toBe(3);
    });

    it('matches partial words and substrings via regex', () => {
      // Pattern 'load.?shedding' should match 'loadshedding' (no space)
      const articles = [
        makeArticle('loadshedding causes factory shutdowns', -2.0),
        makeArticle('load-shedding continues in Gauteng', -1.5),
      ];
      const result = matchGeopoliticalEvents(articles, [LOAD_SHEDDING_RULE]);
      expect(result[0].matchCount).toBe(2);
    });

    it('uses full regex capabilities (alternation)', () => {
      const articles = [
        makeArticle('Eskom CEO addresses power crisis', -1.0),
        makeArticle('Load shedding affects SA GDP', -2.0),
        makeArticle('Power cuts leave communities in dark', -1.5),
        makeArticle('SA stock market closes flat', 0.2),
      ];
      const result = matchGeopoliticalEvents(articles, [LOAD_SHEDDING_RULE]);
      expect(result[0].matchCount).toBe(3);
    });
  });

  describe('average tone', () => {
    it('computes average tone across matching articles', () => {
      const articles = [
        makeArticle('Eskom announces stage 4 load shedding', -2.0),
        makeArticle('Load shedding extended for third week', -4.0),
        makeArticle('Load shedding costs SA R1bn per day', -6.0),
      ];
      const result = matchGeopoliticalEvents(articles, [LOAD_SHEDDING_RULE]);
      expect(result[0].avgTone).toBeCloseTo(-4.0, 5); // (-2 + -4 + -6) / 3
    });

    it('returns avgTone of 0 when no articles match', () => {
      const result = matchGeopoliticalEvents(
        [makeArticle('Unrelated news headline', 1.0)],
        [LOAD_SHEDDING_RULE],
      );
      expect(result[0].avgTone).toBe(0);
    });

    it('handles positive tone articles', () => {
      const articles = [
        makeArticle('Brent crude oil hits record high', 2.0),
        makeArticle('Oil price recovery boosts energy sector', 3.0),
      ];
      const result = matchGeopoliticalEvents(articles, [OIL_PRICE_RULE]);
      expect(result[0].avgTone).toBeCloseTo(2.5, 5);
    });
  });

  describe('trigger threshold', () => {
    it('triggered is false when matchCount equals threshold (not strictly greater)', () => {
      // LOAD_SHEDDING_RULE has triggerThreshold = 2
      const articles = [
        makeArticle('Eskom load shedding stage 3', -1.0),
        makeArticle('Load shedding extended', -1.5),
      ];
      const result = matchGeopoliticalEvents(articles, [LOAD_SHEDDING_RULE]);
      expect(result[0].matchCount).toBe(2);
      expect(result[0].triggered).toBe(false); // 2 > 2 is false
    });

    it('triggered is true when matchCount strictly exceeds threshold', () => {
      const articles = [
        makeArticle('Eskom load shedding stage 3', -1.0),
        makeArticle('Load shedding extended', -1.5),
        makeArticle('Load shedding affecting mining output', -2.0),
      ];
      const result = matchGeopoliticalEvents(articles, [LOAD_SHEDDING_RULE]);
      expect(result[0].matchCount).toBe(3);
      expect(result[0].triggered).toBe(true); // 3 > 2 is true
    });

    it('triggered is false when matchCount is 0', () => {
      const result = matchGeopoliticalEvents(
        [makeArticle('Unrelated headline', 0)],
        [LOAD_SHEDDING_RULE],
      );
      expect(result[0].triggered).toBe(false);
    });
  });

  describe('multiple event rules', () => {
    it('returns one result per rule in the same order', () => {
      const articles = [
        makeArticle('Eskom load shedding stage 4', -2.5),
        makeArticle('Oil price surges to $90', 1.0),
      ];
      const result = matchGeopoliticalEvents(articles, [
        LOAD_SHEDDING_RULE,
        DEDOLLARIZATION_RULE,
        OIL_PRICE_RULE,
      ]);
      expect(result).toHaveLength(3);
      expect(result[0].eventType).toBe('load_shedding');
      expect(result[1].eventType).toBe('dedollarization');
      expect(result[2].eventType).toBe('oil_price');
    });

    it('correctly distributes matches across multiple rules', () => {
      const articles = [
        makeArticle('SA load shedding worsens', -2.0),
        makeArticle('Load shedding hits manufacturing', -3.0),
        makeArticle('Load shedding extends into weekend', -1.5),
        makeArticle('De-dollarization trend accelerates in BRICS', -1.0),
        makeArticle('Crude oil prices fall on recession fears', -2.5),
      ];
      const result = matchGeopoliticalEvents(articles, [
        LOAD_SHEDDING_RULE,
        DEDOLLARIZATION_RULE,
        OIL_PRICE_RULE,
      ]);
      expect(result[0].matchCount).toBe(3); // load shedding
      expect(result[1].matchCount).toBe(1); // dedollarization
      expect(result[2].matchCount).toBe(1); // oil price
    });

    it('copies affectedSectors and relevanceWeight from the rule', () => {
      const result = matchGeopoliticalEvents([], [LOAD_SHEDDING_RULE]);
      expect(result[0].affectedSectors).toEqual(['utilities', 'mining', 'manufacturing']);
      expect(result[0].relevanceWeight).toBe(0.8);
    });
  });

  describe('invalid regex handling', () => {
    it('returns zero match result for rule with invalid regex pattern', () => {
      const invalidRule = makeRule('bad_rule', '[invalid(regex', ['sector'], 0.5, 1);
      const articles = [makeArticle('Some headline', 1.0)];
      const result = matchGeopoliticalEvents(articles, [invalidRule]);
      expect(result[0].matchCount).toBe(0);
      expect(result[0].triggered).toBe(false);
      expect(result[0].avgTone).toBe(0);
    });

    it('continues processing valid rules even if one rule has invalid regex', () => {
      const invalidRule = makeRule('bad_rule', '[invalid', [], 0.5, 0);
      const articles = [
        makeArticle('Eskom load shedding stage 2', -1.5),
        makeArticle('Load shedding extended', -2.0),
        makeArticle('Load shedding affects SA', -1.0),
      ];
      const result = matchGeopoliticalEvents(articles, [invalidRule, LOAD_SHEDDING_RULE]);
      expect(result[0].matchCount).toBe(0); // invalid rule
      expect(result[1].matchCount).toBe(3); // valid rule
      expect(result[1].triggered).toBe(true);
    });
  });
});
