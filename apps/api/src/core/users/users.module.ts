import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { RolesModule } from '../roles';
import { SignInLimitModule } from '../sign-in-limit';
import { UsersRepository } from './repositories/users.repository';
import { UserAccountsService } from './user-accounts.service';
import { AccountController, UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SessionRevocation } from './session-revocation';

/** core/users — the people who sign in, and their administration. Exports only the sign-in service. */
@Module({
  imports: [AuditModule, RolesModule, SignInLimitModule],
  controllers: [UsersController, AccountController],
  providers: [UsersService, UserAccountsService, UsersRepository, SessionRevocation],
  exports: [UsersService, SessionRevocation],
})
export class UsersModule {}
