import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { Prisma } from '@prisma/client';
import type { TaxRule } from '@school-erp/shared';
import type { DbAdapter } from '../../../database/transactions';

/** Before any month: the rule as it stood when its history started being kept. */
export const BASELINE_EFFECTIVE_FROM = new Date('1970-01-01T00:00:00.000Z');

/**
 * The payroll tax rule's history (§10): one row per saved version, from the moment it took
 * effect — accounting's own table. Runs in the caller's transaction when one is open, so a
 * version commits with the setting it records.
 */
@Injectable()
export class AccountingTaxRuleRepository {
  constructor(private readonly txHost: TransactionHost<DbAdapter>) {}

  private get db() {
    return this.txHost.tx;
  }

  async add(rule: TaxRule, effectiveFrom: Date, changedById: string | null): Promise<void> {
    await this.db.accountingTaxRuleVersion.create({
      data: { rule: rule as unknown as Prisma.InputJsonValue, effectiveFrom, changedById },
      select: { id: true },
    });
  }

  /** The version in force at `at` (the latest one that took effect by then), or null. */
  async inForceAt(at: Date): Promise<TaxRule | null> {
    const row = await this.db.accountingTaxRuleVersion.findFirst({
      where: { effectiveFrom: { lte: at } },
      orderBy: { effectiveFrom: 'desc' },
      select: { rule: true },
    });
    return row ? (row.rule as unknown as TaxRule) : null;
  }

  async isEmpty(): Promise<boolean> {
    return (await this.db.accountingTaxRuleVersion.count()) === 0;
  }
}
