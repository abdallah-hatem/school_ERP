import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { CONTRACT_SIGNED_COPY_UPLOAD } from '@school-erp/shared';
import { RateLimit } from '../../../../common/rate-limit';
import { Audited } from '../../../../core/audit';
import { Permission } from '../../../../core/permissions';
import { imageUploadInterceptor } from '../../../../core/settings';
import { RemoveSignedCopyFileDto } from '../dto/contracts.dto';
import { ContractSignedCopyService, type UploadedPage } from '../services/contract-signed-copy.service';

const PageUploadInterceptor = imageUploadInterceptor(CONTRACT_SIGNED_COPY_UPLOAD.maxBytes);

/**
 * `/hr/contracts/:id/signed-copy` — the contract's signed copy, one file per page (owner,
 * 2026-11-24). No DELETE: a removed page is kept, with who removed it and why. Every write is one
 * audit entry on the contract; none on the actor's own contract (403 `OWN_CONTRACT`).
 */
@Controller('hr/contracts')
export class ContractSignedCopyController {
  constructor(private readonly signedCopy: ContractSignedCopyService) {}

  @Get(':id/signed-copy')
  @Permission('hr.contracts.view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.signedCopy.get(id);
  }

  /** Multipart `file`: PDF, PNG, JPG or WebP, up to 10 MB — one page, added at the end. */
  @Audited('hr.contract.signed_copy_add')
  @Post(':id/signed-copy')
  @RateLimit('heavy')
  @Permission('hr.contracts.manage')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(PageUploadInterceptor)
  add(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: UploadedPage | undefined) {
    return this.signedCopy.add(id, file);
  }

  @Audited('hr.contract.signed_copy_remove')
  @Post(':id/signed-copy/:fileId/remove')
  @Permission('hr.contracts.manage')
  @HttpCode(HttpStatus.OK)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Body() dto: RemoveSignedCopyFileDto,
  ) {
    return this.signedCopy.remove(id, fileId, dto.reason);
  }
}
