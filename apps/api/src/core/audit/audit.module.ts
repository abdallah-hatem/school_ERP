import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditedInterceptor } from './interceptors/audited.interceptor';
import { AuditEntryRepository } from './repositories/audit-entry.repository';

/**
 * core/audit — the append-only audit log (§9). Exports only `AuditService`; every module records
 * through it. Registers the `@Audited` run-time check globally (D6b).
 */
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditEntryRepository,
    { provide: APP_INTERCEPTOR, useClass: AuditedInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
