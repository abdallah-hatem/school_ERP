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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { EMPLOYEE_PHOTO_UPLOAD } from '@school-erp/shared';
import { RateLimit } from '../../../../common/rate-limit';
import { ResponseUtil } from '../../../../common/utils/response.util';
import { CreateEmployeeDto, ListEmployeesQueryDto, UpdateEmployeeDto } from '../dto/employee.dto';
import { EmployeesService } from '../services/employees.service';
import { Audited } from '../../../../core/audit';
import { Permission } from '../../../../core/permissions';
import { imageUploadInterceptor, type UploadedFileLike } from '../../../../core/settings';

const PhotoUploadInterceptor = imageUploadInterceptor(EMPLOYEE_PHOTO_UPLOAD.maxBytes);

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

  @Audited('hr.employee.create')
  @Post()
  @Permission('hr.employees.create')
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @Audited('hr.employee.update')
  @Patch(':id')
  @Permission('hr.employees.edit')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(id, dto);
  }

  @Audited('hr.employee.deactivate')
  @Post(':id/deactivate')
  @Permission('hr.employees.change_status')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.deactivate(id);
  }

  @Audited('hr.employee.reactivate')
  @Post(':id/reactivate')
  @Permission('hr.employees.change_status')
  @HttpCode(HttpStatus.OK)
  reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.reactivate(id);
  }

  /** Multipart `file`: PNG, JPG or WebP, up to 2 MB (§3). Returns the employee. */
  @Audited('hr.employee.update')
  @Post(':id/photo')
  @RateLimit('heavy')
  @Permission('hr.employees.edit')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(PhotoUploadInterceptor)
  uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedFileLike | undefined,
  ) {
    return this.employees.setPhoto(id, file);
  }

  @Audited('hr.employee.update')
  @Delete(':id/photo')
  @Permission('hr.employees.edit')
  removePhoto(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.removePhoto(id);
  }
}
