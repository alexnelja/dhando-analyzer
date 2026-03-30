import { describe, it, expect, vi } from 'vitest';
import { createFinBertClient, type SentimentResult } from '../../src/api/finbert.js';

describe('FinBERT client', () => {
  it('returns sentiment analysis result', async () => {
    const mockExecute = vi.fn().mockResolvedValue({ label: 'negative', score: -0.85, confidence: 0.92 });
    const client = createFinBertClient(mockExecute);
    const result = await client.analyzeSentiment('Eskom announces extended load shedding');
    expect(result.score).toBe(-0.85);
    expect(result.confidence).toBe(0.92);
    expect(result.label).toBe('negative');
    expect(result.available).toBe(true);
  });

  it('handles model unavailable gracefully', async () => {
    const mockExecute = vi.fn().mockRejectedValue(new Error('Model not downloaded'));
    const client = createFinBertClient(mockExecute);
    const result = await client.analyzeSentiment('test text');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.available).toBe(false);
  });

  it('returns neutral when no executor provided', async () => {
    const client = createFinBertClient();
    const result = await client.analyzeSentiment('test');
    expect(result.available).toBe(false);
    expect(result.label).toBe('neutral');
  });

  it('filters by confidence threshold', () => {
    const client = createFinBertClient(vi.fn());
    const results: SentimentResult[] = [
      { label: 'negative', score: -0.8, confidence: 0.95, available: true },
      { label: 'positive', score: 0.3, confidence: 0.6, available: true },
      { label: 'negative', score: -0.5, confidence: 0.8, available: true },
    ];
    const filtered = client.filterByConfidence(results, 0.75);
    expect(filtered.length).toBe(2);
    expect(filtered.every((r) => r.confidence >= 0.75)).toBe(true);
  });

  it('aggregates daily sentiment via median', () => {
    const client = createFinBertClient(vi.fn());
    expect(client.aggregateDaily([-0.8, -0.5, -0.3, 0.1, -0.6])).toBe(-0.5);
    expect(client.aggregateDaily([-0.8, -0.5, -0.3, 0.1])).toBe(-0.4);
    expect(client.aggregateDaily([])).toBe(0);
  });
});
