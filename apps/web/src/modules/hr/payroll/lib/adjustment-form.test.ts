import { describe, expect, it } from 'vitest';
import { adjustmentFormSchema } from './adjustment-form';

const base = { type: 'ADDITION', reason: 'Exam supervision' };

describe('adjustment form — the monthly cap (owner 2026-11-19)', () => {
  it('accepts up to EGP 1,000,000.00 and refuses one piastre more', () => {
    expect(adjustmentFormSchema.safeParse({ ...base, amount: 100_000_000 }).success).toBe(true);
    const over = adjustmentFormSchema.safeParse({ ...base, amount: 100_000_001 });
    expect(over.success).toBe(false);
    expect(over.error?.issues.map((i) => i.message)).toContain('payroll.adjustments.amountMax');
  });
});
