export interface SentimentResult {
  label: 'positive' | 'negative' | 'neutral';
  score: number;
  confidence: number;
  available: boolean;
}

type ModelExecutor = (text: string) => Promise<{
  label: string;
  score: number;
  confidence: number;
}>;

export function createFinBertClient(execute?: ModelExecutor) {
  return {
    async analyzeSentiment(text: string): Promise<SentimentResult> {
      if (!execute) {
        return { label: 'neutral', score: 0, confidence: 0, available: false };
      }
      try {
        const result = await execute(text);
        return {
          label: result.label as SentimentResult['label'],
          score: result.score,
          confidence: result.confidence,
          available: true,
        };
      } catch {
        return { label: 'neutral', score: 0, confidence: 0, available: false };
      }
    },

    filterByConfidence(results: SentimentResult[], threshold: number = 0.75): SentimentResult[] {
      return results.filter((r) => r.confidence >= threshold);
    },

    aggregateDaily(scores: number[]): number {
      if (scores.length === 0) return 0;
      const sorted = [...scores].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    },
  };
}
