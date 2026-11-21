import type { PrismaClient } from '@prisma/client';
import { SEED_ADMIN_EMAIL, SEED_ADMIN_ROLES, SYSTEM_ADMIN_ROLE } from '@school-erp/shared';
import { hashPassword, normalizeEmail } from '../../src/common/utils/password.util';
import { STAGE_HEADS } from './data/november';

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

/**
 * The demo stage heads (§4 two steps, owner 2026-11-21): one account per `STAGE_HEADS` entry,
 * linked to that employee ("Who is this person in HR?"), with the Stage head role and the admin's
 * password. Returns each of their stages' ids → the head's user id (the seed reviews as them). A
 * deleted Stage head role stays deleted: the accounts are made without it.
 */
export async function seedStageHeads(
  prisma: PrismaClient,
  employeeIds: Map<number, string>,
): Promise<Map<string, string>> {
  const passwordHash = await hashPassword(process.env.SEED_ADMIN_PASSWORD!);
  const role = await prisma.role.findUnique({ where: { key: 'stage_head' }, select: { id: true } });
  const out = new Map<string, string>();
  for (const head of STAGE_HEADS) {
    const employeeId = employeeIds.get(head.employee)!;
    const email = normalizeEmail(head.email);
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash, name: head.name, employeeId },
      update: { passwordHash, isActive: true, mustChangePassword: false },
      select: { id: true },
    });
    if (role) {
      await prisma.userRoleAssignment.createMany({
        data: [{ userId: user.id, roleId: role.id }],
        skipDuplicates: true,
      });
    }
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { stageId: true, otherStages: { select: { stageId: true } } },
    });
    for (const stageId of [employee!.stageId, ...employee!.otherStages.map((st) => st.stageId)]) {
      out.set(stageId, user.id);
    }
  }
  return out;
}
