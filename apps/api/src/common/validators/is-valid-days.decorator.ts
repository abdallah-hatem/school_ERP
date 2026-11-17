import { isValidDays, SETTING_LIMITS } from '@school-erp/shared';
import { ValidateBy, ValidationOptions, buildMessage } from 'class-validator';

/**
 * A day count in quarter steps from 0 to 30 (§7: 0, 0.25, 0.5 … 30; not 0.3, −0.25 or 30.25).
 * Wraps the shared `isValidDays` so the API and the screens apply one rule.
 */
export function IsValidDays(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isValidDays',
      validator: {
        validate: (value: unknown) => typeof value === 'number' && isValidDays(value),
        defaultMessage: buildMessage(
          (prefix) =>
            `${prefix}$property must be a multiple of ${SETTING_LIMITS.daysStep} from ${SETTING_LIMITS.daysMin} to ${SETTING_LIMITS.daysMax}`,
          options,
        ),
      },
    },
    options,
  );
}
