import { INestApplication } from '@nestjs/common';
import { DatabaseService } from '../src/database/database.service';
import { MonthLockService } from '../src/modules/hr/month-lock/month-lock.service';
import { createAppAsTestUser } from './helpers/as-test-user';

// Months far from any real data, so this suite owns its rows.
const NO_RUN = '2099-01';
const DRAFT = '2099-02';
const APPROVED = '2099-03';

describe('MonthLockService.isMonthLocked (e2e, real PayrollRun rows)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let lock: MonthLockService;

  beforeAll(async () => {
    ({ app } = await createAppAsTestUser());
    db = app.get(DatabaseService);
    lock = app.get(MonthLockService);
    await db.payrollRun.deleteMany({ where: { month: { in: [NO_RUN, DRAFT, APPROVED] } } });
    await db.payrollRun.create({ data: { month: DRAFT, status: 'DRAFT' } });
    await db.payrollRun.create({
      data: { month: APPROVED, status: 'APPROVED', approvedAt: new Date() },
    });
  });

  afterAll(async () => {
    await db.payrollRun.deleteMany({ where: { month: { in: [NO_RUN, DRAFT, APPROVED] } } });
    await app.close();
  });

  it('isMonthLocked: no run → false; draft run → false; approved run → true', async () => {
    await expect(lock.isMonthLocked(NO_RUN)).resolves.toBe(false);
    await expect(lock.isMonthLocked(DRAFT)).resolves.toBe(false);
    await expect(lock.isMonthLocked(APPROVED)).resolves.toBe(true);
  });

  it('assertMonthOpen: 409 PAYROLL_APPROVED only for the approved month', async () => {
    await expect(lock.assertMonthOpen(DRAFT)).resolves.toBeUndefined();
    await expect(lock.assertMonthOpen(APPROVED)).rejects.toMatchObject({
      code: 'PAYROLL_APPROVED',
    });
  });
});
