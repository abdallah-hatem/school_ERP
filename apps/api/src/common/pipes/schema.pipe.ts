import { BadRequestException, type PipeTransform } from '@nestjs/common';

/** What the pipe needs of a schema: zod's `safeParse` (the schemas live in `@school-erp/shared`). */
export interface ParsingSchema<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] } };
}

/**
 * Validates a request part with a shared zod schema — the one contract the web app uses too —
 * and passes on the parsed value. A failure is the same 400 `VALIDATION_FAILED` as the DTOs give
 * (a `message` list, one line per issue). Use it on a parameter typed as a plain object, so the
 * global `ValidationPipe` leaves it alone: `@Query(new SchemaPipe(schema)) query: Parsed`.
 */
export class SchemaPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ParsingSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    throw new BadRequestException({
      message: result.error.issues.map((i) => (i.path.length ? `${i.path.map(String).join('.')}: ${i.message}` : i.message)),
    });
  }
}
