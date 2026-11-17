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

/** `/hr/employees` (contract). No DELETE: employees are deactivated, never deleted (§3). */
@Controller('hr/employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  async list(@Query() query: ListEmployeesQueryDto) {
    return ResponseUtil.paginated(await this.employees.list(query));
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.get(id);
  }

  @Post()
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.deactivate(id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.reactivate(id);
  }
}
