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
import { ResponseUtil } from '../../../../common/utils/response.util';
import { CreateEmployeeDto, ListEmployeesQueryDto, UpdateEmployeeDto } from '../dto/employee.dto';
import { EmployeesService } from '../services/employees.service';
import { NotAudited } from '../../../../core/audit';
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

  /** Multipart `file`: PNG, JPG or WebP, up to 2 MB (§3). Returns the employee. */
  @NotAudited('wired in T28')
  @Post(':id/photo')
  @Permission('hr.employees.edit')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(PhotoUploadInterceptor)
  uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedFileLike | undefined,
  ) {
    return this.employees.setPhoto(id, file);
  }

  @NotAudited('wired in T28')
  @Delete(':id/photo')
  @Permission('hr.employees.edit')
  removePhoto(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.removePhoto(id);
  }
}
