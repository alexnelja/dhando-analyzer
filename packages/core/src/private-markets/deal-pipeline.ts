/**
 * PE Deal Pipeline State Machine — models the progression of a private equity
 * or private-markets deal through the standard deal flow stages.
 *
 * Stages progress in a defined order; a deal may also be rejected from any
 * non-terminal stage. Terminal stages (`closed`, `rejected`) cannot be
 * advanced further and `closed` deals cannot be rejected.
 *
 *   nda_pending → screening → meeting_scheduled → deep_dd
 *     → ic_memo → bidding → closed
 *                             ↑ (reject from any non-closed stage → rejected)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All valid stages in the PE deal pipeline. */
export type DealStage =
  | 'nda_pending'
  | 'screening'
  | 'meeting_scheduled'
  | 'deep_dd'
  | 'ic_memo'
  | 'bidding'
  | 'closed'
  | 'rejected';

/**
 * Immutable record of a single stage transition.
 * Returned by {@link advanceDealStage} and {@link rejectDeal}.
 */
export interface DealTransition {
  /** Stage the deal was in before this transition. */
  from: DealStage;
  /** Stage the deal moved to. */
  to: DealStage;
  /** ISO-8601 timestamp of the transition. */
  transitionedAt: string;
  /** Free-text notes captured at the time of the transition. */
  notes: string;
}

/**
 * Extension of {@link DealTransition} for rejections — optionally records
 * when the opportunity should be revisited.
 */
export interface RejectTransition extends DealTransition {
  /** ISO-8601 date string indicating when to reconsider, if supplied. */
  revisitAfter?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The canonical forward progression of deal stages.
 * `rejected` is intentionally excluded — it is a side-exit from any stage.
 */
export const DEAL_STAGE_ORDER: DealStage[] = [
  'nda_pending',
  'screening',
  'meeting_scheduled',
  'deep_dd',
  'ic_memo',
  'bidding',
  'closed',
];

/** Stages from which no further advancement or rejection is permitted. */
const TERMINAL_ADVANCE_STAGES = new Set<DealStage>(['closed', 'rejected']);

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Determine whether a deal at the given stage can be advanced further.
 *
 * @param stage - Current deal stage.
 * @returns `true` when advancement is possible; `false` for `closed`/`rejected`.
 */
export function canAdvance(stage: DealStage): boolean {
  return !TERMINAL_ADVANCE_STAGES.has(stage);
}

/**
 * Advance a deal to the next stage in the pipeline.
 *
 * @param currentStage - The stage the deal is currently in.
 * @param notes - Optional notes to record with the transition.
 * @returns A {@link DealTransition} describing the move.
 * @throws {Error} If the deal is already `closed` or `rejected`.
 * @throws {Error} If the deal is already at the final stage (`closed`).
 */
export function advanceDealStage(currentStage: DealStage, notes?: string): DealTransition {
  if (!canAdvance(currentStage)) {
    throw new Error(
      `Cannot advance deal from terminal stage '${currentStage}'`,
    );
  }

  const currentIndex = DEAL_STAGE_ORDER.indexOf(currentStage);
  if (currentIndex === -1) {
    // Defensive: should not occur given the type constraint, but guards against
    // runtime values cast through `as DealStage`.
    throw new Error(`Unknown deal stage: '${currentStage}'`);
  }

  const nextStage = DEAL_STAGE_ORDER[currentIndex + 1];
  if (nextStage === undefined) {
    throw new Error(
      `Deal is already at the final stage '${currentStage}' — use rejectDeal or mark as closed`,
    );
  }

  return {
    from: currentStage,
    to: nextStage,
    transitionedAt: new Date().toISOString(),
    notes: notes ?? '',
  };
}

/**
 * Reject a deal, recording the reason and an optional revisit date.
 *
 * @param currentStage - The stage the deal is currently in.
 * @param reason - Why the deal is being rejected (recorded in `notes`).
 * @param revisitAfter - Optional ISO-8601 date string for when to reconsider.
 * @returns A {@link RejectTransition} describing the rejection.
 * @throws {Error} If the deal is already `closed` (cannot reject a closed deal).
 * @throws {Error} If the deal is already `rejected`.
 */
export function rejectDeal(
  currentStage: DealStage,
  reason: string,
  revisitAfter?: string,
): RejectTransition {
  if (currentStage === 'closed') {
    throw new Error(`Cannot reject a deal that is already 'closed'`);
  }
  if (currentStage === 'rejected') {
    throw new Error(`Deal is already 'rejected'`);
  }

  const transition: RejectTransition = {
    from: currentStage,
    to: 'rejected',
    transitionedAt: new Date().toISOString(),
    notes: reason,
  };

  if (revisitAfter !== undefined) {
    transition.revisitAfter = revisitAfter;
  }

  return transition;
}
