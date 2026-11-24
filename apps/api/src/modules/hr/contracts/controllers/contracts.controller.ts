import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { CONTRACT_DOCUMENT_UPLOAD } from '@school-erp/shared';
import { RateLimit } from '../../../../common/rate-limit';
import { ResponseUtil } from '../../../../common/utils/response.util';
import { Audited, NotAudited } from '../../../../core/audit';
import { Permission } from '../../../../core/permissions';
import { imageUploadInterceptor, type UploadedFileLike } from '../../../../core/settings';
import {
  DeactivateContractsDto,
  EarlyTerminationDto,
  EmployeeContractsQueryDto,
  EndContractDto,
  ListContractsQueryDto,
  NotRenewContractDto,
  PutSchoolCalendarDto,
  RejectEarlyTerminationDto,
  RenewContractsDto,
  WithdrawNoticeDto,
} from '../dto/contracts.dto';
import { ContractsService } from '../services/contracts.service';
import { SchoolCalendarService } from '../services/school-calendar.service';

const DocumentUploadInterceptor = imageUploadInterceptor(CONTRACT_DOCUMENT_UPLOAD.maxBytes);

/** A contract year in a path: `2026` = 2026/27. */
const YearPipe = new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST });

/**
 * Contracts (spec 2026-11-24): the renewal season and every decision on a contract. No DELETE: a
 * contract is kept forever. Each write is one audit entry on the contract (§9); none may be about
 * the actor's own contract (403 `OWN_CONTRACT`).
 */
@Controller('hr/contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @Permission('hr.contracts.view')
  list(@Query() query: ListContractsQueryDto) {
    return this.contracts.list(query);
  }

  /** All or nothing (edge case 3). */
  @Audited('hr.contract.renew')
  @Post('renew')
  @Permission('hr.contracts.manage')
  @HttpCode(HttpStatus.OK)
  renew(@Body() dto: RenewContractsDto) {
    return this.contracts.renew(dto.contractIds);
  }

  /** The "To deactivate" employees, all or nothing — also needs the right to deactivate. */
  @Audited('hr.employee.deactivate')
  @Post('deactivate')
  @Permission('hr.contracts.manage', 'hr.employees.change_status')
  @HttpCode(HttpStatus.OK)
  deactivate(@Body() dto: DeactivateContractsDto) {
    return this.contracts.deactivate(dto.contractIds);
  }

  @Audited('hr.contract.not_renew')
  @Post(':id/not-renewed')
  @Permission('hr.contracts.manage')
  @HttpCode(HttpStatus.OK)
  notRenew(@Param('id', ParseUUIDPipe) id: string, @Body() dto: NotRenewContractDto) {
    return this.contracts.notRenew(id, dto);
  }

  @Audited('hr.contract.notice_withdraw')
  @Post(':id/notice/withdraw')
  @Permission('hr.contracts.manage')
  @HttpCode(HttpStatus.OK)
  withdrawNotice(@Param('id', ParseUUIDPipe) id: string, @Body() dto: WithdrawNoticeDto) {
    return this.contracts.withdrawNotice(id, dto.reason);
  }

  @Audited('hr.contract.early_termination_request')
  @Post(':id/early-termination')
  @Permission('hr.contracts.manage')
  @HttpCode(HttpStatus.OK)
  requestEarlyTermination(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EarlyTerminationDto) {
    return this.contracts.requestEarlyTermination(id, dto);
  }

  @Audited('hr.contract.early_termination_approve')
  @Post(':id/early-termination/approve')
  @Permission('hr.contracts.manage')
  @HttpCode(HttpStatus.OK)
  approveEarlyTermination(@Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.approveEarlyTermination(id);
  }

  @Audited('hr.contract.early_termination_reject')
  @Post(':id/early-termination/reject')
  @Permission('hr.contracts.manage')
  @HttpCode(HttpStatus.OK)
  rejectEarlyTermination(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectEarlyTerminationDto) {
    return this.contracts.rejectEarlyTermination(id, dto.reason);
  }

  @Audited('hr.contract.end')
  @Post(':id/end')
  @Permission('hr.contracts.manage')
  @HttpCode(HttpStatus.OK)
  end(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EndContractDto) {
    return this.contracts.end(id, dto);
  }

  /** Multipart `file`: PDF, PNG, JPG or WebP, up to 5 MB. Returns where it is stored. */
  @NotAudited('stores a document nobody can open yet; attaching it to the contract is the audited decision')
  @Post(':id/files')
  @RateLimit('heavy')
  @Permission('hr.contracts.manage')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(DocumentUploadInterceptor)
  upload(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: UploadedFileLike | undefined) {
    return this.contracts.uploadDocument(id, file);
  }
}

/** `GET /hr/employees/:id/contracts` — one employee's history (their Contracts tab). */
@Controller('hr/employees')
export class EmployeeContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get(':id/contracts')
  @Permission('hr.contracts.view')
  async list(@Param('id', ParseUUIDPipe) id: string, @Query() query: EmployeeContractsQueryDto) {
    return ResponseUtil.paginated(await this.contracts.employeeContracts(id, query));
  }
}

/** `/hr/settings/school-calendar/:year` — the school calendar of one contract year (§7). */
@Controller('hr/settings/school-calendar')
export class SchoolCalendarController {
  constructor(private readonly calendars: SchoolCalendarService) {}

  @Get(':year')
  @Permission('hr.settings.view')
  get(@Param('year', YearPipe) year: number) {
    return this.calendars.get(year);
  }

  @Audited('hr.school_calendar.update')
  @Put(':year')
  @Permission('hr.settings.edit')
  put(@Param('year', YearPipe) year: number, @Body() dto: PutSchoolCalendarDto) {
    return this.calendars.put(year, dto);
  }
}
