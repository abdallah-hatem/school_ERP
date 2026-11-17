import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Validates with a shared rule from `@school-erp/shared` (so the API and the form check the same
 * thing): the value passes when `rule(value)` is true. `message` reads like `"iban must be …"`.
 */
export function Satisfies<T>(
  rule: (value: T) => boolean,
  message: string,
  options?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol) =>
    registerDecorator({
      name: 'satisfies',
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: `${String(propertyName)} ${message}`, ...options },
      validator: { validate: (value: unknown) => rule(value as T) },
    });
}
