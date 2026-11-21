import { registerDecorator, ValidationOptions } from 'class-validator';
import { isIsoDate, todayIsoDate } from '../utils/dates.util';

/** A real calendar day written `YYYY-MM-DD`. */
export function IsIsoDate(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) =>
    registerDecorator({
      name: 'isIsoDate',
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: `${String(propertyName)} must be a date in YYYY-MM-DD format`,
        ...options,
      },
      validator: { validate: (value: unknown) => isIsoDate(value) },
    });
}

/** A `YYYY-MM-DD` date that is today or earlier, on the school's clock (`todayIsoDate`). */
export function IsNotFutureDate(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) =>
    registerDecorator({
      name: 'isNotFutureDate',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: `${String(propertyName)} must not be in the future`, ...options },
      // ISO dates compare correctly as strings.
      validator: { validate: (value: unknown) => isIsoDate(value) && value <= todayIsoDate() },
    });
}
