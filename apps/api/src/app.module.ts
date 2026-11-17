import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AppConfigModule } from './config';
import { CoreModule } from './core';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { HrModule } from './modules/hr';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    // In-memory domain events (docs/ARCHITECTURE.md → How modules talk). Emit after commit.
    EventEmitterModule.forRoot(),
    HealthModule,
    CoreModule,
    HrModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
