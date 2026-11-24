import {
  CONTRACT_LANGUAGES,
  WORK_SYSTEMS,
  type ContractDocument,
  type ContractLanguage,
  type CreateContractTemplateRequest,
  type UpdateContractTemplateRequest,
  type WorkSystem,
} from '@school-erp/shared';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** `?hidden=true` → true; anything else → false. */
const flag = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

/** `GET /hr/contract-templates` — server-paged, searched by either name. */
export class ListContractTemplatesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(flag)
  @IsBoolean()
  hidden?: boolean;
}

/**
 * `POST /hr/contract-templates`. The texts are checked by the shared document schema in the service
 * (`parseContractDocument`: nodes, fields, phrases, 200 KB) — here only that they are objects.
 */
export class CreateContractTemplateDto implements CreateContractTemplateRequest {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameEn!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nameAr!: string;

  @ValidateIf((_, v) => v !== null)
  @IsIn(WORK_SYSTEMS)
  defaultForWorkSystem!: WorkSystem | null;

  @IsObject()
  bodyAr!: ContractDocument;

  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsObject()
  bodyEn!: ContractDocument | null;
}

/** `PUT /hr/contract-templates/:id` — `baseVersion`: the version the editor loaded. */
export class UpdateContractTemplateDto extends CreateContractTemplateDto implements UpdateContractTemplateRequest {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  baseVersion!: number;
}

/** `GET /hr/contract-templates/preview?employeeId=&language=` — "Preview with an employee". */
export class TemplatePreviewQueryDto {
  @IsUUID()
  employeeId!: string;

  @IsIn(CONTRACT_LANGUAGES)
  language!: ContractLanguage;
}
