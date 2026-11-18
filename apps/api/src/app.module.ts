import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AppConfigModule } from './config';
import { CoreModule } from './core';
import { PermissionGuard } from './core/permissions';
import { DatabaseModule } from './database/database.module';
import { TransactionsModule } from './database/transactions';
import { HealthModule } from './health/health.module';
import { HrModule } from './modules/hr';
import { AccountingModule } from './modules/accounting';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    // Request context + request-scoped transactions (audit spec D3).
    TransactionsModule,
    // In-memory domain events (docs/ARCHITECTURE.md → How modules talk). Emit after commit.
    EventEmitterModule.forRoot(),
    HealthModule,
    CoreModule,
    HrModule,
    AccountingModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Global guards run in this order: who you are (401), then what you may do (403).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
