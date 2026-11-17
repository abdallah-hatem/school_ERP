import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PermissionsModule } from '../permissions';
import { AuditController } from './audit.controller';
import { AuditRecordAccess } from './audit-record-access';
import { AuditService } from './audit.service';
import { AuditedInterceptor } from './interceptors/audited.interceptor';
import { AuditEntryRepository } from './repositories/audit-entry.repository';

/**
 * core/audit — the append-only audit log (§9). Exports `AuditService`, through which every module
 * records, and `AuditRecordAccess`, where a module says which of its records a viewer may read
 * (P4). Registers the `@Audited` run-time check globally (D6b).
 */
@Module({
  imports: [PermissionsModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditRecordAccess,
    AuditEntryRepository,
    { provide: APP_INTERCEPTOR, useClass: AuditedInterceptor },
  ],
  exports: [AuditService, AuditRecordAccess],
})
export class AuditModule {}
