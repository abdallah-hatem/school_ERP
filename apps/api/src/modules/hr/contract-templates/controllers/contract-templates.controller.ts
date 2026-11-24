import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
import { ResponseUtil } from '../../../../common/utils/response.util';
import { Audited } from '../../../../core/audit';
import { Permission } from '../../../../core/permissions';
import { ContractPrintService } from '../../contracts/services/contract-print.service';
import {
  CreateContractTemplateDto,
  ListContractTemplatesQueryDto,
  TemplatePreviewQueryDto,
  UpdateContractTemplateDto,
} from '../dto/contract-templates.dto';
import { ContractTemplatesService } from '../services/contract-templates.service';

const VersionPipe = new ParseIntPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST });

/**
 * Settings → HR → Contract templates (spec 2026-11-24-contract-templates). One key,
 * `hr.contract_templates.manage` (whole school). No DELETE: a template is only hidden. Each write
 * is one `hr.contract_template.*` entry.
 */
@Controller('hr/contract-templates')
export class ContractTemplatesController {
  constructor(
    private readonly templates: ContractTemplatesService,
    private readonly print: ContractPrintService,
  ) {}

  @Get()
  @Permission('hr.contract_templates.manage')
  async list(@Query() query: ListContractTemplatesQueryDto) {
    return ResponseUtil.paginated(await this.templates.list(query));
  }

  /**
   * "Preview with an employee": the values of their current contract, read-only, nothing kept.
   * Also needs `hr.contracts.view` covering the employee; salary only with salary access.
   */
  @Get('preview')
  @Permission('hr.contract_templates.manage', 'hr.contracts.view')
  preview(@Query() query: TemplatePreviewQueryDto) {
    return this.print.templatePreview(query.employeeId, query.language);
  }

  @Get(':id')
  @Permission('hr.contract_templates.manage')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.get(id);
  }

  @Get(':id/versions')
  @Permission('hr.contract_templates.manage')
  async versions(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return ResponseUtil.paginated(await this.templates.versions(id, query));
  }

  @Get(':id/versions/:version')
  @Permission('hr.contract_templates.manage')
  version(@Param('id', ParseUUIDPipe) id: string, @Param('version', VersionPipe) version: number) {
    return this.templates.version(id, version);
  }

  @Audited('hr.contract_template.create')
  @Post()
  @Permission('hr.contract_templates.manage')
  create(@Body() dto: CreateContractTemplateDto) {
    return this.templates.create(dto);
  }

  @Audited('hr.contract_template.update')
  @Put(':id')
  @Permission('hr.contract_templates.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContractTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Audited('hr.contract_template.hide')
  @Post(':id/hide')
  @Permission('hr.contract_templates.manage')
  @HttpCode(HttpStatus.OK)
  hide(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.hide(id);
  }

  @Audited('hr.contract_template.show')
  @Post(':id/show')
  @Permission('hr.contract_templates.manage')
  @HttpCode(HttpStatus.OK)
  show(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.show(id);
  }
}
