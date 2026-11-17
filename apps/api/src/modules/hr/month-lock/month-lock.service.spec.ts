import { ErrorCode } from '@school-erp/shared';
import { CodedException } from '../../../common/errors/coded.exception';
import { MonthLockService } from './month-lock.service';
import type { MonthLockRepository } from './repositories/month-lock.repository';

function makeService(hasApprovedRun: boolean) {
  const repository = { hasApprovedRun: jest.fn().mockResolvedValue(hasApprovedRun) };
  const service = new MonthLockService(repository as unknown as MonthLockRepository);
  return { service, repository };
}

describe('MonthLockService', () => {
  it('isMonthLocked asks for an APPROVED run of that month', async () => {
    const { service, repository } = makeService(true);
    await expect(service.isMonthLocked('2026-11')).resolves.toBe(true);
    expect(repository.hasApprovedRun).toHaveBeenCalledWith('2026-11');
  });

  it('isMonthLocked is false when there is no approved run', async () => {
    const { service } = makeService(false);
    await expect(service.isMonthLocked('2026-11')).resolves.toBe(false);
  });

  it('rejects a malformed month without querying', async () => {
    const { service, repository } = makeService(false);
    for (const bad of ['2026-13', '2026-1', '26-11', '2026-11-01', '']) {
      await expect(service.isMonthLocked(bad)).rejects.toThrow(RangeError);
    }
    expect(repository.hasApprovedRun).not.toHaveBeenCalled();
  });

  it('assertMonthOpen throws 409 PAYROLL_APPROVED on a locked month', async () => {
    const { service } = makeService(true);
    const error = await service.assertMonthOpen('2026-11').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CodedException);
    expect((error as CodedException).getStatus()).toBe(409);
    expect((error as CodedException).code).toBe(ErrorCode.PAYROLL_APPROVED);
  });

  it('assertMonthOpen passes on an open month', async () => {
    const { service } = makeService(false);
    await expect(service.assertMonthOpen('2026-11')).resolves.toBeUndefined();
  });
});
