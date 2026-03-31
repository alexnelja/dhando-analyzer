import { describe, it, expect } from 'vitest';
import {
  advanceDealStage,
  rejectDeal,
  canAdvance,
  DEAL_STAGE_ORDER,
  type DealStage,
} from '../../src/private-markets/deal-pipeline.js';

// ---------------------------------------------------------------------------
// DEAL_STAGE_ORDER
// ---------------------------------------------------------------------------

describe('DEAL_STAGE_ORDER', () => {
  it('contains 7 forward stages (excludes rejected)', () => {
    expect(DEAL_STAGE_ORDER).toHaveLength(7);
  });

  it('starts with nda_pending', () => {
    expect(DEAL_STAGE_ORDER[0]).toBe('nda_pending');
  });

  it('ends with closed', () => {
    expect(DEAL_STAGE_ORDER[DEAL_STAGE_ORDER.length - 1]).toBe('closed');
  });

  it('does not contain rejected', () => {
    expect(DEAL_STAGE_ORDER).not.toContain('rejected');
  });
});

// ---------------------------------------------------------------------------
// canAdvance
// ---------------------------------------------------------------------------

describe('canAdvance', () => {
  it.each(DEAL_STAGE_ORDER.slice(0, -1) as DealStage[])(
    'returns true for non-terminal stage %s',
    (stage) => {
      expect(canAdvance(stage)).toBe(true);
    },
  );

  it('returns false for closed', () => {
    expect(canAdvance('closed')).toBe(false);
  });

  it('returns false for rejected', () => {
    expect(canAdvance('rejected')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// advanceDealStage — forward progression
// ---------------------------------------------------------------------------

describe('advanceDealStage — full pipeline traversal', () => {
  it('advances from nda_pending to screening', () => {
    const t = advanceDealStage('nda_pending');
    expect(t.from).toBe('nda_pending');
    expect(t.to).toBe('screening');
  });

  it('advances from screening to meeting_scheduled', () => {
    const t = advanceDealStage('screening');
    expect(t.to).toBe('meeting_scheduled');
  });

  it('advances from meeting_scheduled to deep_dd', () => {
    const t = advanceDealStage('meeting_scheduled');
    expect(t.to).toBe('deep_dd');
  });

  it('advances from deep_dd to ic_memo', () => {
    const t = advanceDealStage('deep_dd');
    expect(t.to).toBe('ic_memo');
  });

  it('advances from ic_memo to bidding', () => {
    const t = advanceDealStage('ic_memo');
    expect(t.to).toBe('bidding');
  });

  it('advances from bidding to closed', () => {
    const t = advanceDealStage('bidding');
    expect(t.to).toBe('closed');
  });
});

describe('advanceDealStage — transition metadata', () => {
  it('returns a valid ISO-8601 timestamp', () => {
    const t = advanceDealStage('nda_pending');
    expect(() => new Date(t.transitionedAt)).not.toThrow();
    expect(new Date(t.transitionedAt).toISOString()).toBe(t.transitionedAt);
  });

  it('captures provided notes on the transition', () => {
    const t = advanceDealStage('screening', 'Passed initial financial screen');
    expect(t.notes).toBe('Passed initial financial screen');
  });

  it('defaults notes to empty string when not provided', () => {
    const t = advanceDealStage('screening');
    expect(t.notes).toBe('');
  });
});

// ---------------------------------------------------------------------------
// advanceDealStage — terminal stages throw
// ---------------------------------------------------------------------------

describe('advanceDealStage — terminal stage errors', () => {
  it('throws when advancing from closed', () => {
    expect(() => advanceDealStage('closed')).toThrow();
  });

  it('throws when advancing from rejected', () => {
    expect(() => advanceDealStage('rejected')).toThrow();
  });

  it('error message mentions the blocked stage', () => {
    expect(() => advanceDealStage('closed')).toThrow(/closed/);
    expect(() => advanceDealStage('rejected')).toThrow(/rejected/);
  });
});

// ---------------------------------------------------------------------------
// rejectDeal
// ---------------------------------------------------------------------------

describe('rejectDeal — basic rejection', () => {
  it.each([
    'nda_pending',
    'screening',
    'meeting_scheduled',
    'deep_dd',
    'ic_memo',
    'bidding',
  ] as DealStage[])(
    'can reject from stage %s',
    (stage) => {
      const t = rejectDeal(stage, 'Valuation too high');
      expect(t.from).toBe(stage);
      expect(t.to).toBe('rejected');
    },
  );

  it('records the rejection reason as notes', () => {
    const t = rejectDeal('screening', 'Management integrity concerns');
    expect(t.notes).toBe('Management integrity concerns');
  });

  it('returns a valid ISO-8601 timestamp', () => {
    const t = rejectDeal('deep_dd', 'Margin of safety insufficient');
    expect(new Date(t.transitionedAt).toISOString()).toBe(t.transitionedAt);
  });
});

describe('rejectDeal — revisitAfter', () => {
  it('includes revisitAfter when provided', () => {
    const t = rejectDeal('screening', 'Price too high', '2027-06-01');
    expect(t.revisitAfter).toBe('2027-06-01');
  });

  it('omits revisitAfter when not provided', () => {
    const t = rejectDeal('screening', 'Price too high');
    expect(t.revisitAfter).toBeUndefined();
  });
});

describe('rejectDeal — terminal stage errors', () => {
  it('throws when rejecting a closed deal', () => {
    expect(() => rejectDeal('closed', 'second thoughts')).toThrow();
  });

  it('error message mentions closed when rejecting closed', () => {
    expect(() => rejectDeal('closed', 'reason')).toThrow(/closed/);
  });

  it('throws when deal is already rejected', () => {
    expect(() => rejectDeal('rejected', 'double reject')).toThrow();
  });
});
