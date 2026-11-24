import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '@school-erp/shared';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { CreateListItemDto, ListItemsQueryDto, UpdateListItemDto, wantsPage } from '../dto/list-item.dto';
import { ResponseUtil } from '../../../../common/utils/response.util';
import { EmployeeGradesService } from '../services/employee-grades.service';
import { Audited } from '../../../../core/audit';
import { Permission } from '../../../../core/permissions';

/** `/hr/employee-grades` — GET, POST, PATCH :id (§3, owner 2026-11-24). No DELETE: hide with `isActive: false`. */
@Controller('hr/employee-grades')
export class EmployeeGradesController {
  constructor(private readonly employeeGrades: EmployeeGradesService) {}

  @Get()
  @Permission('hr.lists.view')
  async list(@Query() query: ListItemsQueryDto) {
    // A page (Settings) or the whole list (a form's or filter's choices).
    if (wantsPage(query)) return ResponseUtil.paginated(await this.employeeGrades.page(query));
    return this.employeeGrades.list(query.includeHidden);
  }

  @Audited('hr.employee_grade.create')
  @Post()
  @Permission('hr.lists.manage')
  create(@Body() dto: CreateListItemDto, @CurrentUser() user?: AuthUser) {
    return this.employeeGrades.create(dto, user?.id ?? null);
  }

  @Audited('hr.employee_grade.update')
  @Patch(':id')
  @Permission('hr.lists.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListItemDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.employeeGrades.update(id, dto, user?.id ?? null);
  }
}
