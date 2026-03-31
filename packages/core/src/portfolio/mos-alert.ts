/**
 * Margin-of-safety erosion alert engine.
 *
 * Computes the current margin of safety for a position and generates a
 * human-readable alert with a traffic-light status. Optionally detects a
 * rising-price trend (price approaching intrinsic value) when a previous
 * price is provided.
 *
 * All logic is pure — no side effects, no I/O.
 */

import type { TrafficLight } from './traffic-light.js';

/** The computed alert for a single position's margin of safety. */
export interface MoSAlert {
  /** Current margin of safety as a fraction (0–1). Clamped to 0 when price > intrinsic value. */
  currentMoS: number;
  /** Traffic-light status based on MoS thresholds. */
  status: TrafficLight;
  /**
   * True when MoS < 0.15 and the price is rising toward intrinsic value
   * (requires previousPrice to be provided and currentPrice > previousPrice).
   */
  approachingValue: boolean;
  /** Human-readable alert message. */
  message: string;
}

/** Inputs required to compute a margin-of-safety alert. */
export interface MoSAlertInput {
  /** Estimated intrinsic value per share. */
  intrinsicValue: number;
  /** Current market price per share. */
  currentPrice: number;
  /**
   * Previous market price per share. When provided, enables trend detection:
   * if price has risen and MoS is below 0.15, `approachingValue` is set to true.
   */
  previousPrice?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const MOS_GREEN_THRESHOLD = 0.2;
const MOS_AMBER_THRESHOLD = 0.1;
const MOS_APPROACHING_THRESHOLD = 0.15;

function computeStatus(mos: number): TrafficLight {
  if (mos > MOS_GREEN_THRESHOLD) return 'green';
  if (mos >= MOS_AMBER_THRESHOLD) return 'amber';
  return 'red';
}

function formatPct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function buildMessage(
  status: TrafficLight,
  mos: number,
  approaching: boolean,
): string {
  let base: string;
  switch (status) {
    case 'green':
      base = `Margin of safety healthy at ${formatPct(mos)}`;
      break;
    case 'amber':
      base = `Margin of safety narrowing to ${formatPct(mos)}`;
      break;
    case 'red':
      base = `Margin of safety critical at ${formatPct(mos)} — consider exit criteria`;
      break;
  }

  if (approaching) {
    base += ' — price approaching intrinsic value';
  }

  return base;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a margin-of-safety alert for a single position.
 *
 * MoS = (intrinsicValue − currentPrice) / intrinsicValue.
 * Clamped to 0 when currentPrice exceeds intrinsicValue.
 *
 * @param input - Intrinsic value, current price, and optionally the previous price.
 * @returns Alert with status, flag for approaching value, and a message.
 */
export function computeMoSAlert(input: MoSAlertInput): MoSAlert {
  const { intrinsicValue, currentPrice, previousPrice } = input;

  const rawMoS = (intrinsicValue - currentPrice) / intrinsicValue;
  const currentMoS = Math.max(0, rawMoS);

  const status = computeStatus(currentMoS);

  const approachingValue =
    currentMoS < MOS_APPROACHING_THRESHOLD &&
    previousPrice !== undefined &&
    currentPrice > previousPrice;

  const message = buildMessage(status, currentMoS, approachingValue);

  return { currentMoS, status, approachingValue, message };
}
