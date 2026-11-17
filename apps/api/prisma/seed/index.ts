/**
 * Seed entry point (`pnpm --filter api db:seed`): the HR admin plus the full demo data (see
 * `run.ts`). Needs `SEED_ADMIN_PASSWORD`. Client material (school name, logo, catalogue text)
 * lives in `prisma/seed-data.local/` (git-ignored) — never in tracked files; without it the seed
 * uses a generic fallback.
 *
 * Runs under ts-node (not tsx): Nest's dependency injection needs the decorator metadata that
 * esbuild-based runners don't emit.
 */
import { runSeed } from './run';

runSeed()
  .then((summary) => console.log(`seed: done (${JSON.stringify(summary)})`))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
