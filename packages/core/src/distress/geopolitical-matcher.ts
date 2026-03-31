/**
 * Geopolitical Impact Matcher.
 *
 * Maps GDELT news articles to pre-defined geopolitical event rules via
 * case-insensitive regex matching on article titles. For each event rule,
 * counts matching articles, computes average tone, and flags the event as
 * triggered when the match count exceeds the rule's trigger threshold.
 *
 * This is used to surface macro-level risks (e.g. load shedding, AGOA tariffs,
 * oil price shocks) that may affect specific SA sectors or companies.
 *
 * Source: Dhando Analyzer Design Spec §3, Component 4.
 */

/**
 * A single news article (e.g. from GDELT) with a title and tone score.
 */
export interface NewsArticle {
  /**
   * Article title used for pattern matching.
   */
  title: string;
  /**
   * GDELT tone score: positive = positive sentiment, negative = negative sentiment.
   */
  tone: number;
}

/**
 * A rule that defines what geopolitical event to look for and how to
 * weight its impact on sectors.
 */
export interface GeopoliticalEventRule {
  /** Canonical event type identifier (e.g. 'load_shedding', 'dedollarization'). */
  eventType: string;
  /**
   * Regex pattern used to match article titles (case-insensitive).
   * Standard JavaScript RegExp syntax.
   */
  eventPattern: string;
  /** Sectors materially affected by this event type. */
  affectedSectors: string[];
  /**
   * Relevance weight in [0, 1].
   * Higher weights indicate stronger impact on affected sectors.
   */
  relevanceWeight: number;
  /**
   * Number of matching articles required to consider the event "triggered".
   * Match count strictly greater than this threshold = triggered.
   */
  triggerThreshold: number;
}

/**
 * Result of matching a single geopolitical event rule against a set of articles.
 */
export interface GeopoliticalMatch {
  /** Event type identifier from the rule. */
  eventType: string;
  /** Number of articles whose titles matched this rule's pattern. */
  matchCount: number;
  /**
   * Average tone across matching articles.
   * 0 when no articles matched.
   */
  avgTone: number;
  /** Sectors copied from the matched rule. */
  affectedSectors: string[];
  /** Relevance weight copied from the matched rule. */
  relevanceWeight: number;
  /**
   * True when `matchCount > rule.triggerThreshold`.
   * Triggered events should be surfaced as active risk signals.
   */
  triggered: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Match a set of news articles against geopolitical event rules.
 *
 * For each rule:
 * 1. Filter articles whose title matches `rule.eventPattern` (case-insensitive regex).
 * 2. Count matches and compute their average tone.
 * 3. Flag as triggered when match count strictly exceeds `rule.triggerThreshold`.
 *
 * Returns one {@link GeopoliticalMatch} per rule in the same order as `eventRules`.
 * Rules with invalid regex patterns are returned with matchCount = 0 and
 * triggered = false (pattern error is swallowed to prevent one bad rule from
 * breaking the pipeline).
 *
 * @param articles - News articles to evaluate (e.g. from GDELT).
 * @param eventRules - Geopolitical event rules to match against.
 * @returns One match result per rule.
 */
export function matchGeopoliticalEvents(
  articles: NewsArticle[],
  eventRules: GeopoliticalEventRule[],
): GeopoliticalMatch[] {
  return eventRules.map((rule) => {
    let pattern: RegExp;
    try {
      pattern = new RegExp(rule.eventPattern, 'i');
    } catch {
      // Invalid regex — return a zero-match result to avoid crashing the pipeline.
      return {
        eventType: rule.eventType,
        matchCount: 0,
        avgTone: 0,
        affectedSectors: rule.affectedSectors,
        relevanceWeight: rule.relevanceWeight,
        triggered: false,
      };
    }

    const matched = articles.filter((a) => pattern.test(a.title));
    const matchCount = matched.length;
    const avgTone =
      matchCount > 0
        ? matched.reduce((sum, a) => sum + a.tone, 0) / matchCount
        : 0;

    return {
      eventType: rule.eventType,
      matchCount,
      avgTone,
      affectedSectors: rule.affectedSectors,
      relevanceWeight: rule.relevanceWeight,
      triggered: matchCount > rule.triggerThreshold,
    };
  });
}
