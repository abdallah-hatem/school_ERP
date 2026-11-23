/**
 * Release check, read-only (security review, owner 2026-11-23; `docs/demo/DRY_RUN.md`): the active
 * accounts that aren't System admins, hold a permission acting on pay or penalties
 * (`PAY_AND_PENALTY_KEYS` in packages/shared — the same list the API enforces) and have no employee
 * record. Since 2026-11-23 they are refused those actions until a System admin links them
 * (Users → the account → "Who is this person in HR?"), so link them before the release.
 *
 *   cd apps/api && DATABASE_URL="postgresql://…/school_erp_dryrun?schema=public" \
 *     pnpm exec ts-node --transpile-only prisma/checks/unlinked-pay-accounts.ts
 *
 * Prints one line per account and exits 1 when there is any (0 when none). Writes nothing.
 */
import { PrismaClient } from '@prisma/client';
import { PAY_AND_PENALTY_KEYS, SYSTEM_ADMIN_ROLE } from '@school-erp/shared';

export interface UnlinkedPayAccount {
  email: string;
  name: string;
  /** The pay- or penalty-acting permissions their roles give. */
  permissions: string[];
}

/** The accounts to link before the release. */
export async function unlinkedPayAccounts(
  prisma: Pick<PrismaClient, 'user'>,
): Promise<UnlinkedPayAccount[]> {
  const keys: string[] = [...PAY_AND_PENALTY_KEYS];
  const rows = await prisma.user.findMany({
    where: {
      isActive: true,
      employeeId: null,
      roles: { some: { role: { permissions: { some: { permissionKey: { in: keys } } } } } },
      NOT: { roles: { some: { role: { key: SYSTEM_ADMIN_ROLE } } } },
    },
    select: {
      email: true,
      name: true,
      roles: { select: { role: { select: { permissions: { select: { permissionKey: true } } } } } },
    },
    orderBy: { email: 'asc' },
  });
  return rows.map((row) => ({
    email: row.email,
    name: row.name,
    permissions: [
      ...new Set(row.roles.flatMap((r) => r.role.permissions.map((p) => p.permissionKey)).filter((k) => keys.includes(k))),
    ].sort(),
  }));
}

if (require.main === module) {
  const prisma = new PrismaClient();
  unlinkedPayAccounts(prisma)
    .then((found) => {
      if (found.length === 0) {
        console.log('unlinked-pay-accounts: none — every account acting on pay is linked.');
        return;
      }
      console.log(`unlinked-pay-accounts: ${found.length} account(s) to link before the release:`);
      for (const a of found) console.log(`  ${a.email}  (${a.name})  ${a.permissions.join(', ')}`);
      process.exitCode = 1;
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 2;
    })
    .finally(() => void prisma.$disconnect());
}
