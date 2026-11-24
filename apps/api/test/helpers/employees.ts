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
  // A contract's signed copy pages are kept forever too (`employee_contract_files.contract_id` RESTRICT).
  await db.employeeContractFile.deleteMany({ where: { contract: { employee: args.where ?? {} } } });
  await db.employeeContract.deleteMany({ where: { employee: args.where ?? {} } });
  return db.employee.deleteMany(args);
}
