import {
  Body,
  Controller,
  Delete,
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
import { PAGINATION, type ApiResponse, type Role } from '@school-erp/shared';
import type { Request } from 'express';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ResponseUtil } from '../../common/utils/response.util';
import { Audited } from '../audit';
import { Permission } from '../permissions';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RolesService } from './roles.service';

/** Administration → Roles (spec P2; screens in P3). */
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @Permission('core.roles.view')
  async list(@Query() query: PaginationQueryDto, @Req() req: Request): Promise<ApiResponse<Role[]>> {
    const page = await this.roles.list(
      query.page ?? PAGINATION.defaultPage,
      query.limit ?? PAGINATION.defaultLimit,
    );
    return ResponseUtil.paginated(page, undefined, req.url);
  }

  @Get(':id')
  @Permission('core.roles.view')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Role> {
    return this.roles.get(id);
  }

  @Post()
  @Permission('core.roles.manage')
  @Audited('core.role.create')
  create(@Body() dto: CreateRoleDto): Promise<Role> {
    return this.roles.create(dto);
  }

  @Patch(':id')
  @Permission('core.roles.manage')
  @Audited('core.role.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto): Promise<Role> {
    return this.roles.update(id, dto);
  }

  /** A role nobody holds (held → 409 `ROLE_IN_USE`); the System admin → 409 `SYSTEM_ADMIN_UNDELETABLE`. */
  @Delete(':id')
  @Permission('core.roles.manage')
  @Audited('core.role.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.roles.remove(id);
  }
}
