import { registerDecorator, ValidationOptions } from 'class-validator';
import { isMonth } from '../utils/dates.util';

/** A calendar month written `YYYY-MM` (`2026-11`). */
export function IsMonth(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) =>
    registerDecorator({
      name: 'isMonth',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: `${String(propertyName)} must be a month in YYYY-MM format`, ...options },
      validator: { validate: (value: unknown) => isMonth(value) },
    });
}
