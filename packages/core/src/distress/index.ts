/**
 * Distress Radar — public barrel export.
 *
 * Re-exports all public types and functions from the distress module so
 * consumers can import from `@dhando/core` directly:
 *
 * ```typescript
 * import {
 *   calculateCompositeDistress,
 *   classifyDistress,
 *   aggregateDailySentiment,
 *   computeSentimentTrend,
 *   matchGeopoliticalEvents,
 *   runDistressRadar,
 * } from '@dhando/core';
 * ```
 */

export * from './composite-distress.js';
export * from './classification.js';
export * from './sentiment-aggregation.js';
export * from './geopolitical-matcher.js';
export * from './distress-store.js';
export * from './pipeline.js';
