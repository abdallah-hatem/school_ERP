import type { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../src/database/database.service';

/** The e2e database URL (checked by setup-env.ts to be an `_e2e` database). */
export function e2eDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('e2e: DATABASE_URL is required');
  return url;
}

/**
 * A database client whose search_path is `schema` of the e2e database — for tests that build a
 * throwaway schema (e.g. replaying migrations). Disconnect it when done.
 */
export function clientForSchema(schema: string): DatabaseService {
  const url = new URL(e2eDatabaseUrl());
  url.searchParams.set('schema', schema);
  const config = { getOrThrow: () => url.toString() } as unknown as ConfigService;
  return new DatabaseService(config);
}
