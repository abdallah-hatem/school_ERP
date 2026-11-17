import { UserRole, type PrismaClient } from '@prisma/client';
import { SEED_ADMIN_EMAIL } from '@school-erp/shared';
import { hashPassword, normalizeEmail } from '../../src/common/utils/password.util';

/** Shortest password the seed accepts for the HR admin. */
const MIN_PASSWORD_LENGTH = 12;

/**
 * The one HR admin (§2: accounts come from the seed). The password comes from
 * `SEED_ADMIN_PASSWORD` — required, never defaulted in code. Re-running the seed resets the
 * password to the env value and reactivates the account.
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
  await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, name: 'HR Admin', role: UserRole.HR_ADMIN },
    update: { passwordHash, isActive: true, role: UserRole.HR_ADMIN },
  });
  console.log(`seed: HR admin ready (${email})`);
}
