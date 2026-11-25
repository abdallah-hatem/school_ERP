import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
import { RateLimit } from '../../../../common/rate-limit';
import { ResponseUtil } from '../../../../common/utils/response.util';
import { NotAudited } from '../../../../core/audit';
import { Permission } from '../../../../core/permissions';
import { ContractPrintQueryDto, CreateContractCopyDto } from '../dto/contract-print.dto';
import { ContractPrintService } from '../services/contract-print.service';

/**
 * Printing a contract from a template, and its kept copies (spec 2026-11-24-contract-templates).
 * Printing: `hr.contracts.manage` (+ `hr.contracts.view` covering the employee, checked in the
 * service), never one's own contract. Reading copies: `hr.contracts.view`.
 */
@Controller('hr/contracts')
export class ContractPrintController {
  constructor(private readonly print: ContractPrintService) {}

  /** The print picker: shown templates, the employee's work-system default marked. */
  @Get(':id/print-templates')
  @Permission('hr.contracts.manage')
  async templates(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return ResponseUtil.paginated(await this.print.printTemplates(id, query));
  }

  /** The dialog's preview: the text, the values filled now, warnings, the hash, earlier copies. */
  @Get(':id/print')
  @Permission('hr.contracts.manage')
  preview(@Param('id', ParseUUIDPipe) id: string, @Query() query: ContractPrintQueryDto) {
    return this.print.preview(id, query.templateId, query.language);
  }

  /**
   * Makes and keeps a copy. The PDF is rendered first (up to 20 s, at most two at a time), outside
   * any transaction — an `@Audited` handler would hold a pooled connection, inside a 15 s
   * transaction, for the whole render and queue (docs/ARCHITECTURE.md → one pooled connection at a
   * time). The service then records `hr.contract.copy_print` in the copy's own transaction, like
   * `POST /account/password`.
   */
  @NotAudited('renders the PDF before any transaction; ContractPrintService.createCopy records hr.contract.copy_print in the copy’s own transaction')
  @Post(':id/copies')
  @RateLimit('heavy')
  @Permission('hr.contracts.manage')
  createCopy(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateContractCopyDto) {
    return this.print.createCopy(id, dto);
  }

  @Get(':id/copies')
  @Permission('hr.contracts.view')
  async copies(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return ResponseUtil.paginated(await this.print.listCopies(id, query));
  }
}
