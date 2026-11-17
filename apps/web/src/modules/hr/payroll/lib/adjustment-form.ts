import { ADJUSTMENT_TYPES, AdjustmentType, type CreateAdjustmentRequest, type Uuid } from '@school-erp/shared';
import { z } from 'zod';

/** Largest single adjustment the API accepts: EGP 10,000,000.00 (`MAX_ADJUSTMENT_PIASTRES`). */
export const ADJUSTMENT_MAX_PIASTRES = 1_000_000_000;
export const ADJUSTMENT_REASON_MAX = 500;

/** Messages are translation keys so one schema serves both languages. */
export const adjustmentFormSchema = z.object({
  type: z.string().refine((v) => (ADJUSTMENT_TYPES as string[]).includes(v), 'ui.form.required'),
  amount: z
    .number({ error: 'payroll.adjustments.amountRequired' })
    .nullable()
    .refine((v) => v !== null && Number.isInteger(v) && v > 0, 'payroll.adjustments.amountRequired')
    .refine((v) => v === null || v <= ADJUSTMENT_MAX_PIASTRES, 'payroll.adjustments.amountMax'),
  reason: z
    .string()
    .trim()
    .min(1, 'payroll.adjustments.reasonRequired')
    .max(ADJUSTMENT_REASON_MAX, 'payroll.adjustments.reasonRequired'),
});

export type AdjustmentFormValues = z.input<typeof adjustmentFormSchema>;

export const EMPTY_ADJUSTMENT: AdjustmentFormValues = {
  type: AdjustmentType.ADDITION,
  amount: null,
  reason: '',
};

/** The request body for a valid form. */
export function toAdjustmentRequest(employeeId: Uuid, values: AdjustmentFormValues): CreateAdjustmentRequest {
  return {
    employeeId,
    type: values.type as AdjustmentType,
    amount: values.amount ?? 0,
    reason: values.reason.trim(),
  };
}
