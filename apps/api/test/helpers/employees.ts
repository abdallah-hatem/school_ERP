import type { Prisma } from '@prisma/client';
import type { DatabaseService } from '../../src/database/database.service';

/*
 * Test cleanup of employees. Employees are never deleted in the app (§3) and their contracts are
 * kept forever (`employee_contracts.employee_id` is ON DELETE RESTRICT), so a suite removing its own
 * employees removes their contracts first. Same arguments as `db.employee.deleteMany`.
 */
export async function deleteEmployees(
  db: DatabaseService,
  args: { where?: Prisma.EmployeeWhereInput } = {},
): Promise<Prisma.BatchPayload> {
  await db.employeeContract.deleteMany({ where: { employee: args.where ?? {} } });
  return db.employee.deleteMany(args);
}
