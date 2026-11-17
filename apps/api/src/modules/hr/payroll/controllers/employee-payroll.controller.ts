import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
import { ResponseUtil } from '../../../../common/utils/response.util';
import { PayrollService } from '../services/payroll.service';
import { Permission } from '../../../../core/permissions';

/**
 * An employee's payroll history (profile Payroll tab): their line in each run, newest month
 * first, from the line snapshots. Lives with payroll because it reads payroll lines.
 */
@Controller('hr/employees')
export class EmployeePayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get(':id/payroll-lines')
  @Permission('hr.payroll.view')
  async list(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return ResponseUtil.paginated(await this.payroll.employeeLines(id, query));
  }
}
