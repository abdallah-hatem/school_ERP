import { NotFoundException } from '@nestjs/common';
import { DEFAULT_TAX_RULE } from '@school-erp/shared';
import type { TransactionHost } from '@nestjs-cls/transactional';
import type { AuditService } from '../../../../core/audit';
import type { DbAdapter } from '../../../../database/transactions';
import type { EmployeesService, PayrollService } from '../../../hr';
import type { AccountingSettingsService } from '../../settings/accounting-settings.service';
import type { AccountingPayrollRepository } from '../repositories/accounting-payroll.repository';
import { AccountingPayrollService } from './accounting-payroll.service';

const line = (employeeId: string, net: number) => ({
  employeeId,
  employeeCode: `EMP-${employeeId}`,
  nameEn: `Name ${employeeId}`,
  nameAr: `اسم ${employeeId}`,
  net,
});

function makeService(opts: { status?: 'DRAFT' | 'APPROVED'; recorded?: boolean; created?: boolean } = {}) {
  const run =
    (opts.status ?? 'APPROVED') === 'APPROVED'
      ? { month: '2026-11', lines: [line('a', 1_200_000), line('b', 1_200_000), line('c', 0)] }
      : null;
  const repository = {
    findByHrRun: jest.fn(() => Promise.resolve(opts.recorded ? { id: 'acc-run' } : null)),
    findByMonth: jest.fn(() => Promise.resolve(null)),
    create: jest.fn(() => Promise.resolve(opts.created === false ? null : { id: 'acc-run', month: '2026-11' })),
  };
  const hrPayroll = {
    approvedLinesForAccounting: jest.fn(() => Promise.resolve(run)),
    approvedRunIdForMonth: jest.fn(() => Promise.resolve(null)),
  };
  const employees = {
    insuranceFor: jest.fn(() =>
      Promise.resolve([
        { id: 'a', insuranceStatus: 'NOT_INSURED', insuredSalary: null },
        { id: 'b', insuranceStatus: 'INSURED', insuredSalary: 500_000 },
        { id: 'c', insuranceStatus: 'INSURED', insuredSalary: 500_000 },
      ]),
    ),
  };
  const settings = { taxRule: jest.fn(() => Promise.resolve(DEFAULT_TAX_RULE)) };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const txHost = { withTransaction: jest.fn((_p: unknown, fn: () => unknown) => fn()) };
  const service = new AccountingPayrollService(
    repository as unknown as AccountingPayrollRepository,
    settings as unknown as AccountingSettingsService,
    hrPayroll as unknown as PayrollService,
    employees as unknown as EmployeesService,
    audit as unknown as AuditService,
    txHost as unknown as TransactionHost<DbAdapter>,
  );
  return { service, repository, hrPayroll, audit };
}

describe('AccountingPayrollService.recordApprovedRun', () => {
  it('works out every line of an approved month with the tax rule and each employee\'s insurance, and records it', async () => {
    const { service, repository, audit } = makeService();
    await service.recordApprovedRun('hr-run');
    const [data, lines] = (repository.create.mock.calls[0] as unknown as [unknown, unknown[]]);
    expect(data).toEqual({ hrRunId: 'hr-run', month: '2026-11', taxRule: DEFAULT_TAX_RULE });
    // Net 12,000 not insured → 1,517.32 / 6.76 / 13,524.08; insured 5,000 → 550 / 1,517.38 / 7.04 / 14,074.42.
    expect(lines).toEqual([
      expect.objectContaining({ employeeId: 'a', net: 1_200_000, insuranceStatus: 'NOT_INSURED', insuranceAmount: 0, incomeTax: 151_732, martyrTax: 676, gross: 1_352_408 }),
      expect.objectContaining({ employeeId: 'b', insuranceStatus: 'INSURED', insuredSalary: 500_000, insuranceAmount: 55_000, incomeTax: 151_738, martyrTax: 704, gross: 1_407_442 }),
      // Net floored at 0, insured: the school still pays the insurance share and its fund.
      expect.objectContaining({ employeeId: 'c', net: 0, insuranceAmount: 55_000, incomeTax: 0, martyrTax: 28, gross: 55_028 }),
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'accounting.payroll.record', actor: null }),
    );
  });

  it('a month already recorded (the event delivered twice) is left alone', async () => {
    const { service, repository, hrPayroll } = makeService({ recorded: true });
    await expect(service.recordApprovedRun('hr-run')).resolves.toBeNull();
    expect(hrPayroll.approvedLinesForAccounting).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('a run that is not approved records nothing', async () => {
    const { service, repository } = makeService({ status: 'DRAFT' });
    await expect(service.recordApprovedRun('hr-run')).resolves.toBeNull();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('lost the race to another delivery (unique key) → no audit entry', async () => {
    const { service, audit } = makeService({ created: false });
    await expect(service.recordApprovedRun('hr-run')).resolves.toBeNull();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('a month HR never approved → 404', async () => {
    const { service } = makeService();
    await expect(service.getMonth('2026-12')).rejects.toBeInstanceOf(NotFoundException);
  });
});
