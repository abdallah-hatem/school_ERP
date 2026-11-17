import { ValidateIf, ValidationOptions } from 'class-validator';

/**
 * Like `@IsOptional()`, but only a missing field is skipped: an explicit `null` still runs the
 * other validators and fails them. Use it on PATCH fields that must never be cleared.
 */
export function IsOptionalNotNull(options?: ValidationOptions): PropertyDecorator {
  return ValidateIf((_object: unknown, value: unknown) => value !== undefined, options);
}
