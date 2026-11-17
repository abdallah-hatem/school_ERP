/**
 * Seed entry point (`pnpm --filter api db:seed`). T16 composes the full demo seed here.
 * Client material (school name, logo, catalogue text) lives in `prisma/seed-data.local/`
 * (git-ignored) — never in tracked files.
 */
import { PrismaClient } from '@prisma/client';
import { seedAdmin } from './admin';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedAdmin(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
