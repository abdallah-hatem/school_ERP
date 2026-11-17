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
} from '@nestjs/common';
import { ResponseUtil } from '../../../../common/utils/response.util';
import { CreateEmployeeDto, ListEmployeesQueryDto, UpdateEmployeeDto } from '../dto/employee.dto';
import { EmployeesService } from '../services/employees.service';
import { NotAudited } from '../../../../core/audit';
import { Permission } from '../../../../core/permissions';

/** `/hr/employees` (contract). No DELETE: employees are deactivated, never deleted (§3). */
@Controller('hr/employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @Permission('hr.employees.view')
  async list(@Query() query: ListEmployeesQueryDto) {
    return ResponseUtil.paginated(await this.employees.list(query));
  }

  @Get(':id')
  @Permission('hr.employees.view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.get(id);
  }

  @NotAudited('wired in T28')
  @Post()
  @Permission('hr.employees.create')
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @NotAudited('wired in T28')
  @Patch(':id')
  @Permission('hr.employees.edit')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(id, dto);
  }

  @NotAudited('wired in T28')
  @Post(':id/deactivate')
  @Permission('hr.employees.change_status')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.deactivate(id);
  }

  @NotAudited('wired in T28')
  @Post(':id/reactivate')
  @Permission('hr.employees.change_status')
  @HttpCode(HttpStatus.OK)
  reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.reactivate(id);
  }
}
