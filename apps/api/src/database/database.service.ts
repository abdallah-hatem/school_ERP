import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

/** The generated search columns: never read into rows (docs/ARCHITECTURE.md → Search). */
const SEARCH_COLUMNS = { searchText: true, searchCompact: true } as const;

/**
 * The searched models. Their `search_text` / `search_compact` are filtered on (common/repositories/
 * search.ts), never returned — a row without an explicit `select` doesn't carry them to a response.
 */
export const SEARCH_OMIT = {
  user: SEARCH_COLUMNS,
  role: SEARCH_COLUMNS,
  auditEntry: SEARCH_COLUMNS,
  stage: SEARCH_COLUMNS,
  department: SEARCH_COLUMNS,
  jobTitle: SEARCH_COLUMNS,
  employeeGrade: SEARCH_COLUMNS,
  employee: SEARCH_COLUMNS,
  violation: SEARCH_COLUMNS,
  penaltyAction: SEARCH_COLUMNS,
  contractTemplate: SEARCH_COLUMNS,
  payrollLine: SEARCH_COLUMNS,
  accountingPayrollLine: SEARCH_COLUMNS,
} as const;

/** The Prisma client. Injected only into repositories (house lint rule). */
@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({ datasources: { db: { url: config.getOrThrow<string>('databaseUrl') } }, omit: SEARCH_OMIT });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
