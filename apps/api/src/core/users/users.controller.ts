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
import type { ApiResponse, AuthUser, UserAccount } from '@school-erp/shared';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseUtil } from '../../common/utils/response.util';
import { Audited } from '../audit';
import { Permission, SignedIn } from '../permissions';
import {
  ChangePasswordDto,
  CreateUserDto,
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

  /** A temporary password: the user must change it, and their sessions end. */
  @Post(':id/password')
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

  @Post('password')
  @SignedIn()
  @Audited('core.user.change_password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(@CurrentUser() me: AuthUser, @Body() dto: ChangePasswordDto): Promise<void> {
    return this.accounts.changeOwnPassword(me, dto);
  }
}
