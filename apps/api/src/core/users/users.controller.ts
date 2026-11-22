import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { ApiResponse, AuthUser, EmployeeOption, UserAccount } from '@school-erp/shared';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RateLimit } from '../../common/rate-limit';
import { ResponseUtil } from '../../common/utils/response.util';
import { Audited, NotAudited } from '../audit';
import { AllowedBeforePasswordChange, Permission, SignedIn } from '../permissions';
import {
  ChangePasswordDto,
  CreateUserDto,
  EmployeeOptionsQueryDto,
  ListUsersQueryDto,
  SetTemporaryPasswordDto,
  UpdateUserDto,
} from './dto/user.dto';
import { UserAccountsService } from './user-accounts.service';

/** Administration → Users (R9, spec P2; screens in P3). No delete: a user is deactivated. */
@Controller('users')
export class UsersController {
  constructor(private readonly accounts: UserAccountsService) {}

  @Get()
  @Permission('core.users.view')
  async list(
    @Query() query: ListUsersQueryDto,
    @Req() req: Request,
  ): Promise<ApiResponse<UserAccount[]>> {
    return ResponseUtil.paginated(await this.accounts.list(query), undefined, req.url);
  }

  /**
   * The linked-employee picker on the user form (P3): employees matching the search, each with the
   * account already linked to it. Needs `core.users.manage`, not HR's `hr.employees.view` — linking
   * is a user-account decision.
   */
  @Get('employee-options')
  @Permission('core.users.manage')
  async employeeOptions(
    @Query() query: EmployeeOptionsQueryDto,
    @Req() req: Request,
  ): Promise<ApiResponse<EmployeeOption[]>> {
    return ResponseUtil.paginated(await this.accounts.employeeOptions(query), undefined, req.url);
  }

  @Get(':id')
  @Permission('core.users.view')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<UserAccount> {
    return this.accounts.get(id);
  }

  @Post()
  @Permission('core.users.manage')
  @Audited('core.user.create')
  create(@Body() dto: CreateUserDto): Promise<UserAccount> {
    return this.accounts.create(dto);
  }

  @Patch(':id')
  @Permission('core.users.manage')
  @Audited('core.user.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto): Promise<UserAccount> {
    return this.accounts.update(id, dto);
  }

  /** Edge case 6 — the user's sessions end at once. The last System admin → 409. */
  @Post(':id/deactivate')
  @Permission('core.users.manage')
  @Audited('core.user.deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<UserAccount> {
    return this.accounts.deactivate(id);
  }

  @Post(':id/reactivate')
  @Permission('core.users.manage')
  @Audited('core.user.reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(@Param('id', ParseUUIDPipe) id: string): Promise<UserAccount> {
    return this.accounts.reactivate(id);
  }

  /**
   * Unlocks a sign-in locked by too many wrong passwords before the lock ends (owner 2026-11-18).
   * Answers the account (`lockedUntil: null`); an account that wasn't locked is left as it was.
   */
  @Post(':id/unlock-sign-in')
  @Permission('core.users.manage')
  @Audited('core.user.unlock_sign_in')
  @HttpCode(HttpStatus.OK)
  unlockSignIn(@Param('id', ParseUUIDPipe) id: string): Promise<UserAccount> {
    return this.accounts.unlockSignIn(id);
  }

  /** A temporary password: the user must change it, and their sessions end. */
  @Post(':id/password')
  @RateLimit('auth')
  @Permission('core.users.manage')
  @Audited('core.user.set_password')
  @HttpCode(HttpStatus.NO_CONTENT)
  setPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTemporaryPasswordDto,
  ): Promise<void> {
    return this.accounts.setTemporaryPassword(id, dto.password);
  }
}

/** My account (R9): what every signed-in user may do to their own account. */
@Controller('account')
export class AccountController {
  constructor(private readonly accounts: UserAccountsService) {}

  /** My account (P3): name, email, roles, linked employee, last sign-in, password changed. */
  @Get()
  @SignedIn()
  get(@CurrentUser() me: AuthUser): Promise<UserAccount> {
    return this.accounts.myAccount(me);
  }

  /**
   * Also the forced "Set a new password" step: a user with a temporary password may call this (and
   * only `/auth/me` and sign-out) until they have chosen their own (P3).
   */
  @Post('password')
  @RateLimit('auth')
  @SignedIn()
  @AllowedBeforePasswordChange()
  @NotAudited(
    'records core.user.change_password itself, in one transaction with the new password ' +
      '(UserAccountsService.changeOwnPassword): a request transaction would hold a pooled connection ' +
      "while a wrong password's count and lockout entry need another (docs/EVENTS.md)",
  )
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(@CurrentUser() me: AuthUser, @Body() dto: ChangePasswordDto): Promise<void> {
    return this.accounts.changeOwnPassword(me, dto);
  }
}
