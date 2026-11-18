import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '@school-erp/shared';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { CreateListItemDto, ListItemsQueryDto, UpdateListItemDto } from '../dto/list-item.dto';
import { DepartmentsService } from '../services/departments.service';
import { Audited } from '../../../../core/audit';
import { Permission } from '../../../../core/permissions';

/** `/hr/departments` — GET, POST, PATCH :id. No DELETE: hide with `isActive: false` (§3). */
@Controller('hr/departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  @Permission('hr.lists.view')
  list(@Query() query: ListItemsQueryDto) {
    return this.departments.list(query.includeHidden);
  }

  @Audited('hr.department.create')
  @Post()
  @Permission('hr.lists.manage')
  create(@Body() dto: CreateListItemDto, @CurrentUser() user?: AuthUser) {
    return this.departments.create(dto, user?.id ?? null);
  }

  @Audited('hr.department.update')
  @Patch(':id')
  @Permission('hr.lists.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListItemDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.departments.update(id, dto, user?.id ?? null);
  }
}
