import type { PrismaClient } from '@prisma/client';
import { SEED_ADMIN_EMAIL, SEED_ADMIN_ROLES, SYSTEM_ADMIN_ROLE } from '@school-erp/shared';
import { hashPassword, normalizeEmail } from '../../src/common/utils/password.util';

/** Shortest password the seed accepts for the HR admin. */
const MIN_PASSWORD_LENGTH = 12;

/**
 * The seeded admin (§2), with the roles System admin + HR manager (spec P2; the roles themselves
 * come from the P2 migration). The password comes from `SEED_ADMIN_PASSWORD` — required, never
 * defaulted in code. Re-running the seed resets the password to the env value, reactivates the
 * account and gives back the two roles if they were taken away (a deleted HR manager role stays
 * deleted).
 */
export async function seedAdmin(prisma: PrismaClient): Promise<void> {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `seed: SEED_ADMIN_PASSWORD is required (at least ${MIN_PASSWORD_LENGTH} characters)`,
    );
  }

  const email = normalizeEmail(SEED_ADMIN_EMAIL);
  const passwordHash = await hashPassword(password);
  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, name: 'HR Admin' },
    update: { passwordHash, isActive: true, mustChangePassword: false },
    select: { id: true },
  });
  const roles = await prisma.role.findMany({
    where: { key: { in: [...SEED_ADMIN_ROLES] } },
    select: { id: true, key: true },
  });
  if (!roles.some((r) => r.key === SYSTEM_ADMIN_ROLE)) {
    throw new Error('seed: the System admin role is missing — run the migrations first');
  }
  // A school may delete an unused starting role (owner 2026-11-19); the seed doesn't bring it back.
  for (const key of SEED_ADMIN_ROLES) {
    if (!roles.some((r) => r.key === key)) console.log(`seed: role ${key} was deleted; not given`);
  }
  await prisma.userRoleAssignment.createMany({
    data: roles.map((r) => ({ userId: admin.id, roleId: r.id })),
    skipDuplicates: true,
  });
  console.log(`seed: HR admin ready (${email})`);
}
