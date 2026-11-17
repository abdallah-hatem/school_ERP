import { UserRole, type PrismaClient } from '@prisma/client';
import { SEED_ADMIN_EMAIL, SEED_ADMIN_ROLES } from '@school-erp/shared';
import { hashPassword, normalizeEmail } from '../../src/common/utils/password.util';

/** Shortest password the seed accepts for the HR admin. */
const MIN_PASSWORD_LENGTH = 12;

/**
 * The seeded admin (§2), with the roles System admin + HR manager (spec P2; the roles themselves
 * come from the P2 migration). The password comes from `SEED_ADMIN_PASSWORD` — required, never
 * defaulted in code. Re-running the seed resets the password to the env value, reactivates the
 * account and gives back the two roles if they were taken away.
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
    create: { email, passwordHash, name: 'HR Admin', role: UserRole.HR_ADMIN },
    update: { passwordHash, isActive: true, role: UserRole.HR_ADMIN },
    select: { id: true },
  });
  const roles = await prisma.role.findMany({
    where: { key: { in: [...SEED_ADMIN_ROLES] } },
    select: { id: true },
  });
  if (roles.length !== SEED_ADMIN_ROLES.length) {
    throw new Error('seed: the starting roles are missing — run the migrations first');
  }
  await prisma.userRoleAssignment.createMany({
    data: roles.map((r) => ({ userId: admin.id, roleId: r.id })),
    skipDuplicates: true,
  });
  console.log(`seed: HR admin ready (${email})`);
}
