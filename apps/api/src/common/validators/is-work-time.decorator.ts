import { isOnWorkTimeStep, WORK_TIME } from '@school-erp/shared';
import { ValidateBy, ValidationOptions, buildMessage } from 'class-validator';

/**
 * A work start / end time: `HH:mm`, 24-hour, on a 30-minute boundary (§7: 07:30 yes, 07:15 no).
 * Wraps the shared `isOnWorkTimeStep` so the API and the screen apply one rule.
 */
export function IsWorkTime(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isWorkTime',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isOnWorkTimeStep(value),
        defaultMessage: buildMessage(
          (prefix) => `${prefix}$property must be HH:mm on a ${WORK_TIME.stepMinutes}-minute boundary`,
          options,
        ),
      },
    },
    options,
  );
}
