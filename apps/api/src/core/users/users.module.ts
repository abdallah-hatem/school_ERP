import { Module } from '@nestjs/common';
import { AuditModule } from '../audit';
import { RolesModule } from '../roles';
import { UsersRepository } from './repositories/users.repository';
import { UserAccountsService } from './user-accounts.service';
import { AccountController, UsersController } from './users.controller';
import { UsersService } from './users.service';

/** core/users — the people who sign in, and their administration. Exports only the sign-in service. */
@Module({
  imports: [AuditModule, RolesModule],
  controllers: [UsersController, AccountController],
  providers: [UsersService, UserAccountsService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
