/**
 * Seed entry point (`pnpm --filter api db:seed`). Does nothing yet.
 * T2 adds `seed/admin.ts` (the HR admin); T16 composes the full demo seed here.
 * Client material (school name, logo, catalogue text) lives in `prisma/seed-data.local/`
 * (git-ignored) — never in tracked files.
 */
async function main(): Promise<void> {
  // Intentionally empty until T2 / T16.
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
